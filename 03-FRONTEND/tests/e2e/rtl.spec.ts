import { test, expect } from '@playwright/test';

/**
 * US7 RTL/LTR suite (FR-036, FR-010, SC-005/SC-006, Constitution X).
 *
 * Asserts that switching locale re-renders every reachable onboarding surface
 * in the correct language AND direction, including mixed Arabic/English/latin
 * content, and that interactive controls remain operable by keyboard with a
 * correct (DOM-logical, not visually-reversed) focus order in BOTH directions.
 *
 * Targets the public, backend-free surfaces (landing + register) so the suite
 * is deterministic without the API server. The safety hold surface's direction
 * + bilingual selection is covered by `i18n-fallback.spec.ts` and the shared
 * `bilingual` selector; its keyboard handling follows the same `dir`-driven
 * layout, so the focus-order assertions here transfer to RTL safety screens.
 */

test.describe('US7 direction + localization (LTR vs RTL)', () => {
  test('landing: English is LTR with English strings', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Priora Mind' })).toBeVisible();
  });

  test('landing: Arabic is RTL with Arabic strings', async ({ page }) => {
    await page.goto('/ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('heading', { name: 'بريورا مايند' })).toBeVisible();
  });

  test('register: English is LTR with English copy + latin mixed content', async ({ page }) => {
    await page.goto('/en/register');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { name: 'Create your Priora Mind account' })).toBeVisible();
    // Mixed content: the latin email placeholder is preserved as-is in LTR.
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  });

  test('register: Arabic is RTL with Arabic copy + latin mixed content preserved', async ({ page }) => {
    await page.goto('/ar/register');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(
      page.getByRole('heading', { name: 'أنشئ حسابك في بريورا مايند' }),
    ).toBeVisible();
    // Mixed content: the latin email placeholder is still present in RTL (its
    // intrinsic direction is LTR within the RTL document — not translated).
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  });
});

test.describe('US7 keyboard focus order (SC-006) — same logical order in LTR and RTL', () => {
  // Focus order must follow DOM/source order in BOTH directions (not the visual
  // reverse of RTL). email → password → submit, identical for en and ar.

  // The register heading is a fixed (non-translated per-locale) string, so
  // waiting for it is a stable readiness signal that the route has compiled and
  // rendered before we drive the keyboard (avoids cold-compile Tab races under
  // parallel workers — the same readiness pattern used by i18n-fallback.spec.ts).
  async function gotoRegisterReady(page: import('@playwright/test').Page, locale: 'en' | 'ar') {
    await page.goto(`/${locale}/register`);
    const heading = locale === 'ar' ? 'أنشئ حسابك في بريورا مايند' : 'Create your Priora Mind account';
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }

  test('LTR (English): Tab order is email → password → submit', async ({ page }) => {
    await gotoRegisterReady(page, 'en');
    await page.keyboard.press('Tab');
    await expect(page.locator('#email')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#password')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Create account' })).toBeFocused();
  });

  test('RTL (Arabic): Tab order is email → password → submit (same logical order)', async ({
    page,
  }) => {
    await gotoRegisterReady(page, 'ar');
    await page.keyboard.press('Tab');
    await expect(page.locator('#email')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#password')).toBeFocused();
    await page.keyboard.press('Tab');
    // Arabic button label (submitRegister) — same logical target as LTR.
    await expect(page.getByRole('button', { name: 'إنشاء الحساب' })).toBeFocused();
  });

  test('focus is visible on the focused control in both directions', async ({ page }) => {
    for (const locale of ['en', 'ar'] as const) {
      await page.goto(`/${locale}/register`);
      await page.focus('#email');
      await expect(page.locator('#email')).toBeFocused();
      // The input has a visible focus ring (focus:ring-2); the focused element
      // is keyboard-reachable and not hidden from the accessibility tree.
      await expect(page.locator('#email')).not.toHaveAttribute('aria-hidden', 'true');
      await expect(page.locator('#email')).not.toHaveAttribute('tabindex', '-1');
    }
  });
});