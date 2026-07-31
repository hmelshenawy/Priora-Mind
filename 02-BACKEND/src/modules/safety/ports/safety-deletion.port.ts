/**
 * Safety deletion contract (research D10, data-model §14, contracts/safety.md
 * "Retention & deletion"). The platform RetentionModule (Polish) calls this port —
 * it never touches Safety tables directly (SAD §5 / ADR-005). Two paths:
 *  - Scheduled retention: `SafetyEvaluation` rows tied to expired incomplete
 *    assessments (Consent §8, FR-031) are hard-deleted. Historical evaluations are
 *    immutable until deletion — never edited or relabeled (Safety Matrix §9).
 *  - Account deletion (Consent §9): remove a user's full safety evaluation history
 *    (idempotent, counted). The InMemoryPrisma user-cascade also drops these rows;
 *    this is the explicit counted path used by account deletion.
 *
 * `SafetyEvaluation` references `assessmentId` as a LOOSE reference (no FK relation —
 * Safety owns the model; data-model §11), so assessment deletion does NOT cascade;
 * this port is the explicit cleanup. Counters are sanitized integers only (FR-030,
 * research D7) — no levels, reasons, or answers are ever emitted to logs.
 */

export interface SafetyCutoffs {
  /** Delete safety evaluations tied to incomplete assessments whose lastActivityAt
   * is before this instant (Consent §8). */
  incompleteBefore: Date;
}

export interface DeletionCategoryCounters {
  deleted: number;
  errors: number;
}

export const SAFETY_DELETION_PORT = Symbol('SAFETY_DELETION_PORT');

export interface SafetyDeletionPort {
  /** Scheduled retention: safety evaluations tied to expired incomplete assessments. */
  deleteExpired(cutoffs: SafetyCutoffs): Promise<DeletionCategoryCounters>;
  /** Account deletion (Consent §9): remove a user's safety evaluation history. */
  deleteSafetyForUsers(userIds: string[]): Promise<DeletionCategoryCounters>;
}