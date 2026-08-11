import { describe, it, expect } from 'vitest';
import { classifySafety } from '../../src/modules/safety/safety-classifier';
import type { ClassifierInput } from '../../src/modules/safety/safety-classifier';
import {
  DISTRESS_DOMAIN_THRESHOLD,
  DISTRESS_MIN_DOMAINS,
  MOOD_DOMAIN,
} from '../../src/modules/safety/safety-definition';

/**
 * T059 — pure safety-classifier unit tests (Safety_Decision_Matrix §5 + §12 required
 * validation fixtures, FR-026, SC-004). The classifier is a pure function (no DB /
 * network / LLM), so these tests need no Prisma fixture. Covers the §12 fixtures
 * verbatim plus the determinism, highest-risk-wins, and never-downgrade invariants.
 *
 * Domain code set used for the distress-pattern fixtures (mirrors the assessment
 * definition): mood, stress, sleep, focus, energy, connection, motivation, outlook.
 */

const ALL_DOMAINS = ['mood', 'stress', 'sleep', 'focus', 'energy', 'connection', 'motivation', 'outlook'];

/** Build a domain-score map where every domain has the given score. */
const scoresAll = (score: number): Record<string, { score: number }> =>
  Object.fromEntries(ALL_DOMAINS.map((d) => [d, { score }]));

/** Build a domain-score map with `mood` at `moodScore` and every other domain at
 * `otherScore`. */
const scoresWith = (moodScore: number, otherScore: number): Record<string, { score: number }> => ({
  ...scoresAll(otherScore),
  [MOOD_DOMAIN]: { score: moodScore },
});

describe('safety-classifier — §12 required validation fixtures', () => {
  it('S0 → no direct safety escalation (NORMAL)', () => {
    const r = classifySafety({ safety_answers: { 'SQ-01': 'S0' } });
    expect(r.level).toBe('NORMAL');
  });

  it('S1 + D0 → HIGH_RISK', () => {
    const r = classifySafety({ safety_answers: { 'SQ-01': 'S1', 'SQ-02': 'D0' } });
    expect(r.level).toBe('HIGH_RISK');
    expect(r.reasons).toContain('SQ-01=S1;SQ-02=D0');
  });

  it('S1 + D1 → CRISIS', () => {
    const r = classifySafety({ safety_answers: { 'SQ-01': 'S1', 'SQ-02': 'D1' } });
    expect(r.level).toBe('CRISIS');
    expect(r.reasons).toContain('SQ-02=D1');
  });

  it('S2 → immediate CRISIS (SQ-02 not required)', () => {
    const r = classifySafety({ safety_answers: { 'SQ-01': 'S2' } });
    expect(r.level).toBe('CRISIS');
    expect(r.reasons).toContain('SQ-01=S2');
  });

  it('SX + DX → CRISIS', () => {
    const r = classifySafety({ safety_answers: { 'SQ-01': 'SX', 'SQ-02': 'DX' } });
    expect(r.level).toBe('CRISIS');
    expect(r.reasons).toContain('SQ-02=DX (after SQ-01 in {S1,S2,SX})');
  });

  it('SQ-03=F2 (with no SQ-01/SQ-02 trigger) → DISTRESS', () => {
    const r = classifySafety({ safety_answers: { 'SQ-01': 'S0', 'SQ-03': 'F2' } });
    expect(r.level).toBe('DISTRESS');
    expect(r.reasons).toContain('SQ-03=F2');
  });

  it('SQ-03=F0/F1/FX → no direct safety escalation from SQ-03 alone', () => {
    for (const code of ['F0', 'F1', 'FX'] as const) {
      const r = classifySafety({ safety_answers: { 'SQ-01': 'S0', 'SQ-03': code } });
      expect(r.level).toBe('NORMAL');
    }
  });

  it('SQ-03 never downgrades HIGH_RISK or CRISIS (S2 + F2 → CRISIS, not DISTRESS)', () => {
    const r = classifySafety({ safety_answers: { 'SQ-01': 'S2', 'SQ-03': 'F2' } });
    expect(r.level).toBe('CRISIS');
    expect(r.reasons).toContain('SQ-01=S2');
    expect(r.reasons).not.toContain('SQ-03=F2');
  });

  it('SQ-03 never downgrades HIGH_RISK (S1 + D0 + F2 → HIGH_RISK)', () => {
    const r = classifySafety({
      safety_answers: { 'SQ-01': 'S1', 'SQ-02': 'D0', 'SQ-03': 'F2' },
    });
    expect(r.level).toBe('HIGH_RISK');
    expect(r.reasons).toContain('SQ-01=S1;SQ-02=D0');
  });
});

