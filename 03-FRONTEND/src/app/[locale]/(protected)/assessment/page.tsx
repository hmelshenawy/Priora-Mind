import { AssessmentWizard } from '../../../../features/assessment/assessment-wizard';

/**
 * /assessment (US4, FR-012/FR-035, contracts/assessment.md).
 * Server component shell; the client wizard owns intro → questions → review →
 * submit. Backend guards (EMAIL_VERIFIED + consent + profile) enforce access;
 * the RequireAuth wrapper is UX only (FR-028).
 */
export default function AssessmentPage() {
  return <AssessmentWizard />;
}