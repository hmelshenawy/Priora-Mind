import type { LanguageCode } from '@priora/shared-types';

/**
 * Outbound email port — Auth-owned (research D2, SAD §8 provider abstraction).
 *
 * Auth depends only on this interface, never on a vendor SDK. The concrete
 * adapter is selected by configuration (`EMAIL_PROVIDER`): the `FakeEmailAdapter`
 * (in-memory capture, no network) for dev/test, the `HttpEmailProviderAdapter`
 * (config-selected transactional provider) for production.
 *
 * Only the verification email is required by this feature, so the port is
 * intentionally narrow (Constitution XII — no premature "NotificationPort").
 */
export interface VerificationEmailInput {
  to: string;
  /** Raw single-use token — appears ONLY in the generated link, never logged. */
  token: string;
  userId: string;
  lang: LanguageCode;
}

export const EMAIL_PORT = Symbol('EMAIL_PORT');

export interface EmailPort {
  sendVerification(input: VerificationEmailInput): Promise<void>;
}