import { ApiService } from '../../services/api';
import type { SafetyQuestion, SafetyRoute } from '../safety/safety.api';

/**
 * Assessment API client (US4, contracts/assessment.md, FR-012..FR-016/FR-035).
 * All paths include the `/api/v1` prefix. Endpoints require a valid access
 * token + EMAIL_VERIFIED + granted consent + profile saved (backend-enforced;
 * the in-memory access token is attached by the shared api-client).
 *
 * US4 scope = NORMAL path only: definition (16 current-state + AG-01..AG-05,
 * safety_questions empty until US6), per-answer save/revise, restart, idempotent
 * submit, and the raw result read. The non-diagnostic presenter + SAFETY_HOLD
 * suppression + COMPLETED transition land in US5; per-answer safety routing +
 * SQ questions land in US6.
 */

export type LanguageCode = 'en' | 'ar';
export type DomainCode =
  | 'stress' | 'mood' | 'energy' | 'sleep'
  | 'focus' | 'confidence' | 'relationships' | 'balance';

export interface BilingualEntry { en: string; ar: string }

export interface DefinitionQuestion {
  id: string;
  domain: DomainCode;
  polarity: 'P' | 'N';
  scale: { en: string[]; ar: string[] };
  required: boolean;
  en: string;
  ar: string;
}
export interface GoalQuestion {
  id: string;
  kind: string;
  required: boolean;
  prompt_en: string;
  prompt_ar: string;
}
export interface DefinitionResponse {
  version: string;
  instruction: BilingualEntry;
  questions: DefinitionQuestion[];
  goal_questions: GoalQuestion[];
  /** US6: the three unscored safety questions (SQ-01/02/03). Empty array is invalid
   * once US6 ships; SQ-02 is shown only when SQ-01 ∈ `shown_when` (Safety §3). */
  safety_questions: SafetyQuestion[];
  band_thresholds: { min: number; max: number; label_en: string; label_ar: string }[];
  domain_labels: { en: Record<DomainCode, string>; ar: Record<DomainCode, string> };
}

export interface AnsweredItem { question_id: string; value: unknown }
export interface AssessmentView {
  assessment_id: string;
  definition_version: string;
  assessment_state: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUSPENDED' | 'SUBMITTED' | 'SCORED';
  next_question_id: string | null;
  answered: AnsweredItem[];
  introduction: BilingualEntry;
  /** US6 (FR-019b): present when the assessment is SUSPENDED / onboarding is SAFETY_HOLD. */
  safety_route?: SafetyRoute;
  /** US8 (FR-034, SC-007): true when saved progress is inconsistent with the
   * current definition (retired definition + saved answers). The wizard shows
   * a safe-restart screen instead of resuming; no partial result is kept. */
  requires_safe_restart?: boolean;
}

export interface SaveAnswerResponse {
  saved: true;
  assessment_state: string;
  next_question_id: string | null;
  /** US6 (FR-019a): present when this answer triggers HIGH_RISK/CRISIS routing (interrupt). */
  safety_route?: SafetyRoute;
}

export interface BilingualEntry { en: string; ar: string }

export interface ResultDomainScore {
  domain: DomainCode;
  score: number;
  band: { label_en: string; label_ar: string };
}

/**
 * Non-diagnostic coaching insight (US5, FR-016/FR-017/FR-018, SC-002). Assembled
 * server-side by the presenter (single source of truth for the bilingual framing
 * copy — no EN/AR drift, Constitution X). Carries 8 domain scores + bands,
 * strongest + support domain, selected priorities preserved separately, an
 * optional goal-alignment note, the explicit non-diagnostic statement, and the
 * transition point. NO overall score (FR-016).
 */
export interface AssessmentInsight {
  result_id: string;
  definition_version: string;
  domain_scores: ResultDomainScore[];
  strongest_domain: DomainCode;
  support_domain: DomainCode;
  selected_priorities: { domains: DomainCode[]; ranking: Record<string, number> };
  goal_alignment_note: BilingualEntry | null;
  non_diagnostic_statement: BilingualEntry;
  transition_point: BilingualEntry;
  /** US6 (Safety §6, FR-022): bounded supportive messaging shown ALONGSIDE the result
   * when the final safety evaluation is DISTRESS. null for NORMAL (and never for
   * HIGH_RISK/CRISIS — those suppress the result via SAFETY_HOLD). Backend-owned copy. */
  distress_note: BilingualEntry | null;
}

export interface SubmitResponse {
  result_id: string;
  assessment_state: 'SCORED';
  /** US5: the NORMAL/DISTRESS path completes onboarding when the result is
   * presented (FR-018). HIGH_RISK/CRISIS return 409 SAFETY_HOLD instead. */
  onboarding_state: 'COMPLETED';
  /** The non-diagnostic insight, returned inline so the UI can show it at once. */
  result: AssessmentInsight;
  next: '/assessment/result';
  duplicate?: boolean;
}

const A = '/api/v1/assessment';

export class AssessmentApiService extends ApiService {
  getDefinition(): Promise<DefinitionResponse> {
    return this.get<DefinitionResponse>(`${A}/definition`);
  }
  getAssessment(): Promise<AssessmentView> {
    return this.get<AssessmentView>(A);
  }
  saveAnswer(questionId: string, body: unknown): Promise<SaveAnswerResponse> {
    return this.put<SaveAnswerResponse>(`${A}/answers/${questionId}`, body);
  }
  restart(): Promise<void> {
    return this.post<void>(`${A}/restart`);
  }
  submit(): Promise<SubmitResponse> {
    return this.post<SubmitResponse>(`${A}/submit`, {});
  }
  getResult(): Promise<AssessmentInsight> {
    return this.get<AssessmentInsight>(`${A}/result`);
  }
}

/** Singleton used by hooks; the underlying api-client handles 401 refresh. */
export const assessmentApi = new AssessmentApiService();