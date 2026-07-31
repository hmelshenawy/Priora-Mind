import { test, expect } from '@playwright/test';

/**
 * Smoke test — verifies the scaffold boots and renders the landing page.
 * Real coverage (journey, RTL, safety routing) is added per user story
 * (US1–US9) in the Story phases.
 */
test('landing page renders the app name', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Priora Mind' })).toBeVisible();
});