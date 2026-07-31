import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { toSafeLogContext } from '../../common/redact';
import { AUTH_DELETION_PORT, type AuthDeletionPort } from '../auth/ports/auth-deletion.port';
import { PROFILE_DELETION_PORT, type ProfileDeletionPort } from '../profile/ports/profile-deletion.port';
import {
  ASSESSMENT_DELETION_PORT,
  type AssessmentDeletionPort,
} from '../assessment/ports/assessment-deletion.port';
import { SAFETY_DELETION_PORT, type SafetyDeletionPort } from '../safety/ports/safety-deletion.port';

/**
 * Scheduled retention-cleanup job (Polish, research D10, data-model §14, Consent
 * policy §8). A platform RetentionModule owns this daily @Cron orchestrator. It
 * NEVER touches other modules' tables directly (SAD §5 / ADR-005) — each module
 * exposes a narrow deletion contract returning only sanitized integer counters
 * (FR-030, research D7).
 *
 * Determinism: each run hard-deletes rows whose `last_activity_at` (or
 * `created_at` for unverified accounts) is older than the category-specific cutoff.
 * Idempotency: the DELETE predicate makes re-running a no-op on already-deleted
 * rows, and the single DeletionLog row (keyed by `confirmationId` = the run window)
 * is the dedup marker for that window — a same-window re-run returns early.
 *
 * Failure handling: each category runs independently; a category failure is caught
 * and counted (status `partial`); whole-job failure re-runs next tick (status
 * `failed`). Premature deletion is the only unsafe outcome and the cutoff
 * predicate prevents it.
 *
 * Observability: emits ONLY `{ window, category, deleted_count, error_count,
 * run_ms }` via the central safe-context allowlist (research D7) — no email,
 * answers, scores, safety answers/levels, or consent contents are ever logged.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_DELETION_PORT) private readonly auth: AuthDeletionPort,
    @Inject(PROFILE_DELETION_PORT) private readonly profile: ProfileDeletionPort,
    @Inject(ASSESSMENT_DELETION_PORT) private readonly assessment: AssessmentDeletionPort,
    @Inject(SAFETY_DELETION_PORT) private readonly safety: SafetyDeletionPort,
  ) {}

  /** Daily scheduled retention cleanup (Consent §8). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runScheduledRetention(now = new Date()): Promise<RunOutcome> {
    return this.run(now, 'scheduled_retention', () => this.scheduledCutoffs(now), (c) =>
      this.runScheduledCategories(now, c),
    );
  }

  /** Compute the deterministic scheduled cutoffs (exposed for unit tests). */
  scheduledCutoffs(now: Date): ScheduledCutoffs {
    return {
      auth: {
        unverifiedAccountBefore: daysAgo(now, UNVERIFIED_DAYS),
        preConsentAccountBefore: daysAgo(now, INACTIVITY_DAYS),
      },
      profile: { onboardingBefore: daysAgo(now, INACTIVITY_DAYS) },
      assessment: { incompleteBefore: daysAgo(now, INACTIVITY_DAYS) },
      safety: { incompleteBefore: daysAgo(now, INACTIVITY_DAYS) },
    };
  }

  // ─────────────────────────── shared run core ───────────────────────────
  /** Shared run loop used by both scheduled retention and account deletion so the
   * DeletionLog shape, idempotency dedup, and safe observability are identical. */
  async run<C>(
    now: Date,
    runKind: 'scheduled_retention' | 'account_deletion',
    cutoffs: () => C,
    exec: (c: C) => Promise<CategoryCounts>,
  ): Promise<RunOutcome> {
    const start = new Date();
    const confirmationId = `${runKind}:${now.toISOString().slice(0, 10)}`;
    // Idempotency dedup: the DeletionLog row is the marker for this run window.
    const prior = (await this.prisma.deletionLog.findMany({ where: { runKind } })).find(
      (r) => r.confirmationId === confirmationId,
    );
    if (prior) return { status: prior.status, confirmationId };

    const c = cutoffs();
    let counts: CategoryCounts;
    try {
      counts = await exec(c);
    } catch (err) {
      // Whole-job failure (e.g. DB unreachable) — re-runs next tick; never claim completion.
      this.logger.warn(`retention run ${runKind} failed: ${errName(err)}`);
      await this.writeLog(runKind, start, new Date(), EMPTY_COUNTS, 'failed', confirmationId, errName(err));
      return { status: 'failed', confirmationId };
    }
    const status = sumErrors(counts) === 0 ? 'completed' : 'partial';
    await this.writeLog(runKind, start, new Date(), counts, status, confirmationId, null);
    return { status, confirmationId };
  }

  private async runScheduledCategories(_now: Date, c: ScheduledCutoffs): Promise<CategoryCounts> {
    const window = `scheduled_retention:${_now.toISOString().slice(0, 10)}`;
    return {
      auth: await this.runCategory('auth', window, () => this.auth.deleteExpired(c.auth)),
      profile: await this.runCategory('profile', window, () => this.profile.deleteExpired(c.profile)),
      assessment: await this.runCategory('assessment', window, () =>
        this.assessment.deleteExpired(c.assessment),
      ),
      safety: await this.runCategory('safety', window, () => this.safety.deleteExpired(c.safety)),
      // No consent cutoff on the scheduled cron: superseded consent rows are retained
      // while the account exists and removed on account deletion (Consent §8).
      consent: { deleted: 0, errors: 0 },
    };
  }

  /** Run one category independently; a failure is caught + counted, never blocking
   * the others (research D10). Emits only sanitized counters to the log. */
  private async runCategory(
    category: string,
    window: string,
    fn: () => Promise<CategoryCounters>,
  ): Promise<CategoryCounters> {
    const t0 = Date.now();
    try {
      const counters = await fn();
      this.logger.log(
        toSafeLogContext({
          window,
          category,
          deleted_count: counters.deleted,
          error_count: counters.errors,
          run_ms: Date.now() - t0,
        }),
      );
      return counters;
    } catch (err) {
      this.logger.warn(
        toSafeLogContext({
          window,
          category,
          deleted_count: 0,
          error_count: 1,
          run_ms: Date.now() - t0,
        }),
      );
      return { deleted: 0, errors: 1 };
    }
  }

  private async writeLog(
    runKind: 'scheduled_retention' | 'account_deletion',
    windowStart: Date,
    windowEnd: Date,
    counts: CategoryCounts,
    status: 'completed' | 'partial' | 'failed',
    confirmationId: string,
    errorSummary: string | null,
  ): Promise<void> {
    await this.prisma.deletionLog.create({
      data: {
        runKind,
        windowStart,
        windowEnd,
        categoryCounts: counts as unknown as object,
        errorSummary: status === 'failed' ? errorSummary : status === 'partial' ? 'partial_category_errors' : null,
        status,
        confirmationId,
      },
    });
  }
}

