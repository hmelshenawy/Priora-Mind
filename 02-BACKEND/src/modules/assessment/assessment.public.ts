/**
 * Intentional public surface for consumers of Assessment result capabilities.
 * Assessment lifecycle, persistence, scoring, and mapping remain internal.
 */
export { AssessmentResultService } from './services/assessment-result.service';
export type { ScoredResultDto } from './dto/assessment.dto';
export { ResultNotFoundException } from './constants/assessment.errors';
export { AssessmentSafetyLifecycleService } from './services/assessment-safety-lifecycle.service';
export {
  ASSESSMENT_DELETION_PORT,
  type AssessmentDeletionPort,
  type AssessmentDeletionResult,
} from './ports/assessment-deletion.port';
