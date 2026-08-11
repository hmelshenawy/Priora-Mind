import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { SafetyService } from '../../safety/safety.public';
import { ProfileLifecycleService } from '../../profile/profile.public';
import { AssessmentAnswerStore } from './assessment-answer-store.service';
import { ASSESSMENT_DEFINITION_VERSION } from '../constants/assessment-definition';
import { type SubmitResponse } from '../dto/assessment.dto';
import {
  AssessmentCorruptException,
  AssessmentNotFoundException,
  IncompleteAssessmentException,
  ResultNotFoundException,
  SafetyHoldException,
} from '../constants/assessment.errors';
import { presentResult, type BilingualEntry, type ResultInsight } from '../dto/result-presenter';
import { ScoringService } from './scoring.service';
import {
  collectGoalFreeText,
  collectPriorities,
  extractCurrentState,
  extractSqAnswers,
  goalFreeTextInput,
  toClassifierDomainScores,
  toResultResponse,
} from '../utils/assessment-result-mapping';

/**
 * Assessment submission (FR-015, FR-034, AC-X4, research D6, contracts/assessment.md).
 * Final, idempotent submission: conditional state transition
 * `IN_PROGRESS|SUSPENDED → SUBMITTED → SCORED`, exactly one `AssessmentResult`
 * (unique on `assessment_id`), deterministic scoring via `ScoringService` (no AI,
 * no overall score — FR-016/FR-018/FR-030).
 *
 * US5 scope (NORMAL path completion):
 *  - Submit assembles the non-diagnostic coaching insight via `presentResult`
 *    (FR-017/FR-018) and transitions onboarding `ASSESSMENT_IN_PROGRESS →
 *    COMPLETED` (data-model §7 line 151: result presented → COMPLETED). The
 *    response carries the insight inline + `next: /assessment/result`.
 *  - SAFETY_HOLD suppression (FR-019b): while `OnboardingState = SAFETY_HOLD`,
 *    submit returns 409 SAFETY_HOLD (NO result) and `getResult` returns 409
 *    SAFETY_HOLD (NO insight). US5 ships the guard; US6 is what sets SAFETY_HOLD
 *    (via the deterministic safety classifier on SQ answers) and enriches the
 *    409 with the approved `safety_route`. US5 has no SQ questions yet, so the
 *    NORMAL path always runs.
 *  - Scoring stays SEPARATE from safety classification (FR-019): the insight is
 *    built only from deterministic domain scores + priorities, never from safety
 *    levels, and never sent to any AI provider (FR-030).
 */
