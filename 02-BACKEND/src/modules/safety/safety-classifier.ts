/**
 * Pure deterministic safety classifier (Safety_Decision_Matrix §5, research D8).
 *
 * This is a PURE FUNCTION: no DB, no network, no LLM, no I/O, no clocks. Given the
 * currently-answered safety questions and the domain scores, it returns the
 * deterministic safety level + the reasons. It is the single source of the
 * classification decision; `SafetyService` wraps it (persistence, copy/resource
 * resolution, fail-closed) but never overrides its output.
 *
 * INVARIANTS (Safety §2/§5, FR-019, FR-026, SC-004):
 *  - Safety classification is SEPARATE from assessment scoring. The domain scores are
 *    read here ONLY as the input to the DISTRESS pattern (Safety §5); they never
 *    become a safety level and never override SQ-01/SQ-02 (FR-018/FR-019).
 *  - SQ-01 and SQ-02 determine HIGH_RISK and CRISIS.
 *  - SQ-03 classifies DISTRESS ONLY. It MUST NOT produce HIGH_RISK or CRISIS and MUST
 *    NOT downgrade a HIGH_RISK/CRISIS classification from SQ-01/SQ-02.
 *  - Highest-risk-wins: CRISIS > HIGH_RISK > DISTRESS > NORMAL. The first matching
 *    higher rule short-circuits, so SQ-03 can never downgrade an SQ-01/SQ-02 result.
 *  - Deterministic + fail-closed: any unexpected input throws (Safety §10). The
 *    service catches that and fails closed (503 SAFETY_UNAVAILABLE).
 *
 * Intermediate states (per-answer evaluation, Safety §4): when only a subset of the
 * safety questions is answered, the classifier classifies the partial input. E.g.
 * SQ-01=S1 with SQ-02 not yet answered → no HIGH_RISK/CRISIS rule fires → NORMAL (the
 * lifecycle then shows SQ-02). SQ-01=S2 → CRISIS immediately (interrupt; SQ-02 is not
 * asked). This keeps per-answer routing deterministic without prematurely escalating.
 */

import {
  DISTRESS_DOMAIN_THRESHOLD,
  DISTRESS_MIN_DOMAINS,
  MOOD_DOMAIN,
  type SafetyLevel,
  type Sq01Code,
  type Sq02Code,
  type Sq03Code,
} from './safety-definition';

/** A single domain score (subset of the assessment DomainScoreView; only the numeric
 * score is consumed for the distress pattern). */
export interface ClassifierDomainScore {
  score: number;
}

/** Input to the classifier: the answered safety questions (partial during per-answer
 * evaluation — only answered keys are present) + the domain scores (may be empty/
 * absent before scoring; the distress pattern then simply cannot fire). */
export interface ClassifierInput {
  /** Answered safety question codes keyed by question id. Omitted = not yet answered. */
  safety_answers?: Partial<{
    'SQ-01': Sq01Code;
    'SQ-02': Sq02Code;
    'SQ-03': Sq03Code;
  }>;
  /** Domain scores keyed by domain code. Absent/empty before scoring is complete. */
  domain_scores?: Record<string, ClassifierDomainScore>;
}

/** Output of the classifier: the deterministic level + the reasons that produced it. */
export interface ClassifierResult {
  level: SafetyLevel;
  reasons: string[];
}

/** The relative severity order (highest-risk-wins, Safety §5). */
const SEVERITY: Record<SafetyLevel, number> = {
  NORMAL: 0,
  DISTRESS: 1,
  HIGH_RISK: 2,
  CRISIS: 3,
};

const isSq01 = (v: unknown): v is Sq01Code => v === 'S0' || v === 'S1' || v === 'S2' || v === 'SX';
const isSq02 = (v: unknown): v is Sq02Code => v === 'D0' || v === 'D1' || v === 'DX';
const isSq03 = (v: unknown): v is Sq03Code => v === 'F0' || v === 'F1' || v === 'F2' || v === 'FX';

/**
 * Classify the current safety answers + domain scores (Safety §5).
 *
 * Returns `{ level, reasons }` with the highest applicable level and the conditions
 * that produced it. Throws on malformed input (the service fails closed on throw).
 */
