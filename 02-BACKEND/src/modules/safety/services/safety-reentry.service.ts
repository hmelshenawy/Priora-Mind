import { Injectable, Logger } from '@nestjs/common';
import { ProfileLifecycleService } from '../../profile/profile.public';
import { AssessmentSafetyLifecycleService } from '../../assessment/assessment.public';
import {
  SQ02_TRIGGER_CODES,
  type Sq01Code,
  type Sq02Code,
  type Sq03Code,
} from '../constants/safety-definition';
import { classifySafety } from '../utils/safety-classifier';
import { SafetyUnavailableException, errName } from '../constants/safety.errors';
import { buildSafetyRoute } from '../utils/safety-route';
import { SafetyService } from './safety.service';
import type { SafetyReentryBody, SafetyReentryResponse } from '../dto/safety.dto';

/**
 * Safety re-entry flow (Constitution VIII split — handwritten files MUST NOT exceed
 * 300 lines). Owns `POST /safety/reentry` (FR-019b context, Safety Matrix §9):
 * re-asks the safety check with fresh answers, creates a NEW SafetyEvaluation
 * (triggerContext=re_entry), and routes per its result. Never edits/downgrades/
 * relabels history; never declares a crisis clinically ended. NORMAL/DISTRESS →
 * resume the suspended assessment; HIGH_RISK/CRISIS → SAFETY_HOLD persists + repeat
 * route. Fails CLOSED (FR-025).
 *
 * Delegates append-only persistence, the consent/onboarding guard, and the
 * onboarding-state transition to `SafetyService` (no duplication of the
 * append-only transaction or the guard). SafetyService does NOT depend on this
 * service → no circular DI. No safety answers/reasons are logged (FR-030, Safety
 * Matrix §10).
 */
@Injectable()
export class SafetyReentryService {
  private readonly logger = new Logger('SafetyReentryService');

  constructor(
    private readonly safety: SafetyService,
    private readonly profileLifecycle: ProfileLifecycleService,
    private readonly assessmentLifecycle: AssessmentSafetyLifecycleService,
  ) {}

  /** `POST /safety/reentry` (Safety Matrix §9). See class doc. Fail-closed (503). */
  async reentry(userId: string, body: SafetyReentryBody): Promise<SafetyReentryResponse> {
    await this.safety.assertCanEnter(userId);
    if (!body || body.re_evaluate !== true) throw new SafetyUnavailableException();
    const sqAnswers = this.parseReentryAnswers(body);
    try {
      // Re-entry classifies on the fresh SQ answers only. The distress pattern (domain
      // scores) is not needed for the resume/hold decision: NORMAL and DISTRESS both
      // resume, HIGH_RISK/CRISIS both hold. The on-submit evaluation (after resume +
      // completion) re-runs with domain scores for the final gating + distress_note.
      const { level, reasons } = classifySafety({ safety_answers: sqAnswers });
      const assessmentId = await this.assessmentLifecycle.currentAssessmentId(userId);
      const now = new Date();
      const row = await this.safety.persistEvaluation(
        userId,
        assessmentId,
        level,
        reasons,
        're_entry',
        now,
      );

      if (level === 'HIGH_RISK' || level === 'CRISIS') {
        // SAFETY_HOLD persists; repeat routing. No state change to onboarding/assessment.
        return {
          onboarding_state: 'SAFETY_HOLD',
          safety_route: buildSafetyRoute(level as 'HIGH_RISK' | 'CRISIS'),
          safety_evaluation_id: row.id,
          level,
        };
      }
      // NORMAL/DISTRESS → resume: SAFETY_HOLD → ASSESSMENT_IN_PROGRESS, SUSPENDED → IN_PROGRESS.
      await this.resumeAssessment(userId, now);
      return {
        onboarding_state: 'ASSESSMENT_IN_PROGRESS',
        assessment_state: 'IN_PROGRESS',
        next: '/assessment',
        safety_evaluation_id: row.id,
        level,
      };
    } catch (e) {
      if (e instanceof SafetyUnavailableException) throw e;
      this.logger.error(`safety re-entry failed: ${errName(e)}`);
      throw new SafetyUnavailableException();
    }
  }

  // ───────────────────────── helpers ─────────────────────────

  /** Validate + coerce the re-entry body's fresh safety answers. SQ-02 is required
   * when SQ-01 ∈ {S1,S2,SX}. Throws SafetyUnavailableException (fail closed) on any
   * malformed input — never echoes the submitted answers. */
  private parseReentryAnswers(
    body: SafetyReentryBody,
  ): Partial<{ 'SQ-01': Sq01Code; 'SQ-02': Sq02Code; 'SQ-03': Sq03Code }> {
    const sq01 = body.safety_answers?.['SQ-01'] as Sq01Code | undefined;
    const sq02 = body.safety_answers?.['SQ-02'] as Sq02Code | undefined;
    const sq03 = body.safety_answers?.['SQ-03'] as Sq03Code | undefined;
    const out: Partial<{ 'SQ-01': Sq01Code; 'SQ-02': Sq02Code; 'SQ-03': Sq03Code }> = {};
    if (sq01 === 'S0' || sq01 === 'S1' || sq01 === 'S2' || sq01 === 'SX') out['SQ-01'] = sq01;
    else throw new SafetyUnavailableException();
    if (SQ02_TRIGGER_CODES.includes(sq01)) {
      if (sq02 === 'D0' || sq02 === 'D1' || sq02 === 'DX') out['SQ-02'] = sq02;
      else throw new SafetyUnavailableException();
    }
    if (sq03 === 'F0' || sq03 === 'F1' || sq03 === 'F2' || sq03 === 'FX') out['SQ-03'] = sq03;
    else throw new SafetyUnavailableException();
    return out;
  }

  /** Re-entry resume (Safety Matrix §9): SAFETY_HOLD → ASSESSMENT_IN_PROGRESS and
   * SUSPENDED → IN_PROGRESS so the user may continue the assessment. */
  private async resumeAssessment(userId: string, now: Date): Promise<void> {
    await this.assessmentLifecycle.resumeAfterSafety(userId, now);
    await this.profileLifecycle.releaseSafetyHoldToAssessment(userId, now);
  }
}
