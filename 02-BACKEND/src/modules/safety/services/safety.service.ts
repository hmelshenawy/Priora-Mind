import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConsentService } from '../auth/consent.service';
import {
  OnboardingGuardService,
  type OnboardingGuardContext,
} from '../profile/onboarding.guard';
import {
  SAFETY_COPY,
  SAFETY_DEFINITION_VERSION,
  type SafetyLevel,
  type Sq01Code,
  type Sq02Code,
  type Sq03Code,
  type TriggerContext,
} from './safety-definition';
import { classifySafety, type ClassifierDomainScore } from './safety-classifier';
import { SafetyUnavailableException, errName } from './safety.errors';
import { buildSafetyRoute } from './safety-route';
import type {
  SafetyHoldResponse,
  SafetyRoute,
} from './safety.dto';

/**
 * SafetyService (FR-019a/FR-019b/FR-020..FR-025, Safety Matrix §4/§6/§9/§10, research
 * D9). Wraps the pure `classifySafety` classifier with: immutable append-only
 * `SafetyEvaluation` persistence (is_current on latest), copy/resource/action
 * resolution, routing state transitions, and the SAFETY_HOLD page. Deterministic —
 * no AI (FR-020, SAD ADR-006). Fails CLOSED (FR-025).
 *
 * The re-entry flow (POST /safety/reentry) lives in `SafetyReentryService`, which
 * delegates persistence/guard/transition to this service (Constitution VIII split).
 *
 * Cross-module state (OnboardingState, Assessment state) is written via Prisma
 * directly here, mirroring the codebase pattern (assessment-lifecycle writes
 * OnboardingState directly). Safety never imports AssessmentModule → no circular DI;
 * AssessmentModule imports SafetyModule to call this service.
 *
 * NEVER persists/returns raw safety answers or reasons to logs/analytics (FR-030,
 * Safety Matrix §10). The `level` is the only coarse routing tag. Historical
 * evaluations are immutable until deletion (FR-031, Safety Matrix §9).
 */
@Injectable()
export class SafetyService {
  private readonly logger = new Logger('SafetyService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly guard: OnboardingGuardService,
  ) {}

  // ───────────────────────── per-answer evaluation ─────────────────────────

  /** Evaluate after a saved safety answer (FR-019a, Safety Matrix §4). Only
   * HIGH_RISK/CRISIS produce a persisted evaluation + routing change (interrupt);
   * NORMAL/DISTRESS continue without a row (the final gating evaluation is taken at
   * submit). Returns the route when interrupted, else null. Fail-closed (503). */
  async evaluatePerAnswer(
    userId: string,
    assessmentId: string,
    sqAnswers: Partial<{ 'SQ-01': Sq01Code; 'SQ-02': Sq02Code; 'SQ-03': Sq03Code }>,
  ): Promise<{ level: SafetyLevel; safetyRoute: SafetyRoute | null }> {
    try {
      const { level } = classifySafety({ safety_answers: sqAnswers });
      if (level !== 'HIGH_RISK' && level !== 'CRISIS') return { level, safetyRoute: null };
      const now = new Date();
      await this.persistEvaluation(userId, assessmentId, level, [], 'per_answer', now);
      await this.applyRouting(userId, assessmentId, level, now);
      return { level, safetyRoute: buildSafetyRoute(level) };
    } catch (e) {
      if (e instanceof SafetyUnavailableException) throw e;
      this.logger.error(`safety per-answer evaluation failed: ${errName(e)}`);
      throw new SafetyUnavailableException();
    }
  }

  // ───────────────────────── on-submit evaluation ─────────────────────────

