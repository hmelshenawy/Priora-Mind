import { SAFETY_QUESTIONS } from '../../safety/safety.public';
import {
  ASSESSMENT_DEFINITION_V1,
  CURRENT_STATE_QUESTIONS,
  GOAL_QUESTIONS,
} from '../constants/assessment-definition';
import type { DefinitionResponse } from './assessment.dto';

/**
 * Pure assessment-definition view (Constitution VIII split — handwritten files MUST
 * NOT exceed 300 lines). Projects the typed definition constants onto the wire
 * `DefinitionResponse` (contracts/assessment.md). Pure — reads only typed constants,
 * holds no state, does no logging (FR-030). US6: the three unscored safety questions
 * (Safety Matrix §3); SQ-02 is shown only when SQ-01 ∈ {S1,S2,SX} (shownWhen) — the
 * lifecycle enforces that gate.
 */
export function buildDefinitionResponse(): DefinitionResponse {
  return {
    version: ASSESSMENT_DEFINITION_V1.version,
    instruction: {
      en: ASSESSMENT_DEFINITION_V1.current_state_instruction_en,
      ar: ASSESSMENT_DEFINITION_V1.current_state_instruction_ar,
    },
    questions: CURRENT_STATE_QUESTIONS.map((q) => ({
      id: q.id,
      domain: q.domain,
      polarity: q.polarity,
      scale: {
        en: [...ASSESSMENT_DEFINITION_V1.scale_labels_en],
        ar: [...ASSESSMENT_DEFINITION_V1.scale_labels_ar],
      },
      required: true,
      en: q.en,
      ar: q.ar,
    })),
    goal_questions: GOAL_QUESTIONS.map((g) => ({
      id: g.id,
      kind: g.kind,
      required: g.required,
      prompt_en: g.prompt_en,
      prompt_ar: g.prompt_ar,
    })),
    safety_questions: SAFETY_QUESTIONS.map((q) => ({
      id: q.id,
      required: q.required,
      shown_when: q.shownWhen ? [...q.shownWhen] : null,
      prompt_en: q.prompt_en,
      prompt_ar: q.prompt_ar,
      options: q.options.map((o) => ({ code: o.code, en: o.en, ar: o.ar })),
    })),
    band_thresholds: ASSESSMENT_DEFINITION_V1.band_thresholds.map((b) => ({
      min: b.min,
      max: b.max,
      label_en: b.label_en,
      label_ar: b.label_ar,
    })),
    domain_labels: {
      en: { ...ASSESSMENT_DEFINITION_V1.domain_labels_en },
      ar: { ...ASSESSMENT_DEFINITION_V1.domain_labels_ar },
    },
  };
}
