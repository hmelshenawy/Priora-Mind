import { expect, test } from '@playwright/test';

test('idempotency keys are unique uuid-like values', async ({ page }) => {
  await page.goto('/en/login');
  const keys = await page.evaluate(() => [crypto.randomUUID(), crypto.randomUUID()]);
  expect(keys[0]).not.toBe(keys[1]);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
});