// ─────────────────────────── helpers / types ───────────────────────────

const UNVERIFIED_DAYS = 7;
const INACTIVITY_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * MS_PER_DAY);
}

export type CategoryCounters = { deleted: number; errors: number };
export type CategoryCounts = {
  auth: CategoryCounters;
  profile: CategoryCounters;
  assessment: CategoryCounters;
  safety: CategoryCounters;
  consent: CategoryCounters;
};
export type RunOutcome = { status: 'completed' | 'partial' | 'failed'; confirmationId: string };
export type ScheduledCutoffs = {
  auth: { unverifiedAccountBefore: Date; preConsentAccountBefore: Date };
  profile: { onboardingBefore: Date };
  assessment: { incompleteBefore: Date };
  safety: { incompleteBefore: Date };
};

const EMPTY_COUNTS: CategoryCounts = {
  auth: { deleted: 0, errors: 0 },
  profile: { deleted: 0, errors: 0 },
  assessment: { deleted: 0, errors: 0 },
  safety: { deleted: 0, errors: 0 },
  consent: { deleted: 0, errors: 0 },
};

function sumErrors(counts: CategoryCounts): number {
  return counts.auth.errors + counts.profile.errors + counts.assessment.errors + counts.safety.errors + counts.consent.errors;
}

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown';
}