export function classifySafety(input: ClassifierInput): ClassifierResult {
  const answers = input.safety_answers ?? {};
  const sq01 = answers['SQ-01'];
  const sq02 = answers['SQ-02'];
  const sq03 = answers['SQ-03'];

  // Validate shape (fail closed on unexpected codes/typing — Safety §10).
  if (sq01 !== undefined && !isSq01(sq01)) throw new Error('invalid SQ-01 code');
  if (sq02 !== undefined && !isSq02(sq02)) throw new Error('invalid SQ-02 code');
  if (sq03 !== undefined && !isSq03(sq03)) throw new Error('invalid SQ-03 code');

  const reasons: string[] = [];
  let level: SafetyLevel = 'NORMAL';

  const escalate = (next: SafetyLevel, reason: string): void => {
    if (SEVERITY[next] > SEVERITY[level]) {
      level = next;
      reasons.length = 0;
      reasons.push(reason);
    } else if (next === level) {
      reasons.push(reason);
    }
    // lower levels are ignored (highest-risk-wins; never downgrade).
  };

  // ── CRISIS (Safety §5) ──────────────────────────────────────────────────
  // SQ-01=S2 → CRISIS immediately (interrupt; SQ-02 is not asked).
  if (sq01 === 'S2') escalate('CRISIS', 'SQ-01=S2');
  // SQ-02=D1 → CRISIS. SQ-02 is only shown when SQ-01 ∈ {S1,S2,SX}; if SQ-02 is answered
  // as D1 the user confirms immediate danger.
  if (sq02 === 'D1') escalate('CRISIS', 'SQ-02=D1');
  // SQ-02=DX after SQ-01 ∈ {S1,S2,SX} → CRISIS (refusing the danger check at a trigger
  // is treated as CRISIS, not a pass). SQ-02 being answered implies SQ-01 ∈ {S1,S2,SX}.
  if (sq02 === 'DX' && sq01 !== undefined && sq01 !== 'S0') {
    escalate('CRISIS', 'SQ-02=DX (after SQ-01 in {S1,S2,SX})');
  }

  // ── HIGH_RISK (Safety §5) ───────────────────────────────────────────────
  // SQ-01=S1 + SQ-02=D0 → HIGH_RISK (thoughts present, no immediate danger now).
  if (sq01 === 'S1' && sq02 === 'D0') escalate('HIGH_RISK', 'SQ-01=S1;SQ-02=D0');
  // SQ-01=SX + SQ-02=D0 → HIGH_RISK (refused self-harm question but cleared danger).
  if (sq01 === 'SX' && sq02 === 'D0') escalate('HIGH_RISK', 'SQ-01=SX;SQ-02=D0');

  // SQ-03 classifies DISTRESS ONLY and never downgrades HIGH_RISK/CRISIS. Because the
  // DISTRESS rules below only escalate from NORMAL/DISTRESS (never to HIGH_RISK/CRISIS)
  // and `escalate` never lowers `level`, SQ-03 cannot downgrade a higher classification.
  // ── DISTRESS (Safety §5) ───────────────────────────────────────────────
  if (level === 'NORMAL' || level === 'DISTRESS') {
    // SQ-03=F2 (and no HIGH_RISK/CRISIS) → DISTRESS.
    if (sq03 === 'F2') escalate('DISTRESS', 'SQ-03=F2');
    // Approved distress pattern: ≥3 domains score below 25, OR Mood < 25 (Safety §5).
    const patternReason = distressPatternReason(input.domain_scores);
    if (patternReason !== null) escalate('DISTRESS', patternReason);
  }

  if (level === 'NORMAL' && reasons.length === 0) reasons.push('no-safety-trigger');
  return { level, reasons };
}

/**
 * Evaluate the deterministic distress pattern (Safety §5): three or more domains
 * score below 25, OR the Mood domain scores below 25. Returns the reason string when
 * the pattern is met, else null. Reads domain scores as INPUT only — never as a safety
 * level. Missing/empty scores simply mean the pattern cannot fire (no throw).
 */
function distressPatternReason(domainScores?: Record<string, ClassifierDomainScore>): string | null {
  if (!domainScores || Object.keys(domainScores).length === 0) return null;
  let belowThreshold = 0;
  for (const [code, entry] of Object.entries(domainScores)) {
    if (typeof entry?.score !== 'number' || Number.isNaN(entry.score)) {
      throw new Error(`invalid domain score for ${code}`);
    }
    if (entry.score < DISTRESS_DOMAIN_THRESHOLD) belowThreshold += 1;
  }
  const mood = domainScores[MOOD_DOMAIN];
  const moodBelow = typeof mood?.score === 'number' && mood.score < DISTRESS_DOMAIN_THRESHOLD;
  if (moodBelow) return `distress-pattern:${MOOD_DOMAIN}<${DISTRESS_DOMAIN_THRESHOLD}`;
  if (belowThreshold >= DISTRESS_MIN_DOMAINS) {
    return `distress-pattern:>=${DISTRESS_MIN_DOMAINS}-domains<${DISTRESS_DOMAIN_THRESHOLD}`;
  }
  return null;
}