  /** Final gating evaluation on the complete answer set (FR-019a, Safety Matrix §4).
   * Runs the classifier WITH domain scores (distress pattern). Persists the final
   * SafetyEvaluation (triggerContext=on_submit) and returns its id + level. The caller
   * acts on the level: HIGH_RISK/CRISIS → suppress result + 409; DISTRESS → result +
   * distress_note; NORMAL → result. Fail-closed (503). */
  async evaluateOnSubmit(
    userId: string,
    assessmentId: string,
    sqAnswers: Partial<{ 'SQ-01': Sq01Code; 'SQ-02': Sq02Code; 'SQ-03': Sq03Code }>,
    domainScores: Record<string, ClassifierDomainScore>,
  ): Promise<{ level: SafetyLevel; safetyEvaluationId: string }> {
    try {
      const { level, reasons } = classifySafety({
        safety_answers: sqAnswers,
        domain_scores: domainScores,
      });
      const now = new Date();
      const row = await this.persistEvaluation(userId, assessmentId, level, reasons, 'on_submit', now);
      // Defensive: if the final evaluation is HIGH_RISK/CRISIS (should not happen on
      // the NORMAL path, which is the only path that reaches submit), apply routing.
      if (level === 'HIGH_RISK' || level === 'CRISIS') {
        await this.applyRouting(userId, assessmentId, level, now);
      }
      return { level, safetyEvaluationId: row.id };
    } catch (e) {
      if (e instanceof SafetyUnavailableException) throw e;
      this.logger.error(`safety on-submit evaluation failed: ${errName(e)}`);
      throw new SafetyUnavailableException();
    }
  }

  // ───────────────────────── current routing ─────────────────────────

  /** The current `safety_route` from the latest is_current evaluation, or null when
   * the current level is not HIGH_RISK/CRISIS. Used to enrich GET /assessment + the
   * submit 409 (FR-019b, contracts/assessment.md). */
  async currentRoute(userId: string): Promise<SafetyRoute | null> {
    const current = await this.prisma.safetyEvaluation.findFirst({
      where: { userId, isCurrent: true },
      orderBy: { evaluatedAt: 'desc' },
    });
    if (!current || (current.level !== 'HIGH_RISK' && current.level !== 'CRISIS')) return null;
    return buildSafetyRoute(current.level as 'HIGH_RISK' | 'CRISIS');
  }

  /** The latest is_current evaluation level (any), or null. Used to resolve the
   * DISTRESS supportive messaging at submit/getResult (Safety §6). */
  async currentLevel(userId: string): Promise<SafetyLevel | null> {
    const current = await this.prisma.safetyEvaluation.findFirst({
      where: { userId, isCurrent: true },
      orderBy: { evaluatedAt: 'desc' },
    });
    return current ? (current.level as SafetyLevel) : null;
  }

  // ───────────────────────── SAFETY_HOLD page ─────────────────────────

  /** `GET /safety/hold` data (contracts/safety.md). Shows the latest current
   * evaluation's copy + the immutable historical list (never relabeled, Safety §9). */
  async getHold(userId: string): Promise<SafetyHoldResponse> {
    await this.assertCanEnter(userId);
    const rows = await this.prisma.safetyEvaluation.findMany({
      where: { userId },
      orderBy: { evaluatedAt: 'desc' },
    });
    const current = rows.find((r) => r.isCurrent) ?? rows[0] ?? null;
    const level = (current?.level ?? 'NORMAL') as SafetyLevel;
    // NORMAL/DISTRESS have no dedicated safety copy; the hold page is only reached
    // while in SAFETY_HOLD (HIGH_RISK/CRISIS current). Fall back to UNAVAILABLE copy
    // defensively if the current level is unexpectedly not HIGH_RISK/CRISIS.
    const copyKey = level === 'HIGH_RISK' || level === 'CRISIS' ? level : 'UNAVAILABLE';
    return {
      level,
      copy: { en: SAFETY_COPY[copyKey].en, ar: SAFETY_COPY[copyKey].ar },
      historical: rows.map((r) => ({
        level: r.level as SafetyLevel,
        evaluated_at: r.evaluatedAt.toISOString(),
        trigger_context: r.triggerContext as TriggerContext,
        definition_version: r.definitionVersion,
      })),
      can_initiate_reentry: true,
    };
  }

