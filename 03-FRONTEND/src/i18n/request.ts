import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';
import { onMessageError, getMessageFallback } from './fallback';
import en from './messages/en.json';
import ar from './messages/ar.json';

/**
 * Server-side request config (next-intl v4).
 * Loads the message catalog for the resolved locale. Missing/unsupported
 * locales fall back to the default (research D4 fallback rule). Imports are
 * static (not dynamic template-literal imports) so Turbopack can resolve them.
 * Catalogs live alongside this file under ./messages/.
 *
 * US7 missing-string fallback rule (FR-037, Safety Matrix §11): each locale
 * loads ONLY its own catalog — no cross-locale catalog fallback is configured,
 * so a missing key can never silently substitute the other language. A missing
 * catalog key resolves to a defined, visible fallback token (`catalogFallback`)
 * and a COARSE `onError` log (no message content or sensitive answers — FR-030).
 * Safety-critical *content* is never sourced from the catalog; it comes from
 * the backend's approved bilingual `SafetyCopy` payloads and is selected by
 * `bilingual()` (see `fallback.ts`) — never a silent cross-language fallback.
 */
const CATALOGS = {
  en,
  ar,
} as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: CATALOGS[locale],
    onError: onMessageError,
    getMessageFallback,
  };
});