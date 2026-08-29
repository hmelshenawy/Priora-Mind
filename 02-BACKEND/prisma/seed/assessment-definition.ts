/**
 * AssessmentDefinition v1.0 seed row (data-model §12, Assessment_Specification
 * v1.0, research D5). The DB row records that v1.0 is the active, immutable
 * definition; `content` mirrors the typed constant
 * ASSESSMENT_DEFINITION_V1 (src/modules/assessment/constants/assessment-definition.ts),
 * which the application uses as the behavioral source of truth for scoring +
 * validation + the definition endpoint. Used by the in-memory contract/e2e
 * tests to seed the AssessmentDefinition row. The production seed is inlined in
 * migration m_assessment_def.
 */

import { ASSESSMENT_DEFINITION_V1 } from '../../src/modules/assessment/constants/assessment-definition';

export interface AssessmentDefinitionSeed {
  id: string;
  version: string;
  isActive: boolean;
  content: unknown;
}

/** The v1.0 assessment definition row (active; content = the typed constant). */
export const ASSESSMENT_DEFINITION_V1_ROW: AssessmentDefinitionSeed = {
  id: 'assessment-definition-v1',
  version: ASSESSMENT_DEFINITION_V1.version,
  isActive: true,
  content: ASSESSMENT_DEFINITION_V1,
};