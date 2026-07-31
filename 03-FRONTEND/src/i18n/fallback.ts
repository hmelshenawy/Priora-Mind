import type { AppLocale } from './routing';

/**
 * US7 missing-string fallback rule (FR-037, Safety Matrix §11, Constitution X).
 *
 * Two distinct fallback policies, by content class — the system MUST NOT silently
 * fall back to the other language for safety-critical content without a documented
 * rule. This module is the documented rule. It is pure so it is unit-testable and
 * the e2e fallback suite can observe it through the dev-only test route.
 *
 * 1. Message-catalog keys (UI chrome — buttons, labels, hints, and the `safety.*`
 *    labels that surround the safety experience): each locale loads ONLY its own
 *    catalog (`request.ts`); no cross-locale catalog fallback is configured. A
 *    missing key resolves to a defined, visible fallback token — never to the
 *    other language's string. `catalogFallback` is wired into next-intl's
 *    `getMessageFallback` (see `request.ts`).
 *
 * 2. Safety-critical CONTENT — the protective copy, emergency actions, and
 *    approved resources that actually safeguard the user — is NEVER sourced from
 *    the message catalog. It comes from the backend's approved, versioned
 *    bilingual `SafetyCopy` payloads (`{ en, ar }`) and is selected per active
 *    locale by `bilingual`. The documented rule: if the approved copy for the
 *    active locale is missing or empty, fall back to the DEFAULT-locale (English)
 *    approved copy AND return `usedFallback: true` so the substitution is never
 *    silent (the caller surfaces a coarse signal; the protective copy is still
 *    shown rather than nothing). If both are missing the caller MUST block
 *    continuation — in the live flow the assessment is already halted at
 *    SAFETY_HOLD, so there is no continuation to advance (FR-023).
 *
 * Why English is the default-locale fallback for safety copy: the backend
 * contract guarantees both `en` and `ar` on every bilingual payload (validated
 * server-side), so `usedFallback` is a defense-in-depth signal that should never
 * fire in practice; when it does, the default-locale approved copy is the
 * safest deterministic choice and is never silent.
 */

export const FALLBACK_PREFIX = '[missing:';
export const DEFAULT_LOCALE: AppLocale = 'en';

/** A bilingual `{ en, ar }` entry as carried by the backend's approved payloads. */
export interface BilingualEntry {
  en: string;
  ar: string;
}

/**
 * Shared next-intl error/fallback handlers. Wired into BOTH the server request
 * config (`request.ts`) and the client `NextIntlClientProvider` (locale layout)
 * so the documented fallback rule applies uniformly to server- and
 * client-rendered strings. The error type is structural to avoid coupling to
 * the underlying `IntlError` class; only `.code` is read.
 */
export interface IntlLikeError {
  code?: string;
}

/** Coarse `onError`: logs a code only — never message content or sensitive
 *  answers (FR-030). */
export function onMessageError(error: IntlLikeError): void {
  console.warn(`[i18n] ${error.code ?? 'MISSING_MESSAGE'}`);
}

/** `getMessageFallback`: defined fallback token — never the other language's
 *  string (FR-037). */
export function getMessageFallback(info: { namespace?: string; key: string }): string {
  return catalogFallback(info.namespace ? `${info.namespace}.${info.key}` : info.key);
}

/**
 * Defined fallback for a missing message-catalog key. Visible and distinctive so
 * missing keys are obvious in QA, and never the other language's string. Wired
 * into next-intl `getMessageFallback` (`request.ts`).
 */
export function catalogFallback(key: string): string {
  return `${FALLBACK_PREFIX}${key}]`;
}

/** True when the active-locale copy is present (a non-empty, trimmed string). */
export function hasLocaleCopy(entry: BilingualEntry, locale: AppLocale): boolean {
  const v = entry[locale];
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Documented safety-critical bilingual selection. Returns the active-locale
 * approved copy when present; otherwise the DEFAULT-locale (English) approved
 * copy as a *documented, non-silent* fallback (`usedFallback: true`). Callers
 * surface `usedFallback` as a coarse signal (never the sensitive content).
 */
export function bilingual(
  entry: BilingualEntry,
  locale: AppLocale,
): { text: string; usedFallback: boolean } {
  if (hasLocaleCopy(entry, locale)) {
    return { text: entry[locale], usedFallback: false };
  }
  // Documented rule: never silent — fall back to the default-locale approved copy.
  return { text: entry[DEFAULT_LOCALE] ?? '', usedFallback: true };
}