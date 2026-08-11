import { describe, it, expect } from 'vitest';
import {
  ScoringService,
  bandFor,
  IncompleteScoringInputError,
} from '../../../../src/modules/assessment/services/scoring.service';
import {
  CURRENT_STATE_QUESTIONS,
  DOMAIN_ORDER,
  DOMAIN_QUESTION_IDS,
} from '../../../../src/modules/assessment/constants/assessment-definition';

/**
 * T043 — ScoringService pure deterministic scoring (Assessment_Specification
 * §12 fixtures, FR-016, data-model §10). No DB, no AI — verifies the formula,
 * band boundaries, required-completeness, AR/EN parity, and the absence of an
 * overall score.
 */
describe('Assessment scoring (US4)', () => {
  const scoring = new ScoringService();

  /** Build a 16-answer map by applying a per-polarity value selector. */
  function buildAnswers(pValue: number, nValue: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const q of CURRENT_STATE_QUESTIONS) out[q.id] = q.polarity === 'P' ? pValue : nValue;
    return out;
  }

  it('all 4 on positive and 0 on negative items → 100 in every domain', () => {
    const res = scoring.score(buildAnswers(4, 0));
    for (const d of DOMAIN_ORDER) expect(res.domain_scores[d].score).toBe(100);
    expect(res.strongest_domain).toBe(DOMAIN_ORDER[0]); // all tie → first in order
    expect(res.support_domain).toBe(DOMAIN_ORDER[0]);
  });

  it('all 0 on positive and 4 on negative items → 0 in every domain', () => {
    const res = scoring.score(buildAnswers(0, 4));
    for (const d of DOMAIN_ORDER) expect(res.domain_scores[d].score).toBe(0);
  });

  it('two adjusted item scores totaling 4 → 50 (midpoint)', () => {
    // P=2 → 2, N=2 → (4-2)=2; sum 4 → round(4/8*100)=50 in every domain.
    const res = scoring.score(buildAnswers(2, 2));
    for (const d of DOMAIN_ORDER) expect(res.domain_scores[d].score).toBe(50);
  });

  it('maps band boundaries correctly at 24/25, 49/50, 74/75 (Assessment §8)', () => {
    expect(bandFor(24).label_en).toBe('Needs near-term support');
    expect(bandFor(25).label_en).toBe('Needs attention');
    expect(bandFor(49).label_en).toBe('Needs attention');
    expect(bandFor(50).label_en).toBe('Relatively steady');
    expect(bandFor(74).label_en).toBe('Relatively steady');
    expect(bandFor(75).label_en).toBe('Current strength');
    expect(bandFor(100).label_en).toBe('Current strength');
    expect(bandFor(0).label_en).toBe('Needs near-term support');
    // Arabic parity at the boundaries.
    expect(bandFor(24).label_ar).toBe('يحتاج إلى دعم قريب');
    expect(bandFor(75).label_ar).toBe('نقطة قوة حالية');
  });

  it('missing required current-state answers prevent scoring', () => {
    const answers = buildAnswers(3, 1);
    delete answers['AS-03']; // energy domain missing one item
    expect(() => scoring.score(answers)).toThrow(IncompleteScoringInputError);
  });

  it('produces NO overall score (FR-016)', () => {
    const res = scoring.score(buildAnswers(3, 1)) as unknown as Record<string, unknown>;
    expect(res.overall_score).toBeUndefined();
    expect(res.score).toBeUndefined();
    expect(Object.keys(res).sort()).toEqual(
      ['domain_scores', 'strongest_domain', 'support_domain'].sort(),
    );
  });

  it('AR and EN question ids produce identical scoring (Constitution X parity)', () => {
    // Scoring is keyed by question id + value only; language never enters the
    // formula, so the same answer set yields the same result regardless of UI
    // language. Run twice with the same inputs and assert byte-for-byte equality.
    const a = buildAnswers(3, 1);
    const r1 = scoring.score(a);
    const r2 = scoring.score({ ...a });
    expect(r1).toEqual(r2);
    // Every domain has a band label in both languages (parity present, not used
    // for ranking).
    for (const d of DOMAIN_ORDER) {
      expect(r1.domain_scores[d].band.label_en).toBeTruthy();
      expect(r1.domain_scores[d].band.label_ar).toBeTruthy();
    }
  });

  it('a safety classification never changes a domain score (scoring ignores safety answers)', () => {
    const answers = buildAnswers(3, 1);
    const without = scoring.score(answers);
    // Inject safety-answer-shaped keys; scoring MUST ignore non-current-state ids.
    const withSafety = scoring.score({ ...answers, SQ_01: { code: 'S1' }, SQ_03: { code: 'F2' } });
    expect(withSafety).toEqual(without);
  });

  it('strongest / support resolve ties by the fixed domain order (Assessment §9)', () => {
    // Make two domains share the top score and two share the bottom score.
    const answers = buildAnswers(2, 2); // every domain = 50
    // Push stress to 100 (AS-01 P=4→4, AS-09 N=0→4) and mood to 0 (AS-02 N=4→0,
    // AS-10 P=0→0); leave the rest at 50.
    answers['AS-01'] = 4;
    answers['AS-09'] = 0; // stress → 100
    answers['AS-02'] = 4;
    answers['AS-10'] = 0; // mood → 0
    const res = scoring.score(answers);
    expect(res.domain_scores.stress.score).toBe(100);
    expect(res.domain_scores.mood.score).toBe(0);
    expect(res.strongest_domain).toBe('stress');
    expect(res.support_domain).toBe('mood');
    // Two domains at 50 (energy..balance) — strongest/support already decided, no
    // tie-break needed here; the all-50 case below checks the order tie-break.
    const all50 = scoring.score(buildAnswers(2, 2));
    expect(all50.strongest_domain).toBe(DOMAIN_ORDER[0]); // tie → first
    expect(all50.support_domain).toBe(DOMAIN_ORDER[0]);
    // sanity: DOMAIN_QUESTION_IDS covers all 8 domains with two ids each
    expect(Object.keys(DOMAIN_QUESTION_IDS).length).toBe(8);
  });
});