describe('safety-classifier — distress threshold boundaries (§12)', () => {
  it('Mood below threshold → DISTRESS even with no SQ-03 trigger', () => {
    const r = classifySafety({
      safety_answers: { 'SQ-01': 'S0', 'SQ-03': 'F0' },
      domain_scores: scoresWith(DISTRESS_DOMAIN_THRESHOLD - 1, 80),
    });
    expect(r.level).toBe('DISTRESS');
    expect(r.reasons).toContain(`distress-pattern:${MOOD_DOMAIN}<${DISTRESS_DOMAIN_THRESHOLD}`);
  });

  it('Mood exactly at threshold is NOT distress (boundary: < is strict)', () => {
    const r = classifySafety({
      safety_answers: { 'SQ-01': 'S0', 'SQ-03': 'F0' },
      domain_scores: scoresWith(DISTRESS_DOMAIN_THRESHOLD, 80),
    });
    expect(r.level).toBe('NORMAL');
  });

  it(`≥${DISTRESS_MIN_DOMAINS} domains below threshold → DISTRESS (Mood safe)`, () => {
    // Keep Mood above the threshold so only the ≥3-domains rule fires.
    const scores = scoresAll(80);
    const nonMood = ALL_DOMAINS.filter((d) => d !== MOOD_DOMAIN);
    for (const d of nonMood.slice(0, DISTRESS_MIN_DOMAINS)) scores[d] = { score: 10 };
    const r = classifySafety({
      safety_answers: { 'SQ-01': 'S0', 'SQ-03': 'F0' },
      domain_scores: scores,
    });
    expect(r.level).toBe('DISTRESS');
    expect(r.reasons).toContain(
      `distress-pattern:>=${DISTRESS_MIN_DOMAINS}-domains<${DISTRESS_DOMAIN_THRESHOLD}`,
    );
  });

  it(`${DISTRESS_MIN_DOMAINS - 1} domains below threshold is NOT distress (boundary)`, () => {
    // Keep Mood above the threshold; only 2 non-Mood domains are below it.
    const scores = scoresAll(80);
    const nonMood = ALL_DOMAINS.filter((d) => d !== MOOD_DOMAIN);
    for (const d of nonMood.slice(0, DISTRESS_MIN_DOMAINS - 1)) scores[d] = { score: 10 };
    const r = classifySafety({
      safety_answers: { 'SQ-01': 'S0', 'SQ-03': 'F0' },
      domain_scores: scores,
    });
    expect(r.level).toBe('NORMAL');
  });

  it('distress pattern never downgrades CRISIS', () => {
    const r = classifySafety({
      safety_answers: { 'SQ-01': 'S2' },
      domain_scores: scoresAll(0),
    });
    expect(r.level).toBe('CRISIS');
  });
});

describe('safety-classifier — highest-risk-wins + determinism (§5/§10)', () => {
  it('S2 + D0 → CRISIS (S2 wins over the HIGH_RISK that D0 alone would imply)', () => {
    const r = classifySafety({ safety_answers: { 'SQ-01': 'S2', 'SQ-02': 'D0' } });
    expect(r.level).toBe('CRISIS');
  });

  it('S1 + D1 → CRISIS (D1 wins over HIGH_RISK)', () => {
    const r = classifySafety({ safety_answers: { 'SQ-01': 'S1', 'SQ-02': 'D1' } });
    expect(r.level).toBe('CRISIS');
  });

  it('is deterministic — same input always yields the same output', () => {
    const input: ClassifierInput = {
      safety_answers: { 'SQ-01': 'S1', 'SQ-02': 'D0', 'SQ-03': 'F2' },
      domain_scores: scoresWith(10, 10),
    };
    const a = classifySafety(input);
    const b = classifySafety(input);
    expect(a).toEqual(b);
  });

  it('empty input → NORMAL with a no-safety-trigger reason', () => {
    const r = classifySafety({});
    expect(r.level).toBe('NORMAL');
    expect(r.reasons).toContain('no-safety-trigger');
  });

  it('intermediate state: S1 with SQ-02 unanswered → NORMAL (continue, show SQ-02)', () => {
    const r = classifySafety({ safety_answers: { 'SQ-01': 'S1' } });
    expect(r.level).toBe('NORMAL');
  });

  it('intermediate state: SX with SQ-02 unanswered → NORMAL', () => {
    const r = classifySafety({ safety_answers: { 'SQ-01': 'SX' } });
    expect(r.level).toBe('NORMAL');
  });

  it('fail closed: invalid SQ-01 code throws (service fails closed on throw)', () => {
    expect(() => classifySafety({ safety_answers: { 'SQ-01': 'ZZ' as never } })).toThrow();
  });

  it('fail closed: non-numeric domain score throws', () => {
    expect(() =>
      classifySafety({
        safety_answers: { 'SQ-01': 'S0' },
        domain_scores: { mood: { score: 'hi' as unknown as number } },
      }),
    ).toThrow();
  });

  it('absent domain_scores never throw and never escalate (pattern cannot fire)', () => {
    const r = classifySafety({ safety_answers: { 'SQ-01': 'S0', 'SQ-03': 'F0' } });
    expect(r.level).toBe('NORMAL');
  });
});