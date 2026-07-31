'use client';

import { useTranslations, useLocale } from 'next-intl';
import { bilingual, type BilingualEntry } from '../../../../i18n/fallback';
import type { AppLocale } from '../../../../i18n/routing';

/**
 * Demonstrates the US7 fallback rule through the real production code paths.
 * Uses the real next-intl `useTranslations` (so `getMessageFallback` from
 * `request.ts` applies) and the real `bilingual` safety selector. No backend.
 *
 * Fixture: an approved safety-copy entry that is MISSING the Arabic field — the
 * documented defense-in-depth case. On the English locale the active-locale
 * copy is present (`usedFallback: false`); on the Arabic locale the active copy
 * is missing, so `bilingual` returns the DEFAULT-locale (English) approved copy
 * with `usedFallback: true` — a documented, non-silent fallback, never an empty
 * string and never a silent substitution.
 */
const SAFETY_FIXTURE_MISSING_AR: BilingualEntry = {
  en: 'Approved English safety copy (fixture).',
  ar: '',
};

export function FallbackDemo() {
  // `common` exists in both catalogs; `absentKey` does NOT → a missing key within
  // an existing namespace, resolved by `getMessageFallback` to the SAME defined
  // token in both locales (a fully absent namespace would throw during translator
  // creation, before the key-level fallback applies — so we use an existing one).
  const t = useTranslations('common');
  const locale = useLocale() as AppLocale;
  const safety = bilingual(SAFETY_FIXTURE_MISSING_AR, locale);

  return (
    <main className="container mx-auto px-4 py-10">
      <h1 className="text-xl font-semibold">i18n fallback demo</h1>
      <p data-testid="missing-key" className="mt-4">{t('absentKey')}</p>
      <p data-testid="safety-fallback" className="mt-2">{safety.text}</p>
      <p data-testid="safety-used-fallback" className="mt-2 sr-only">
        {String(safety.usedFallback)}
      </p>
    </main>
  );
}