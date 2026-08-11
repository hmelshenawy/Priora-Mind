import { Injectable } from '@nestjs/common';
import { ZodError } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { SafetyService } from '../../safety/safety.public';
import { ProfileLifecycleService } from '../../profile/profile.public';
import {
  ASSESSMENT_DEFINITION_V1,
  ASSESSMENT_DEFINITION_VERSION,
  type DomainCode,
} from '../constants/assessment-definition';
import {
  answerSchemaForQuestionId,
  kindForQuestionId,
  type AssessmentView,
  type DefinitionResponse,
  type SaveAnswerResponse,
} from '../dto/assessment.dto';
import {
  QuestionNotFoundException,
  RestartNotAllowedException,
  SafetyHoldException,
} from '../constants/assessment.errors';
import { buildDefinitionResponse } from '../dto/assessment-definition-view';
import { AssessmentAnswerStore } from './assessment-answer-store.service';

/**
 * Assessment lifecycle orchestration (FR-013/FR-014/FR-014a/FR-014b, contracts/
 * assessment.md, data-model §8/§9). Owns the active-Assessment flow: definition view,
 * resume/safe-restart, answer save + per-answer safety wiring, and onboarding-state
 * transitions. The OnboardingGuard (T033) gates every step on EMAIL_VERIFIED + consent
 * (FR-006); route guards are UX only (FR-028). All writes filter by `userId` server-
 * side (FR-027/FR-029).
 *
 * Answer persistence + required-set computation live in `AssessmentAnswerStore`, and
 * the pure definition view in `assessment-definition-view.ts` (Constitution VIII
 * split). Scoring stays separate from safety classification (FR-019); the per-answer
 * safety evaluation (FR-019a) is delegated to `SafetyService` (US6).
 */