@Injectable()
export class AssessmentSubmitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileLifecycle: ProfileLifecycleService,
    private readonly scoring: ScoringService,
    private readonly answers: AssessmentAnswerStore,
    private readonly safety: SafetyService,
  ) {}

  async submit(userId: string): Promise<SubmitResponse> {
    await this.profileLifecycle.assertCanEnterAssessment(userId);

    // US5/US6 suppression (FR-019b): never present a result or complete while
    // SAFETY_HOLD. US5 has no classifier, so this is the defensive guard US6
    // activates; the NORMAL path never hits it.
    await this.assertNotSafetyHold(userId);

    const assessment = await this.prisma.assessment.findFirst({ where: { userId } });
    if (!assessment) throw new AssessmentNotFoundException();

    // Idempotent: an existing result means a prior submit already scored — return
    // its insight (onboarding is already COMPLETED).
    const existing = await this.prisma.assessmentResult.findFirst({
      where: { assessmentId: assessment.id },
    });
    if (existing) return this.insightResponse(existing, true);

    // US8 (FR-034, SC-007): fail-closed — NEVER score stale answers collected
    // against a retired definition into a "complete" result. If the active
    // assessment's definition version no longer matches the current definition
    // and no result exists yet (i.e. not SCORED), the saved progress is
    // inconsistent — refuse submission and steer the user to a safe restart
    // (GET /assessment returns `requires_safe_restart`). No partial result is
    // presented as complete. SCORED is already handled by the existing-result
    // early return above.
    if (
      assessment.definitionVersion !== ASSESSMENT_DEFINITION_VERSION &&
      assessment.state !== 'SCORED'
    ) {
      throw new AssessmentCorruptException();
    }

    // Required-question completeness (FR-014a). SQ-* required questions land in US6;
    // US5 enforces the 16 current-state + AG-01/AG-02/AG-03 set.
    const missing = await this.answers.missingRequired(assessment.id);
    if (missing.length) throw new IncompleteAssessmentException(missing);

    // Conditional transition IN_PROGRESS|SUSPENDED → SUBMITTED (research D6).
    const now = new Date();
    const upd = await this.prisma.assessment.updateMany({
      where: { id: assessment.id, state: { in: ['IN_PROGRESS', 'SUSPENDED'] } },
      data: { state: 'SUBMITTED', submittedAt: now },
    });
    if (upd.count === 0) {
      // Race: a concurrent submit won the transition. Return its result if present.
      const race = await this.prisma.assessmentResult.findFirst({
        where: { assessmentId: assessment.id },
      });
      if (race) return this.insightResponse(race, true);
      throw new IncompleteAssessmentException([]); // fail closed
    }

    // Deterministic scoring over the saved current-state answers (no AI, FR-030).
    const answers = await this.answers.loadAnswers(assessment.id);
    const scored = this.scoring.score(extractCurrentState(answers));

    // US6 (FR-019a, Safety §4): final gating safety evaluation on the complete answer
    // set (SQ answers + domain scores for the distress pattern). Persists the final
    // SafetyEvaluation; its level drives the distress_note + the result's
    // safetyEvaluationId. Fail-closed (503 SAFETY_UNAVAILABLE) on error.
    const sqAnswers = extractSqAnswers(answers);
    const domainScores = toClassifierDomainScores(scored.domain_scores);
    const { level: finalLevel, safetyEvaluationId } = await this.safety.evaluateOnSubmit(
      userId,
      assessment.id,
      sqAnswers,
      domainScores,
    );
    // Defensive: the NORMAL path (the only path reaching submit) cannot produce
    // HIGH_RISK/CRISIS (SQ-01=S0). If it ever does, suppress the result + 409.
    if (finalLevel === 'HIGH_RISK' || finalLevel === 'CRISIS') {
      const route = await this.safety.currentRoute(userId);
      throw new SafetyHoldException(route ?? undefined);
    }
    const distressNote: BilingualEntry | null =
      finalLevel === 'DISTRESS' ? this.safety.distressSupportCopy() : null;

    const result = await this.prisma.assessmentResult.create({
      data: {
        assessmentId: assessment.id,
        userId,
        definitionVersion: assessment.definitionVersion,
        domainScores: scored.domain_scores as unknown as Prisma.InputJsonValue,
        strongestDomain: scored.strongest_domain,
        supportDomain: scored.support_domain,
        selectedPriorities: collectPriorities(answers) as unknown as Prisma.InputJsonValue,
        goalFreeText: goalFreeTextInput(collectGoalFreeText(answers)),
        safetyEvaluationId, // US6: the final gating SafetyEvaluation
      },
    });

    await this.prisma.assessment.update({
      where: { id: assessment.id },
      data: { state: 'SCORED' },
    });
    // US5: result presented → COMPLETED (data-model §7 line 151, FR-018).
    await this.profileLifecycle.markAssessmentComplete(userId, now);

    return this.insightResponse(result, false, distressNote);
  }

  /** Non-diagnostic coaching insight read (US5, FR-017/FR-018). Suppressed while
   * SAFETY_HOLD (409, FR-019b); 404 when no result yet. After COMPLETED this
   * endpoint's read remains available (the result is shown once at the
   * transition point); retake/restart remain disallowed (FR-018a). US6 adds the
   * DISTRESS supportive messaging (distress_note) when the final level is DISTRESS. */
  async getResult(userId: string): Promise<ResultInsight> {
    await this.assertNotSafetyHold(userId); // FR-019b suppression
    const result = await this.prisma.assessmentResult.findFirst({ where: { userId } });
    if (!result) throw new ResultNotFoundException();
    const distressNote = await this.distressNoteFor(userId);
    return presentResult(toResultResponse(result), distressNote);
  }

  // ─────────────────────────── helpers ───────────────────────────

  /** Resolve the DISTRESS supportive messaging for a user from the latest current
   * safety evaluation (US6, Safety §6). null unless the current level is DISTRESS. */
  private async distressNoteFor(userId: string): Promise<BilingualEntry | null> {
    const level = await this.safety.currentLevel(userId);
    return level === 'DISTRESS' ? this.safety.distressSupportCopy() : null;
  }

  /** Build the submit response carrying the presenter insight. `duplicate`
   * marks a retry that returned the existing result (FR-015). `distressNote` (US6)
   * carries the approved DISTRESS messaging when the final level is DISTRESS. */
  private insightResponse(
    row: { id: string; definitionVersion: string; domainScores: unknown; strongestDomain: string; supportDomain: string; selectedPriorities: unknown; goalFreeText: unknown },
    duplicate: boolean,
    distressNote: BilingualEntry | null = null,
  ): SubmitResponse {
    return {
      result_id: row.id,
      assessment_state: 'SCORED',
      onboarding_state: 'COMPLETED',
      result: presentResult(toResultResponse(row), distressNote),
      next: '/assessment/result',
      ...(duplicate ? { duplicate: true } : {}),
    };
  }

  /** FR-019b: throw 409 SAFETY_HOLD (no result) while onboarding is SAFETY_HOLD. US6
   * enriches the payload with the current `safety_route` when available. */
  private async assertNotSafetyHold(userId: string): Promise<void> {
    if (await this.profileLifecycle.isOnSafetyHold(userId)) {
      const route = await this.safety.currentRoute(userId);
      throw new SafetyHoldException(route ?? undefined);
    }
  }
}
