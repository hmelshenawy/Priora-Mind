/**
 * Auth deletion contract (research D10, data-model §14).
 *
 * The platform RetentionModule (Polish) calls this port — it never touches Auth
 * tables directly (SAD §5 / ADR-005). US1 implements the unverified-account +
 * token cleanup side; US2 (T034) adds explicit consent-record removal for the
 * user-initiated account-deletion flow (Consent §9). Per Consent §8, superseded
 * consent records are retained while the account exists, so there is no
 * time-based consent cutoff on the scheduled cron — consent rows are removed via
 * cascade when an account is hard-deleted, and `deleteConsentForUsers` is the
 * explicit, counted path used by account deletion. Counters are sanitized
 * integers only (FR-030, research D7).
 */

export interface AuthCutoffs {
  /** Delete REGISTERED accounts whose lastActivityAt is before this instant. */
  unverifiedAccountBefore: Date;
  /** Delete EMAIL_VERIFIED accounts that never granted consent (Consent §8). */
  preConsentAccountBefore: Date;
}

export interface DeletionCategoryCounters {
  deleted: number;
  errors: number;
}

export const AUTH_DELETION_PORT = Symbol('AUTH_DELETION_PORT');

export interface AuthDeletionPort {
  /** Mark deletion accepted to block processing; false means already removed. */
  prepareAccountDeletion(userId: string, acceptedAt: Date): Promise<boolean>;
  /** Scheduled retention: unverified + pre-consent accounts (tokens cascade). */
  deleteExpired(cutoffs: AuthCutoffs): Promise<DeletionCategoryCounters>;
  /** Account deletion (Consent §9): remove a user's consent records (idempotent). */
  deleteConsentForUsers(userIds: string[]): Promise<DeletionCategoryCounters>;
  /** Account deletion (Consent §9, FR-031): hard-delete the user account row
   *  (tokens cascade). Called LAST after the per-module stores confirm so the
   *  explicit counted path is the source of truth; idempotent (0 if already gone). */
  deleteAccountForUsers(userIds: string[]): Promise<DeletionCategoryCounters>;
}
