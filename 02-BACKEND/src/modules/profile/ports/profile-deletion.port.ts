/**
 * Profile deletion contract (research D10, data-model §14, Consent §8).
 *
 * The platform RetentionModule (Polish) calls this port — it never touches
 * Profile tables directly (SAD §5 / ADR-005). Two paths:
 *  - Scheduled retention: incomplete onboarding/profile/preferences (30d
 *    inactivity) for accounts with no surviving activity.
 *  - Account deletion (Consent §9): remove a user's profile/preferences/onboarding
 *    rows (idempotent, counted). The schema cascades on user deletion; this is
 *    the explicit counted path used by account deletion. Counters are
 *    sanitized integers only (FR-030, research D7).
 */

export interface ProfileCutoffs {
  /** Delete onboarding state + profile/preferences whose lastActivityAt is before this. */
  onboardingBefore: Date;
}

export interface DeletionCategoryCounters {
  deleted: number;
  errors: number;
}

export const PROFILE_DELETION_PORT = Symbol('PROFILE_DELETION_PORT');

export interface ProfileDeletionPort {
  /** Scheduled retention: incomplete onboarding/profile/preferences (Consent §8). */
  deleteExpired(cutoffs: ProfileCutoffs): Promise<DeletionCategoryCounters>;
  /** Account deletion (Consent §9): remove a user's profile data (idempotent). */
  deleteProfileForUsers(userIds: string[]): Promise<DeletionCategoryCounters>;
}