  // ───────────────────────── helpers (shared with re-entry) ─────────────────────────

  /** Backend guard for the safety_hold step (FR-006, T033): requires EMAIL_VERIFIED +
   * granted consent (mirrors the assessment services). Route guards are UX only.
   * Public so `SafetyReentryService` can reuse the same guard. */
  async assertCanEnter(userId: string): Promise<void> {
    const ctx = await this.contextFor(userId);
    this.guard.assertCanEnter('safety_hold', ctx);
  }

  private async contextFor(userId: string): Promise<OnboardingGuardContext> {
    const row = await this.prisma.onboardingState.findFirst({ where: { userId } });
    const consentGranted = await this.consent.hasGrantedCurrentConsent(userId);
    return {
      userId,
      onboardingState: row?.state ?? 'NOT_STARTED',
      emailVerified: true, // EmailVerifiedGuard enforced at the route
      consentGranted,
    };
  }

  /** Append-only persist: flip the prior is_current row to false, then create the new
   * evaluation with is_current=true (research D9, FR-031). Wrapped in a transaction so
   * only the latest completed evaluation is current. Never edits historical rows.
   * Public so `SafetyReentryService` reuses the single append-only path. */
  async persistEvaluation(
    userId: string,
    assessmentId: string | null,
    level: SafetyLevel,
    reasons: string[],
    triggerContext: TriggerContext,
    now: Date,
  ) {
    const prior = await this.prisma.safetyEvaluation.findFirst({
      where: { userId, isCurrent: true },
    });
    const created = await this.prisma.$transaction(async (tx) => {
      if (prior) {
        await tx.safetyEvaluation.update({ where: { id: prior.id }, data: { isCurrent: false } });
      }
      return tx.safetyEvaluation.create({
        data: {
          userId,
          assessmentId,
          definitionVersion: SAFETY_DEFINITION_VERSION,
          level,
          reasons,
          triggerContext,
          isCurrent: true,
          evaluatedAt: now,
        },
      });
    });
    return created;
  }

  /** Apply HIGH_RISK/CRISIS routing (Safety Matrix §6). HIGH_RISK → assessment
   * SUSPENDED (answers retained) + onboarding SAFETY_HOLD (resume_available=true via the
   * route). CRISIS → onboarding SAFETY_HOLD (resume_available=false); the assessment
   * stays IN_PROGRESS ("INTERRUPTED" — a conceptual label in the route, not a DB state). */
  private async applyRouting(
    userId: string,
    assessmentId: string,
    level: 'HIGH_RISK' | 'CRISIS',
    now: Date,
  ): Promise<void> {
    if (level === 'HIGH_RISK') {
      await this.prisma.assessment.updateMany({
        where: { id: assessmentId, state: { in: ['IN_PROGRESS', 'NOT_STARTED'] } },
        data: { state: 'SUSPENDED', lastActivityAt: now },
      });
    }
    // CRISIS: leave the assessment in IN_PROGRESS (interrupted); do not transition to SUSPENDED.
    await this.setOnboardingState(userId, 'SAFETY_HOLD', 'safety_hold', now);
  }

  /** Conditional onboarding-state transition (only when currently SAFETY_HOLD or
   * ASSESSMENT_IN_PROGRESS). Public so `SafetyReentryService` can resume the
   * assessment's onboarding state. */
  async setOnboardingState(
    userId: string,
    state: 'SAFETY_HOLD' | 'ASSESSMENT_IN_PROGRESS',
    currentStep: 'safety_hold' | 'assessment',
    now: Date,
  ): Promise<void> {
    const existing = await this.prisma.onboardingState.findFirst({ where: { userId } });
    if (!existing) return;
    if (existing.state !== 'SAFETY_HOLD' && existing.state !== 'ASSESSMENT_IN_PROGRESS') return;
    await this.prisma.onboardingState.update({
      where: { id: existing.id },
      data: { state: state as never, currentStep, updatedAt: now, lastActivityAt: now },
    });
  }
}