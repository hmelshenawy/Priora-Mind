import { z } from 'zod';
import {
  CURRENT_STATE_QUESTIONS,
  GOAL_QUESTIONS,
  type DomainCode,
} from '../constants/assessment-definition';
import type { SafetyRoute } from '../../safety/safety.dto';
import type { ResultInsight } from './result-presenter';

/**
 * Assessment DTOs + Zod schemas (contracts/assessment.md, FR-013..FR-016,
 * FR-037). Answer bodies are typed by `question_kind`; the lifecycle service
 * selects the matching schema by question_id and parses the body, letting
 * ZodError propagate to the global filter (400 VALIDATION with field paths —
 * never the submitted value). Cross-question consistency (AG-02 ranks cover
 * AG-01 selection; AG-03 goals cover AG-01 selection) is enforced in the
 * service against the saved AG-01 answer.
 *
 * US4 scope: the 16 current-state questions + AG-01..AG-05. Safety questions
 * (SQ-01..SQ-03) are unscored and land in US6 (SafetyDefinition); they are NOT
 * part of this definition, so SQ-* ids are rejected as unknown here.
 */

export const DOMAIN_ENUM = z.enum([
  'stress',
  'mood',
  'energy',
  'sleep',
  'focus',
  'confidence',
  'relationships',
  'balance',
]);
export type DomainCodeInput = z.infer<typeof DOMAIN_ENUM>;

/** current_state: { value: 0|1|2|3|4 } */
export const currentStateSchema = z.object({
  value: z.number().int().min(0).max(4),
});
export type CurrentStateAnswer = z.infer<typeof currentStateSchema>;

/** goal_select (AG-01): { domains: DomainCode[1..3] } */
export const goalSelectSchema = z.object({
  domains: z.array(DOMAIN_ENUM).min(1).max(3),
});
export type GoalSelectAnswer = z.infer<typeof goalSelectSchema>;

/** goal_rank (AG-02): { ranking: { [domain]: rank } } (unique ranks validated in service) */
export const goalRankSchema = z.object({
  ranking: z.record(DOMAIN_ENUM, z.number().int().min(1)),
});
export type GoalRankAnswer = z.infer<typeof goalRankSchema>;

/** goal_free_text (AG-03): per-selected-domain desired change; text required. */
export const goalFreeTextAg03Schema = z.object({
  goals: z.record(
    DOMAIN_ENUM,
    z.object({ text: z.string().min(1).max(500), suggested: z.string().optional() }),
  ),
});
export type GoalFreeTextAg03Answer = z.infer<typeof goalFreeTextAg03Schema>;

/** goal_free_text (AG-04): optional short free-text. */
export const goalFreeTextAg04Schema = z.object({
  text: z.string().max(500),
});
export type GoalFreeTextAg04Answer = z.infer<typeof goalFreeTextAg04Schema>;

/** goal_free_text (AG-05): optional; user may skip (no answer saved). */
export const goalFreeTextAg05Schema = z.object({
  suggested: z.string().optional(),
  text: z.string().max(500).optional(),
});
export type GoalFreeTextAg05Answer = z.infer<typeof goalFreeTextAg05Schema>;

/** safety (SQ-01): recent self-harm thoughts — { code: S0|S1|S2|SX } (Safety §3). */
export const sq01Schema = z.object({ code: z.enum(['S0', 'S1', 'S2', 'SX']) });
export type Sq01Answer = z.infer<typeof sq01Schema>;
/** safety (SQ-02): immediate danger — { code: D0|D1|DX }; only accepted when SQ-01 ∈
 * {S1,S2,SX} (enforced in the lifecycle service). */
export const sq02Schema = z.object({ code: z.enum(['D0', 'D1', 'DX']) });
export type Sq02Answer = z.infer<typeof sq02Schema>;
/** safety (SQ-03): current functional distress — { code: F0|F1|F2|FX } (Safety §3). */
export const sq03Schema = z.object({ code: z.enum(['F0', 'F1', 'F2', 'FX']) });
export type Sq03Answer = z.infer<typeof sq03Schema>;

/** Question-id → answer-schema map. SQ-* (US6) return the matching safety schema;
 * unknown ids return null (service → 404). */
export function answerSchemaForQuestionId(questionId: string): z.ZodTypeAny | null {
  if (questionId.startsWith('AS-')) return currentStateSchema;
  switch (questionId) {
    case 'AG-01':
      return goalSelectSchema;
    case 'AG-02':
      return goalRankSchema;
    case 'AG-03':
      return goalFreeTextAg03Schema;
    case 'AG-04':
      return goalFreeTextAg04Schema;
    case 'AG-05':
      return goalFreeTextAg05Schema;
    case 'SQ-01':
      return sq01Schema;
    case 'SQ-02':
      return sq02Schema;
    case 'SQ-03':
      return sq03Schema;
    default:
      return null;
  }
}

