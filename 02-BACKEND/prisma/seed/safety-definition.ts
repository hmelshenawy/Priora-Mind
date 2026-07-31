/**
 * Safety v1.0 seed rows (data-model §12, Safety_Decision_Matrix v1.0, research D5).
 *
 * The DB rows record that v1.0 is the active, immutable safety definition + copy;
 * their content mirrors the typed constants in
 * `src/modules/safety/safety-definition.ts` (SAFETY_QUESTIONS, SAFETY_COPY,
 * SAFETY_ACTIONS, APPROVED_RESOURCES, thresholds), which the application uses as
 * the behavioral source of truth for classification + copy resolution + the
 * definition endpoint + SQ answer validation. Used by the in-memory
 * contract/unit/e2e tests to seed the SafetyDefinition + SafetyCopy rows. The
 * production seed is inlined in migration m_safety_def (idempotent INSERTs).
 *
 * EmergencyResource is intentionally EMPTY for MVP (Safety §8/§13, FR-024) — no
 * hotline numbers, providers, or contacts are invented; approved, versioned rows
 * are added only after safety-reviewer approval. APPROVED_RESOURCES stays `[]`.
 *
 * INVARIANT (Safety §2/§5, FR-019): safety classification is SEPARATE from assessment
 * scoring. SQ-01/SQ-02 determine HIGH_RISK/CRISIS; SQ-03 classifies DISTRESS ONLY and
 * never downgrades HIGH_RISK/CRISIS (highest-risk-wins). All SQ questions are unscored.
 */

import {
  SAFETY_COPY,
  SAFETY_DEFINITION_VERSION,
  SAFETY_MATRIX_VERSION,
  DISTRESS_DOMAIN_THRESHOLD,
  DISTRESS_MIN_DOMAINS,
  MOOD_DOMAIN,
  SAFETY_QUESTIONS,
} from '../../src/modules/safety/safety-definition';

export interface SafetyDefinitionSeed {
  id: string;
  version: string;
  isActive: boolean;
  content: unknown;
}

export interface SafetyCopySeed {
  id: string;
  version: string;
  level: 'DISTRESS' | 'HIGH_RISK' | 'CRISIS' | 'UNAVAILABLE';
  copyEn: string;
  copyAr: string;
}

/** The structured v1.0 safety definition (mirrors safety-definition.ts; stored as
 * the immutable JSONB audit/version row). The classifier + lifecycle read the typed
 * constants, not this row — keep them in sync. */
const SAFETY_DEFINITION_V1_CONTENT = {
  version: SAFETY_DEFINITION_VERSION,
  matrix_version: SAFETY_MATRIX_VERSION,
  sq_questions: SAFETY_QUESTIONS,
  distress_threshold: DISTRESS_DOMAIN_THRESHOLD,
  distress_min_domains: DISTRESS_MIN_DOMAINS,
  mood_domain: MOOD_DOMAIN,
};

/** The v1.0 SafetyDefinition row (active; content = the structured definition). */
export const SAFETY_DEFINITION_V1_ROW: SafetyDefinitionSeed = {
  id: 'safety-definition-v1',
  version: SAFETY_DEFINITION_VERSION,
  isActive: true,
  content: SAFETY_DEFINITION_V1_CONTENT,
};

/** The v1.0 SafetyCopy rows (Safety Matrix §7 — exact approved deterministic copy). */
export const SAFETY_COPY_V1_ROWS: readonly SafetyCopySeed[] = [
  {
    id: 'safety-copy-distress-v1',
    version: SAFETY_DEFINITION_VERSION,
    level: 'DISTRESS',
    copyEn: SAFETY_COPY.DISTRESS.en,
    copyAr: SAFETY_COPY.DISTRESS.ar,
  },
  {
    id: 'safety-copy-high-risk-v1',
    version: SAFETY_DEFINITION_VERSION,
    level: 'HIGH_RISK',
    copyEn: SAFETY_COPY.HIGH_RISK.en,
    copyAr: SAFETY_COPY.HIGH_RISK.ar,
  },
  {
    id: 'safety-copy-crisis-v1',
    version: SAFETY_DEFINITION_VERSION,
    level: 'CRISIS',
    copyEn: SAFETY_COPY.CRISIS.en,
    copyAr: SAFETY_COPY.CRISIS.ar,
  },
  {
    id: 'safety-copy-unavailable-v1',
    version: SAFETY_DEFINITION_VERSION,
    level: 'UNAVAILABLE',
    copyEn: SAFETY_COPY.UNAVAILABLE.en,
    copyAr: SAFETY_COPY.UNAVAILABLE.ar,
  },
];

/** EmergencyResource rows for v1.0 — intentionally empty (Safety §8/§13, FR-024).
 * No hotline/provider/contact is invented; approved rows are added only after
 * safety-reviewer approval per country. Mirrors APPROVED_RESOURCES = []. */
export const EMERGENCY_RESOURCE_V1_ROWS: readonly never[] = [];