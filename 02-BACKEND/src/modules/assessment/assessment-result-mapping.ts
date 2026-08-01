import { Prisma } from '@prisma/client';
import {
  type DomainCode,
} from './assessment-definition';
import {
  type ResultDomainScore,
  type ResultResponse,
  type ScoredResultDto,
} from './assessment.dto';
import type { Sq01Code, Sq02Code, Sq03Code } from '../safety/safety-definition';
import type { ClassifierDomainScore } from '../safety/safety-classifier';

/**
 * Pure result-mapping helpers extracted from AssessmentSubmitService (Constitution
 * VIII — handwritten files MUST NOT exceed 300 lines). These functions hold NO
 * state and take only their explicit inputs: they project saved-answer rows onto
 * the shapes the scorer/classifier/presenter consume, and map a stored result row
 * back onto the typed `ResultResponse`. Kept pure so submit owns orchestration and
 * this module owns shape translation (single responsibility).
 *
 * None of these functions read or emit sensitive content beyond what their caller
 * already holds in memory; no logging happens here (FR-030).
 */

/** A saved-answer row as read from persistence (loosely typed value). */
export interface SavedAnswer {
  questionId: string;
  value: unknown;
}

/** A stored result row (JSON fields typed loosely — Prisma returns JsonValue, the
 *  mock returns unknown) onto which the typed ResultResponse is mapped. */
export interface StoredResultRow {
  id: string;
  assessmentId?: string;
  definitionVersion: string;
  domainScores: unknown;
  strongestDomain: string;
  supportDomain: string;
  selectedPriorities: unknown;
  goalFreeText: unknown;
}

/** Nullable JSON input: Prisma requires Prisma.JsonNull (not JS null) for a NULL
 *  value on a `Json?` field; a non-null object is cast to InputJsonValue. */
export function goalFreeTextInput(
  v: Record<string, unknown> | null,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return v ? (v as unknown as Prisma.InputJsonValue) : Prisma.JsonNull;
}

/** Collect the numeric current-state answers (AS-* questions) for the scorer. */
export function extractCurrentState(answers: SavedAnswer[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of answers) {
    if (!a.questionId.startsWith('AS-')) continue;
    const v = (a.value as { value?: number } | undefined)?.value;
    if (typeof v === 'number') out[a.questionId] = v;
  }
  return out;
}

/** US6: collect the saved safety-answer codes for the final gating classifier. */
export function extractSqAnswers(
  answers: SavedAnswer[],
): Partial<{ 'SQ-01': Sq01Code; 'SQ-02': Sq02Code; 'SQ-03': Sq03Code }> {
  const out: Partial<{ 'SQ-01': Sq01Code; 'SQ-02': Sq02Code; 'SQ-03': Sq03Code }> = {};
  for (const a of answers) {
    const code = (a.value as { code?: string } | undefined)?.code;
    if (a.questionId === 'SQ-01' && code) out['SQ-01'] = code as Sq01Code;
    else if (a.questionId === 'SQ-02' && code) out['SQ-02'] = code as Sq02Code;
    else if (a.questionId === 'SQ-03' && code) out['SQ-03'] = code as Sq03Code;
  }
  return out;
}

/** US6: project the deterministic domain scores onto the classifier's input shape.
 *  Only the numeric `score` is consumed (for the DISTRESS pattern); the band is
 *  dropped. Scoring stays SEPARATE from safety classification — read-only projection. */
export function toClassifierDomainScores(
  domainScores: Record<DomainCode, { score: number; band: unknown }>,
): Record<string, ClassifierDomainScore> {
  const out: Record<string, ClassifierDomainScore> = {};
  for (const [domain, v] of Object.entries(domainScores)) {
    out[domain] = { score: v.score };
  }
  return out;
}

export function collectPriorities(answers: SavedAnswer[]): {
  domains: DomainCode[];
  ranking: Record<string, number>;
} {
  const ag01 = answers.find((a) => a.questionId === 'AG-01');
  const ag02 = answers.find((a) => a.questionId === 'AG-02');
  const domains = ((ag01?.value as { domains?: DomainCode[] } | undefined)?.domains) ?? [];
  const ranking = ((ag02?.value as { ranking?: Record<string, number> } | undefined)?.ranking) ?? {};
  return { domains, ranking };
}

export function collectGoalFreeText(answers: SavedAnswer[]): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  const ag03 = answers.find((a) => a.questionId === 'AG-03');
  const ag04 = answers.find((a) => a.questionId === 'AG-04');
  const ag05 = answers.find((a) => a.questionId === 'AG-05');
  if (ag03) out['AG-03'] = (ag03.value as { goals?: unknown }).goals ?? ag03.value;
  if (ag04) out['AG-04'] = (ag04.value as { text?: unknown }).text ?? ag04.value;
  if (ag05) out['AG-05'] = ag05.value;
  return Object.keys(out).length ? out : null;
}

/** Map a stored result row onto the typed ResultResponse. Casts are safe: the row
 *  was authored by the submit service from the typed ScoredAssessment + priorities. */
export function toResultResponse(row: StoredResultRow): ResultResponse {
  const domainScores = row.domainScores as Record<
    DomainCode,
    { score: number; band: { label_en: string; label_ar: string } }
  >;
  const domain_scores: ResultDomainScore[] = Object.entries(domainScores).map(
    ([domain, v]) => ({
      domain: domain as DomainCode,
      score: v.score,
      band: { label_en: v.band.label_en, label_ar: v.band.label_ar },
    }),
  );
  return {
    result_id: row.id,
    definition_version: row.definitionVersion,
    domain_scores,
    strongest_domain: row.strongestDomain as DomainCode,
    support_domain: row.supportDomain as DomainCode,
    selected_priorities: row.selectedPriorities as {
      domains: DomainCode[];
      ranking: Record<string, number>;
    },
    goal_free_text: (row.goalFreeText as Record<string, unknown> | null) ?? null,
  };
}

export function toScoredResultDto(row: StoredResultRow & { assessmentId: string }): ScoredResultDto {
  return {
    resultId: row.id,
    assessmentId: row.assessmentId,
    definitionVersion: row.definitionVersion,
    domainScores: row.domainScores as Record<string, unknown>,
    strongestDomain: row.strongestDomain as DomainCode,
    supportDomain: row.supportDomain as DomainCode,
    selectedPriorities: row.selectedPriorities as { domains: DomainCode[]; ranking: Record<string, number> },
    goalFreeText: (row.goalFreeText as Record<string, unknown> | null) ?? null,
  };
}
