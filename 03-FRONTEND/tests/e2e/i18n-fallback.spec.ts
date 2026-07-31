import { test, expect } from '@playwright/test';

/**
 * US7 missing-string fallback (FR-037, Safety Matrix §11, Constitution X).
 *
 * Verifies the documented fallback rule through the real production code paths
 * exposed by the dev-only `/[locale]/i18n-fallback` route (which uses the real
 * next-intl `getMessageFallback` and the real `bilingual` safety selector):
 *
 *  1. A missing NON-safety message-catalog key resolves to a DEFINED fallback
 *     token — the SAME token in both locales, never the other language's string.
 *  2. Safety-critical content missing the active locale resolves to the
 *     DEFAULT-locale (English) approved copy with a NON-SILENT `usedFallback`
 *     flag — never an empty string, never a silent cross-language substitution.
 *     "Block continuation" is structurally guaranteed in the live flow because
 *     SAFETY_HOLD already halts the assessment (FR-023); this test asserts the
 *     documented, observable selection rule.
 *
 * No backend is required — the route is self-contained.
 */

const MISSING_KEY_TOKEN = '[missing:common.absentKey]';
const FIXTURE_ENGLISH_COPY = 'Approved English safety copy (fixture).';

// The demo heading is a fixed (non-translated) string, so it's a stable
// readiness signal that the route has fully rendered past any dev-compile state.
async function gotoDemo(page: import('@playwright/test').Page, locale: 'en' | 'ar') {
  await page.goto(`/${locale}/i18n-fallback`);
  await expect(page.getByRole('heading', { name: 'i18n fallback demo' })).toBeVisible();
}

test.describe('US7 missing-string fallback', () => {
  test('English: present safety copy, missing non-safety key → defined fallback token', async ({
    page,
  }) => {
    await gotoDemo(page, 'en');

    // Non-safety missing key → defined fallback token (never the other language).
    await expect(page.getByTestId('missing-key')).toHaveText(MISSING_KEY_TOKEN);
    // Safety content present for the active locale → approved copy, no fallback.
    await expect(page.getByTestId('safety-fallback')).toHaveText(FIXTURE_ENGLISH_COPY);
    await expect(page.getByTestId('safety-used-fallback')).toHaveText('false');
  });

  test('Arabic: missing non-safety key → SAME fallback token (never the other language)', async ({
    page,
  }) => {
    await gotoDemo(page, 'ar');

    // The SAME fallback token in Arabic — the system does NOT silently fall back
    // to the other language's string for a missing catalog key.
    await expect(page.getByTestId('missing-key')).toHaveText(MISSING_KEY_TOKEN);
  });

  test('Arabic: safety copy missing active locale → documented default-locale fallback, non-silent', async ({
    page,
  }) => {
    await gotoDemo(page, 'ar');

    // Safety-critical content missing the active (Arabic) locale → the documented
    // DEFAULT-locale (English) approved copy is shown (better than nothing), AND
    // `usedFallback` flags the substitution so it is never silent.
    await expect(page.getByTestId('safety-fallback')).toHaveText(FIXTURE_ENGLISH_COPY);
    await expect(page.getByTestId('safety-used-fallback')).toHaveText('true');
  });
});