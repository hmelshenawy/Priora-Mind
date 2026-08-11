import { describe, it, expect } from 'vitest';
import { presentResult } from '../../../../src/modules/assessment/dto/result-presenter';
import type {
  ResultDomainScore,
  ResultResponse,
  DomainCode,
} from '../../../../src/modules/assessment/dto/assessment.dto';
import { DOMAIN_LABELS_EN, DOMAIN_LABELS_AR } from '../../../../src/modules/assessment/constants/assessment-definition';

/**
 * T055 — Result presenter unit (Assessment §9, FR-016/FR-017/FR-018, SC-002).
 * Pure assembly of the stored result into a non-diagnostic coaching insight:
 * 8 domain scores + bands, strongest + support domain, selected priorities
 * preserved SEPARATELY, a goal-alignment note when the lowest-scoring domain
 * differs from the first chosen goal, the explicit non-diagnostic statement,
 * and the transition point. NO overall score. EN/AR parity (Constitution X).
 */
function domainScore(domain: DomainCode, score: number, band: [string, string]): ResultDomainScore {
  return { domain, score, band: { label_en: band[0], label_ar: band[1] } };
}

const BANDS = {
  strength: ['Current strength', 'نقطة قوة حالية'],
  steady: ['Relatively steady', 'مستقر نسبيًا'],
  attention: ['Needs attention', 'يحتاج إلى اهتمام'],
  support: ['Needs near-term support', 'يحتاج إلى دعم قريب'],
} as const;

function fullResult(overrides: Partial<ResultResponse> = {}): ResultResponse {
  return {
    result_id: 'r-1',
    definition_version: 'assessment-1.0',
    domain_scores: [
      domainScore('stress', 100, BANDS.strength),
      domainScore('mood', 75, BANDS.strength),
      domainScore('energy', 50, BANDS.steady),
      domainScore('sleep', 25, BANDS.attention),
      domainScore('focus', 0, BANDS.support),
      domainScore('confidence', 50, BANDS.steady),
      domainScore('relationships', 50, BANDS.steady),
      domainScore('balance', 50, BANDS.steady),
    ],
    strongest_domain: 'stress',
    support_domain: 'focus',
    selected_priorities: { domains: ['mood', 'sleep'], ranking: { mood: 1, sleep: 2 } },
    goal_free_text: { AG_03: { mood: { text: 'feel calmer' } } },
    ...overrides,
  };
}

describe('ResultPresenter (US5)', () => {
  it('returns 8 domain scores + bands and preserves selected priorities separately (FR-016)', () => {
    const insight = presentResult(fullResult());
    expect(insight.domain_scores).toHaveLength(8);
    expect(insight.domain_scores[0]).toMatchObject({
      domain: 'stress',
      score: 100,
      band: { label_en: 'Current strength', label_ar: 'نقطة قوة حالية' },
    });
    // Priorities preserved as their own structure, not merged into scores.
    expect(insight.selected_priorities).toEqual({ domains: ['mood', 'sleep'], ranking: { mood: 1, sleep: 2 } });
  });

  it('identifies strongest and support domains (Assessment §9)', () => {
    const insight = presentResult(fullResult());
    expect(insight.strongest_domain).toBe('stress');
    expect(insight.support_domain).toBe('focus');
  });

  it('never includes an overall_score (FR-016)', () => {
    const insight = presentResult(fullResult());
    expect(insight).not.toHaveProperty('overall_score');
  });

  it('includes the non-diagnostic statement in EN + AR (FR-017, SC-002)', () => {
    const insight = presentResult(fullResult());
    expect(insight.non_diagnostic_statement.en).toMatch(/not a medical diagnosis/i);
    expect(insight.non_diagnostic_statement.en).toMatch(/not a substitute for professional care/i);
    expect(insight.non_diagnostic_statement.ar).toMatch(/ليست تشخيص/);
    expect(insight.non_diagnostic_statement.ar).toMatch(/بديلًا عن الرعاية المتخصصة|بديل عن الرعاية المتخصصة/);
  });

  it('includes the transition point in EN + AR without claiming a plan is created (FR-018)', () => {
    const insight = presentResult(fullResult());
    expect(insight.transition_point.en).toMatch(/future release/i);
    expect(insight.transition_point.en).not.toMatch(/plan (is |has been )created/i);
    expect(insight.transition_point.ar).toMatch(/إصدار لاحق/);
  });

  it('adds a goal-alignment note when the lowest domain differs from the top priority (Assessment §9)', () => {
    // Top priority = mood (rank 1); lowest domain = focus → differ.
    const insight = presentResult(fullResult());
    expect(insight.goal_alignment_note).not.toBeNull();
    expect(insight.goal_alignment_note!.en).toContain(DOMAIN_LABELS_EN.mood);
    expect(insight.goal_alignment_note!.en).toContain(DOMAIN_LABELS_EN.focus);
    expect(insight.goal_alignment_note!.ar).toContain(DOMAIN_LABELS_AR.mood);
    expect(insight.goal_alignment_note!.ar).toContain(DOMAIN_LABELS_AR.focus);
  });

  it('omits the goal-alignment note when the top priority is the lowest domain', () => {
    const insight = presentResult(fullResult({
      strongest_domain: 'stress',
      support_domain: 'mood',
      selected_priorities: { domains: ['mood'], ranking: { mood: 1 } },
    }));
    expect(insight.goal_alignment_note).toBeNull();
  });

  it('omits the goal-alignment note when no priorities are selected', () => {
    const insight = presentResult(fullResult({
      selected_priorities: { domains: [], ranking: {} },
    }));
    expect(insight.goal_alignment_note).toBeNull();
  });

  it('uses the first ranked priority as the top goal (AG-02 rank 1), not the first listed domain', () => {
    // domains list order: [sleep, mood] but ranking says mood is rank 1.
    const insight = presentResult(fullResult({
      support_domain: 'sleep',
      selected_priorities: { domains: ['sleep', 'mood'], ranking: { sleep: 2, mood: 1 } },
    }));
    // top goal = mood (rank 1); lowest = sleep → differ → note mentions mood + sleep.
    expect(insight.goal_alignment_note).not.toBeNull();
    expect(insight.goal_alignment_note!.en).toContain(DOMAIN_LABELS_EN.mood);
    expect(insight.goal_alignment_note!.en).toContain(DOMAIN_LABELS_EN.sleep);
  });

  it('falls back to the first listed domain when no ranking is present', () => {
    const insight = presentResult(fullResult({
      support_domain: 'sleep',
      selected_priorities: { domains: ['mood', 'sleep'], ranking: {} },
    }));
    expect(insight.goal_alignment_note).not.toBeNull();
    expect(insight.goal_alignment_note!.en).toContain(DOMAIN_LABELS_EN.mood);
  });

  it('carries the result_id + definition_version through (immutable result identity)', () => {
    const insight = presentResult(fullResult());
    expect(insight.result_id).toBe('r-1');
    expect(insight.definition_version).toBe('assessment-1.0');
  });
});