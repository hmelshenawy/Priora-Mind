import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toSafeLogContext } from '../../common/redact';
import { AUTH_DELETION_PORT, type AuthDeletionPort } from '../auth/ports/auth-deletion.port';
import { PROFILE_DELETION_PORT, type ProfileDeletionPort } from '../profile/ports/profile-deletion.port';
import {
  ASSESSMENT_DELETION_PORT,
  type AssessmentDeletionPort,
} from '../assessment/ports/assessment-deletion.port';
import { COACHING_DELETION_PORT, type CoachingDeletionPort } from '../coaching/ports/coaching-deletion.port';
import { SAFETY_DELETION_PORT, type SafetyDeletionPort } from '../safety/ports/safety-deletion.port';

/**
 * User-initiated account deletion (Consent policy §9, FR-031, research D10).
 *
 * Reuses the SAME per-module deletion contracts as the scheduled retention job so
 * there is exactly one deletion path per entity (data-model §14). The flow:
 *  1. Mark `UserAccount.deletedAt = now` on acceptance → blocks new processing
 *     (login/consent/assessment reject a deleted account) BEFORE any data is
 *     touched (Consent §9 "prevent new processing as soon as accepted").
 *  2. Delete per-module stores in referential order (assessment → safety → profile
 *     → consent), each via its port, collecting sanitized counters. Each port is
 *     idempotent (`WHERE userId IN (...)`) so a retry only deletes remaining rows.
 *  3. If every category reports errors===0 → hard-delete the account row via
 *     `AuthDeletionPort.deleteAccountForUsers` → status `completed`.
 *     If any category reports errors → KEEP the account (deletedAt stays set, access
 *     disabled) → status `partial`; the user is NOT told deletion is complete and a
 *     retry safely continues (Consent §12).
 *  4. Write one sanitized `DeletionLog` row (runKind `account_deletion`) — counters
 *     only, never email/answers/scores/safety/consent contents (FR-030, research D7).
 *
 * Idempotency: a re-request for an already-fully-deleted user (no account row) is a
 * no-op returning `completed`; a re-request for a partially-deleted user continues
 * deleting remaining rows. No row is ever deleted twice (DELETE predicates).
 *
 * SECURITY: this service never reads or logs answer text, scores, safety answers/
 * levels, or consent contents — only integer counts come back from the ports.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_DELETION_PORT) private readonly auth: AuthDeletionPort,
    @Inject(PROFILE_DELETION_PORT) private readonly profile: ProfileDeletionPort,
    @Inject(ASSESSMENT_DELETION_PORT) private readonly assessment: AssessmentDeletionPort,
    @Inject(COACHING_DELETION_PORT) private readonly coaching: CoachingDeletionPort,
    @Inject(SAFETY_DELETION_PORT) private readonly safety: SafetyDeletionPort,
  ) {}

  /**
   * Delete a user's full data (Consent §9). Returns a sanitized outcome — never
   * claims completion until all in-scope stores confirm. `now` is injected for
   * deterministic tests.
   */
  async requestDeletion(userId: string, now = new Date()): Promise<AccountDeletionOutcome> {
    const confirmationId = `account:${userId}:${now.toISOString()}`;
    const start = new Date();

    // Idempotent no-op: account already fully gone (prior completed request).
    const user = await this.prisma.userAccount.findUnique({ where: { id: userId } });
    if (!user) {
      return { status: 'completed', confirmation_id: confirmationId, completed: true };
    }

    // 1) Block new processing on acceptance BEFORE touching any data (Consent §9).
    if (user.deletedAt === null) {
      await this.prisma.userAccount.update({ where: { id: userId }, data: { deletedAt: now } });
    }

    // 2) Per-module deletion in referential order. Each port is idempotent.
    const counts: AccountCategoryCounts = {
      assessment: await this.run('assessment', confirmationId, () =>
        this.assessment.deleteAssessmentForUsers([userId]),
      ),
      coaching: await this.run('coaching', confirmationId, () => this.coaching.deleteCoachingForUsers([userId])),
      safety: await this.run('safety', confirmationId, () => this.safety.deleteSafetyForUsers([userId])),
      profile: await this.run('profile', confirmationId, () => this.profile.deleteProfileForUsers([userId])),
      consent: await this.run('consent', confirmationId, () => this.auth.deleteConsentForUsers([userId])),
      // `auth` (the account row) is deleted last only on full success below.
      auth: { deleted: 0, errors: 0 },
    };

    const failed = sumErrors(counts);
    let status: 'completed' | 'partial';
    if (failed === 0) {
      // 3) All stores confirmed → hard-delete the account row (cascades tokens + any
      //    leftover). The per-module counts are the source of truth; this just removes
      //    the identity row.
      counts.auth = await this.run('auth', confirmationId, () => this.auth.deleteAccountForUsers([userId]));
      status = counts.auth.errors === 0 ? 'completed' : 'partial';
    } else {
      // Partial failure → keep the account (deletedAt set, access disabled). Retry
      // continues safely; the user is NOT told deletion is complete (Consent §12).
      status = 'partial';
    }

    // 4) Sanitized DeletionLog row — counters only.
    await this.prisma.deletionLog.create({
      data: {
        runKind: 'account_deletion',
        windowStart: start,
        windowEnd: new Date(),
        categoryCounts: counts as unknown as object,
        errorSummary: status === 'partial' ? 'partial_category_errors' : null,
        status,
        confirmationId,
      },
    });

    this.logger.log(
      toSafeLogContext({
        window: confirmationId,
        category: 'account_deletion',
        deleted_count: totalCounts(counts),
        error_count: failed + counts.auth.errors,
        run_ms: Date.now() - start.getTime(),
      }),
    );

    return { status, confirmation_id: confirmationId, completed: status === 'completed' };
  }

  private async run(
    category: string,
    window: string,
    fn: () => Promise<CategoryCounters>,
  ): Promise<CategoryCounters> {
    try {
      return await fn();
    } catch {
      this.logger.warn(
        toSafeLogContext({ window, category, deleted_count: 0, error_count: 1, run_ms: 0 }),
      );
      return { deleted: 0, errors: 1 };
    }
  }
}

// ─────────────────────────── helpers / types ───────────────────────────

type CategoryCounters = { deleted: number; errors: number };
type AccountCategoryCounts = {
  auth: CategoryCounters;
  profile: CategoryCounters;
  assessment: CategoryCounters;
  coaching: CategoryCounters;
  safety: CategoryCounters;
  consent: CategoryCounters;
};
export type AccountDeletionOutcome = {
  status: 'completed' | 'partial';
  confirmation_id: string;
  completed: boolean;
};

function sumErrors(c: AccountCategoryCounts): number {
  return c.auth.errors + c.profile.errors + c.assessment.errors + c.coaching.errors + c.safety.errors + c.consent.errors;
}
function totalCounts(c: AccountCategoryCounts): number {
  return c.auth.deleted + c.profile.deleted + c.assessment.deleted + c.coaching.deleted + c.safety.deleted + c.consent.deleted;
}