@Injectable()
export class AssessmentLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileLifecycle: ProfileLifecycleService,
    private readonly safety: SafetyService,
    private readonly answers: AssessmentAnswerStore,
  ) {}

  async getDefinition(): Promise<DefinitionResponse> {
    return buildDefinitionResponse();
  }

  async getAssessment(userId: string): Promise<AssessmentView> {
    await this.profileLifecycle.assertCanEnterAssessment(userId);
    const assessment = await this.answers.upsertActive(userId);

    // US8 (FR-034, SC-007): corrupt/inconsistent-progress detection. If the active
    // assessment's definition version no longer matches the current definition:
    //  - IN_PROGRESS (saved answers exist): the saved progress is inconsistent with
    //    the current definition — offer a SAFE RESTART. Stale answers are NOT surfaced
    //    as a resumable view and no next question is offered (no partial result is
    //    presented as resumable or complete). The user restarts, which re-anchors.
    //  - NOT_STARTED (no answers yet): silently re-anchor to the current definition —
    //    no data to corrupt, so the user simply starts on the current version.
    //  - SUBMITTED/SCORED/SUSPENDED: a completed or safety-held assessment on a prior
    //    version is NOT "partial progress" — leave it as-is (results stand; safety
    //    re-entry is unaffected). This guard is resume-only.
    if (assessment.definitionVersion !== ASSESSMENT_DEFINITION_VERSION) {
      if (assessment.state === 'IN_PROGRESS') {
        return {
          assessment_id: assessment.id,
          definition_version: assessment.definitionVersion,
          assessment_state: assessment.state,
          next_question_id: null,
          answered: [],
          introduction: {
            en: ASSESSMENT_DEFINITION_V1.current_state_instruction_en,
            ar: ASSESSMENT_DEFINITION_V1.current_state_instruction_ar,
          },
          requires_safe_restart: true,
        };
      }
      if (assessment.state === 'NOT_STARTED') {
        await this.prisma.assessment.update({
          where: { id: assessment.id },
          data: { definitionVersion: ASSESSMENT_DEFINITION_VERSION },
        });
        assessment.definitionVersion = ASSESSMENT_DEFINITION_VERSION;
      }
    }

    const answers = await this.answers.loadAnswers(assessment.id);
    const view: AssessmentView = {
      assessment_id: assessment.id,
      definition_version: assessment.definitionVersion,
      assessment_state: assessment.state,
      next_question_id: await this.answers.nextQuestion(assessment.id, answers),
      answered: answers.map((a) => ({ question_id: a.questionId, value: a.value })),
      introduction: {
        en: ASSESSMENT_DEFINITION_V1.current_state_instruction_en,
        ar: ASSESSMENT_DEFINITION_V1.current_state_instruction_ar,
      },
    };
    // US6 (FR-019b, contracts/assessment.md): when SUSPENDED or in SAFETY_HOLD, include
    // the safety_route pointer (no domain scores are exposed in this view regardless).
    if (assessment.state === 'SUSPENDED') {
      const route = await this.safety.currentRoute(userId);
      if (route) view.safety_route = route;
    }
    return view;
  }

  async saveAnswer(
    userId: string,
    questionId: string,
    body: unknown,
  ): Promise<SaveAnswerResponse> {
    await this.profileLifecycle.assertCanEnterAssessment(userId);
    // US6: once in SAFETY_HOLD, no further answers may be saved (FR-019b). The
    // triggering SQ answer is saved before this point; subsequent saves are blocked.
    if (await this.profileLifecycle.isOnSafetyHold(userId)) throw new SafetyHoldException();

    const kind = kindForQuestionId(questionId);
    if (!kind) throw new QuestionNotFoundException();
    const schema = answerSchemaForQuestionId(questionId);
    if (!schema) throw new QuestionNotFoundException();
    const parsed = schema.parse(body); // ZodError → 400 VALIDATION (global filter)

    const assessment = await this.answers.upsertActive(userId);
    // US6: SQ-02 is only accepted when SQ-01 ∈ {S1,S2,SX} (Safety §3, contracts).
    if (questionId === 'SQ-02') {
      const sq01 = await this.answers.storedSq01(assessment.id);
      if (!sq01 || !this.safety.requiresFollowUpForSq01(sq01)) {
        throw validationError(['code'], 'SQ-02 is only shown when SQ-01 indicates risk');
      }
    }
    await this.crossValidate(userId, assessment.id, questionId, parsed);

    const now = new Date();
    await this.answers.upsertAnswer(assessment.id, questionId, kind, parsed, now);

    if (assessment.state === 'NOT_STARTED') {
      await this.prisma.assessment.update({
        where: { id: assessment.id },
        data: { state: 'IN_PROGRESS', startedAt: now, lastActivityAt: now },
      });
      await this.profileLifecycle.markAssessmentInProgress(userId, now);
    } else {
      await this.prisma.assessment.update({
        where: { id: assessment.id },
        data: { lastActivityAt: now },
      });
      await this.profileLifecycle.touchOnboardingActivity(userId, now);
    }

    // US6 (FR-019a, Safety §4): run the safety classifier after a saved SAFETY answer.
    // Only SQ answers can escalate (coaching answers cannot change the safety level).
    // HIGH_RISK/CRISIS interrupt → persist + route + suppress the next question.
    let safetyRoute: SaveAnswerResponse['safety_route'] = undefined;
    if (questionId === 'SQ-01' || questionId === 'SQ-02' || questionId === 'SQ-03') {
      const sqAnswers = await this.answers.loadSqAnswers(assessment.id);
      const { safetyRoute: route } = await this.safety.evaluatePerAnswer(userId, assessment.id, sqAnswers);
      safetyRoute = route ?? undefined;
    }

    const answers = await this.answers.loadAnswers(assessment.id);
    return {
      saved: true,
      assessment_state: assessment.state === 'NOT_STARTED' ? 'IN_PROGRESS' : assessment.state,
      // Interrupted (HIGH_RISK/CRISIS) → no next question.
      next_question_id: safetyRoute ? null : await this.answers.nextQuestion(assessment.id, answers),
      ...(safetyRoute ? { safety_route: safetyRoute } : {}),
    };
  }

  async restart(userId: string): Promise<void> {
    await this.profileLifecycle.assertCanEnterAssessment(userId);
    // US6: restart is blocked while in SAFETY_HOLD — the user must use re-entry, not
    // restart, to leave SAFETY_HOLD (Safety §9, "client cannot override server safety
    // state" §10). Restart never clears historical SafetyEvaluations (contracts).
    if (await this.profileLifecycle.isOnSafetyHold(userId)) throw new SafetyHoldException();
    const assessment = await this.prisma.assessment.findFirst({ where: { userId } });
    if (!assessment || assessment.state === 'NOT_STARTED') return; // nothing to restart
    if (assessment.state === 'SCORED') throw new RestartNotAllowedException();
    const now = new Date();
    await this.prisma.assessmentAnswer.deleteMany({ where: { assessmentId: assessment.id } });
    // US8 (FR-034, SC-007): restart re-anchors the assessment to the CURRENT
    // definition version — clearing stale answers collected against a retired
    // definition and resetting the pointer so resume + submit run on the current
    // definition. This is the safe-restart exit from the corrupt-progress state.
    await this.prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        state: 'IN_PROGRESS',
        definitionVersion: ASSESSMENT_DEFINITION_VERSION,
        startedAt: now,
        submittedAt: null,
        lastActivityAt: now,
      },
    });
    await this.profileLifecycle.markAssessmentInProgress(userId, now);
  }

  // ─────────────────────────── helpers ───────────────────────────

  /** Cross-question consistency (Assessment §6): AG-02 ranks + AG-03 goals must
   * cover the AG-01 selection exactly. Throws ZodError (→ 400 VALIDATION via the
   * global filter) on mismatch so no answer is persisted. The thrown issue carries
   * only the rule that was violated — never the submitted answer value (FR-037). */
  private async crossValidate(
    _userId: string,
    assessmentId: string,
    questionId: string,
    parsed: unknown,
  ): Promise<void> {
    if (questionId !== 'AG-02' && questionId !== 'AG-03') return;
    const ag01 = await this.prisma.assessmentAnswer.findFirst({
      where: { assessmentId, questionId: 'AG-01' },
    });
    if (!ag01) throw validationError([questionId], 'AG-01 must be answered first');
    const selected = (ag01.value as { domains: DomainCode[] }).domains;
    if (questionId === 'AG-02') {
      const ranking = (parsed as { ranking: Record<string, number> }).ranking;
      const keys = Object.keys(ranking);
      if (keys.length !== selected.length || !selected.every((d) => d in ranking)) {
        throw validationError(['ranking'], 'ranking must cover the AG-01 selection');
      }
      const ranks = Object.values(ranking);
      if (new Set(ranks).size !== ranks.length) {
        throw validationError(['ranking'], 'ranks must be unique');
      }
    } else {
      const goals = (parsed as { goals: Record<string, unknown> }).goals;
      const keys = Object.keys(goals);
      if (keys.length !== selected.length || !selected.every((d) => d in goals)) {
        throw validationError(['goals'], 'goals must cover the AG-01 selection');
      }
    }
  }

}

/** Throw a real ZodError (custom issue) so the global filter maps cross-question
 * mismatches to 400 VALIDATION with a field path, consistent with schema errors.
 * The message names only the violated rule, never the submitted value (FR-037). */
function validationError(path: (string | number)[], message: string): never {
  throw new ZodError([{ code: 'custom', path, message }]);
}
