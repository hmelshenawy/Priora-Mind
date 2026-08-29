import type { DomainCode } from '../constants/assessment-definition';
import type { ResultDomainScore, ResultResponse } from './assessment.dto';
import { DOMAIN_LABELS_EN, DOMAIN_LABELS_AR } from '../constants/assessment-definition';

/**
 * Result presenter (US5, Assessment §9, FR-016/FR-017/FR-018, SC-002). Pure
 * assembly of the stored `AssessmentResult` into a non-diagnostic coaching
 * insight. Deterministic, no AI, no DB read — the bilingual framing copy is
 * fixed approved wording (FR-017/FR-018); it is NOT clinical labels, resources,
 * hotlines, or suggested goals (which remain launch-gated / un-invented).
 *
 * Scoring is separate from safety classification (FR-019): this insight is built
 * solely from the deterministic domain scores + priorities. It MUST NOT carry
 * an overall score (FR-016) and MUST NOT be derived from safety levels (FR-018).
 * SAFETY_HOLD suppression is enforced by the caller (submit/getResult), not here.
 */

export interface BilingualEntry {
  en: string;
  ar: string;
}

export interface ResultInsight {
  result_id: string;
  definition_version: string;
  domain_scores: ResultDomainScore[];
  strongest_domain: DomainCode;
  support_domain: DomainCode;
  /** Selected priorities preserved SEPARATELY from the scores (FR-016, §9). */
  selected_priorities: { domains: DomainCode[]; ranking: Record<string, number> };
  /** §9: explain when the lowest-scoring domain differs from the first chosen
   * goal. null when they coincide or no priority is selected. */
  goal_alignment_note: BilingualEntry | null;
  /** FR-017: the explicit non-diagnostic statement (EN + AR). */
  non_diagnostic_statement: BilingualEntry;
  /** FR-018: the transition point to future coaching-plan creation (no plan). */
  transition_point: BilingualEntry;
  /** US6 (Safety §6 DISTRESS routing, FR-022): the bounded supportive messaging
   * presented ALONGSIDE the normal result when the final safety evaluation is
   * DISTRESS. null for NORMAL (and never for HIGH_RISK/CRISIS — those suppress the
   * result entirely via SAFETY_HOLD). Drawn from the approved SAFETY_COPY.DISTRESS,
   * never invented (FR-020/FR-021). */
  distress_note: BilingualEntry | null;
  // NOTE: no overall_score field (FR-016).
}

/** FR-017: coaching/screening insight, not a diagnosis, not professional care. */
const NON_DIAGNOSTIC_STATEMENT: BilingualEntry = {
  en: 'This insight is a coaching reflection based on your answers. It is not a medical diagnosis and not a substitute for professional care.',
  ar: 'هذه الرؤية تأمل إرشادي مبني على إجاباتك، وليست تشخيصًا طبيًا ولا بديلًا عن الرعاية المتخصصة.',
};

/** FR-018: completion + transition to a FUTURE plan (no plan created here). */
const TRANSITION_POINT: BilingualEntry = {
  en: "You've completed onboarding. A personalized coaching plan will be created in a future release to help you take your next step.",
  ar: 'لقد أكملت التهيئة. سيتم إنشاء خطة توجيه مخصصة في إصدار لاحق لمساعدتك على خطوتك التالية.',
};

/** The user's top-priority domain: AG-02 rank 1 if ranked, else the first
 * listed selected domain, else null (no priority chosen). */
export function firstPriorityDomain(
  priorities: { domains: DomainCode[]; ranking: Record<string, number> },
): DomainCode | null {
  const ranking = priorities.ranking ?? {};
  const byRank = Object.entries(ranking).find(([, r]) => r === 1);
  if (byRank) return byRank[0] as DomainCode;
  return priorities.domains[0] ?? null;
}

/** §9 goal-alignment note: explains (coaching framing, non-clinical) when the
 * lowest-scoring domain differs from the top-priority domain. */
function goalAlignmentNote(first: DomainCode, support: DomainCode): BilingualEntry {
  return {
    en: `You ranked ${DOMAIN_LABELS_EN[first]} as your top priority. Your lowest-scoring area right now is ${DOMAIN_LABELS_EN[support]}. Coaching can focus on what matters most to you while keeping an eye on ${DOMAIN_LABELS_EN[support]}.`,
    ar: `لقد اخترت ${DOMAIN_LABELS_AR[first]} كأولوية أولى. والمجال الأقل تصنيفًا حاليًا هو ${DOMAIN_LABELS_AR[support]}. يمكن للتوجيه أن يركّز على ما يهمك أكثر مع متابعة ${DOMAIN_LABELS_AR[support]}.`,
  };
}

/** Assemble the non-diagnostic coaching insight from a stored result. Pure.
 * `distressNote` (US6, Safety §6) carries the approved DISTRESS supportive messaging
 * when the final safety evaluation is DISTRESS; null otherwise. */
export function presentResult(r: ResultResponse, distressNote: BilingualEntry | null = null): ResultInsight {
  const first = firstPriorityDomain(r.selected_priorities);
  const note = first && first !== r.support_domain ? goalAlignmentNote(first, r.support_domain) : null;
  return {
    result_id: r.result_id,
    definition_version: r.definition_version,
    domain_scores: r.domain_scores,
    strongest_domain: r.strongest_domain,
    support_domain: r.support_domain,
    selected_priorities: r.selected_priorities,
    goal_alignment_note: note,
    non_diagnostic_statement: NON_DIAGNOSTIC_STATEMENT,
    transition_point: TRANSITION_POINT,
    distress_note: distressNote,
  };
}