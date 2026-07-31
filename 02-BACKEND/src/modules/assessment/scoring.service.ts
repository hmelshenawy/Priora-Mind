import { Injectable } from '@nestjs/common';
import {
  BAND_THRESHOLDS,
  CURRENT_STATE_MAP,
  DOMAIN_ORDER,
  DOMAIN_QUESTION_IDS,
  type BandThreshold,
  type DomainCode,
} from './assessment-definition';

/**
 * Pure deterministic scoring (Assessment_Specification §7–§9, FR-016, data-model
 * §10). No DB, no network, no AI — fully unit-testable in isolation (Constitution
 * IX, research D5). The submit service calls this AFTER the completeness check,
 * so all 16 current-state answers are present.
 *
 * Formula (Assessment §7):
 *  - positive item: item_score = answer_value
 *  - negative item: item_score = 4 - answer_value
 *  - domain_score  = round(((item_1_score + item_2_score) / 8) × 100)   (integer 0–100)
 *  - both questions required; no domain score from a partial answer.
 *
 * Bands (Assessment §8) are COACHING labels, never safety levels (FR-018). Ties
 * for strongest / support domain resolve to the fixed domain order (§9) — a tie
 * MUST NOT imply one tied domain is clinically more important. No overall score is
 * produced or exposed (FR-016).
 */
@Injectable()
export class ScoringService {
  /** Score all eight domains from the 16 current-state answers. Throws if any
   * required current-state answer is missing (defensive — completeness is checked
   * upstream, but scoring MUST never produce a partial result). */
  score(currentStateAnswers: Record<string, number>): ScoredAssessment {
    const domainScores = {} as Record<DomainCode, DomainScoreView>;
    for (const domain of DOMAIN_ORDER) {
      const [q1, q2] = DOMAIN_QUESTION_IDS[domain];
      const a1 = currentStateAnswers[q1];
      const a2 = currentStateAnswers[q2];
      if (a1 === undefined || a2 === undefined) {
        throw new IncompleteScoringInputError(domain);
      }
      const s1 = itemScore(q1, a1);
      const s2 = itemScore(q2, a2);
      const score = Math.round(((s1 + s2) / 8) * 100);
      domainScores[domain] = { score, band: bandFor(score) };
    }
    return {
      domain_scores: domainScores,
      strongest_domain: tieBreak(DOMAIN_ORDER, domainScores, 'max'),
      support_domain: tieBreak(DOMAIN_ORDER, domainScores, 'min'),
    };
  }
}

/** Per-item adjusted score (Assessment §7). */
function itemScore(questionId: string, answerValue: number): number {
  const { polarity } = CURRENT_STATE_MAP[questionId];
  return polarity === 'P' ? answerValue : 4 - answerValue;
}

/** Coaching band for a 0–100 domain score (Assessment §8). NOT a safety level. */
export function bandFor(score: number): BandThreshold {
  const band = BAND_THRESHOLDS.find((b) => score >= b.min && score <= b.max);
  if (!band) throw new Error(`score out of range: ${score}`);
  return band;
}

/** Resolve the strongest (max) or support (min) domain, breaking ties by the
 * fixed domain order (Assessment §9). */
function tieBreak(
  order: readonly DomainCode[],
  scores: Record<DomainCode, DomainScoreView>,
  mode: 'max' | 'min',
): DomainCode {
  let best = order[0];
  for (const domain of order) {
    const cur = scores[domain].score;
    const prev = scores[best].score;
    if (mode === 'max' ? cur > prev : cur < prev) best = domain;
  }
  return best;
}

export interface DomainScoreView {
  score: number;
  band: BandThreshold;
}

export interface ScoredAssessment {
  domain_scores: Record<DomainCode, DomainScoreView>;
  strongest_domain: DomainCode;
  support_domain: DomainCode;
}

/** Thrown when scoring is attempted with a missing current-state answer. */
export class IncompleteScoringInputError extends Error {
  constructor(readonly domain: DomainCode) {
    super(`incomplete scoring input for domain ${domain}`);
    this.name = 'IncompleteScoringInputError';
  }
}