/** Question kind for a question id (null = unknown). SQ-* → 'safety' (US6). */
export function kindForQuestionId(questionId: string): QuestionKindFor | null {
  if (CURRENT_STATE_QUESTIONS.some((q) => q.id === questionId)) return 'current_state';
  const g = GOAL_QUESTIONS.find((q) => q.id === questionId);
  if (g) return g.kind as QuestionKindFor;
  if (questionId === 'SQ-01' || questionId === 'SQ-02' || questionId === 'SQ-03') return 'safety';
  return null;
}
type QuestionKindFor = 'current_state' | 'goal_select' | 'goal_rank' | 'goal_free_text' | 'safety';

// ── response shapes ────────────────────────────────────────────────

export interface AnsweredItem {
  question_id: string;
  value: unknown;
}

export interface AssessmentView {
  assessment_id: string;
  definition_version: string;
  assessment_state: string;
  next_question_id: string | null;
  answered: AnsweredItem[];
  introduction: { en: string; ar: string };
  /** US6 (FR-019b, contracts/assessment.md): present when the assessment is
   * SUSPENDED or onboarding is SAFETY_HOLD — points the user to the safety route.
   * Absent on the NORMAL path. */
  safety_route?: SafetyRoute;
  /** US8 (FR-034, SC-007): present (true) when the active assessment's definition
   * version no longer matches the current definition AND the user has saved
   * answers — i.e. the saved progress is inconsistent/corrupt. The system offers
   * a safe restart instead of resuming stale answers; no partial result is
   * presented as complete. Absent on the healthy resume / NORMAL path. */
  requires_safe_restart?: boolean;
}

export interface DefinitionQuestion {
  id: string;
  domain: DomainCode;
  polarity: 'P' | 'N';
  scale: { en: string[]; ar: string[] };
  required: boolean;
  en: string;
  ar: string;
}
export interface DefinitionResponse {
  version: string;
  instruction: { en: string; ar: string };
  questions: DefinitionQuestion[];
  goal_questions: {
    id: string;
    kind: string;
    required: boolean;
    prompt_en: string;
    prompt_ar: string;
  }[];
  safety_questions: unknown[]; // empty in US4; SafetyDefinition supplies them in US6
  band_thresholds: { min: number; max: number; label_en: string; label_ar: string }[];
  /** Canonical bilingual domain labels (single source of truth — assessment-definition).
   * The frontend renders AG-01 area selection + result domain names from these so
   * EN/AR never drift (Constitution X). */
  domain_labels: { en: Record<DomainCode, string>; ar: Record<DomainCode, string> };
}

export interface SaveAnswerResponse {
  saved: true;
  assessment_state: string;
  next_question_id: string | null;
  /** US6 (FR-019a, contracts/assessment.md): present when this answer triggers
   * HIGH_RISK/CRISIS routing; `next_question_id` is null (interrupted). */
  safety_route?: SafetyRoute;
}

export interface SubmitResponse {
  result_id: string;
  assessment_state: 'SCORED';
  /** US5: the NORMAL/DISTRESS path completes onboarding when the result is
   * presented (data-model §7 line 151). HIGH_RISK/CRISIS never reach here —
   * US6 returns 409 SAFETY_HOLD instead (FR-019b). */
  onboarding_state: 'COMPLETED';
  /** The non-diagnostic coaching insight (US5 presenter, FR-017/FR-018). */
  result: ResultInsight;
  next: '/assessment/result';
  duplicate?: boolean;
}

export interface ResultDomainScore {
  domain: DomainCode;
  score: number;
  band: { label_en: string; label_ar: string };
}
export interface ResultResponse {
  result_id: string;
  definition_version: string;
  domain_scores: ResultDomainScore[];
  strongest_domain: DomainCode;
  support_domain: DomainCode;
  selected_priorities: { domains: DomainCode[]; ranking: Record<string, number> };
  goal_free_text: Record<string, unknown> | null;
}

export interface ScoredResultDto {
  resultId: string;
  assessmentId: string;
  definitionVersion: string;
  domainScores: Record<string, unknown>;
  strongestDomain: DomainCode;
  supportDomain: DomainCode;
  selectedPriorities: { domains: DomainCode[]; ranking: Record<string, number> };
  goalFreeText: Record<string, unknown> | null;
}
