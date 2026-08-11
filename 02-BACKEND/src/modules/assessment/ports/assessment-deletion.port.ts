/**
 * Assessment deletion contract (research D10, data-model §14, contracts/
 * assessment.md "Retention & deletion").
 *
 * The platform RetentionModule (Polish) calls this port — it never touches
 * Assessment tables directly (SAD §5 / ADR-005). Two paths:
 *  - Scheduled retention: incomplete assessments (NOT_STARTED/IN_PROGRESS/
 *    SUSPENDED) whose `lastActivityAt` is before the cutoff are hard-deleted;
 *    their answers cascade. Completed (SCORED) results are retained while the
 *    account exists (Consent §8, contracts/assessment.md).
 *  - Account deletion (Consent §9): remove a user's assessments + answers +
 *    results (idempotent, counted). The schema cascades on user deletion; this
 *    is the explicit counted path used by account deletion.
 *
 * Counters are sanitized integers only (FR-030, research D7) — no answer text,
 * scores, or goals are ever emitted to logs.
 */

export interface AssessmentCutoffs {
  /** Delete incomplete assessments whose lastActivityAt is before this instant. */
  incompleteBefore: Date;
}

export interface DeletionCategoryCounters {
  deleted: number;
  errors: number;
}

export interface AssessmentDeletionResult extends DeletionCategoryCounters {
  /** Sanitized loose-reference IDs passed internally to Safety cleanup. */
  assessmentIds: string[];
}

export const ASSESSMENT_DELETION_PORT = Symbol('ASSESSMENT_DELETION_PORT');

export interface AssessmentDeletionPort {
  /** Scheduled retention: incomplete assessments + their answers (Consent §8). */
  deleteExpired(cutoffs: AssessmentCutoffs): Promise<AssessmentDeletionResult>;
  /** Account deletion (Consent §9): remove a user's assessment data (idempotent). */
  deleteAssessmentForUsers(userIds: string[]): Promise<DeletionCategoryCounters>;
}
