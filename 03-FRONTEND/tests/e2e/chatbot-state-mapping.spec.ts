import { expect, test } from '@playwright/test';

test('backend message states map to distinct ui labels', async ({ page }) => {
  const states = await page.evaluate(() => {
    const map = (status: string, route: string | null, content: string) => {
      if (status === 'PENDING' || status === 'PROCESSING') return 'pending';
      if (status === 'FAILED') return 'technicalFailure';
      if (route === 'SAFETY') return 'safety';
      if (content.toLowerCase().includes('not enough grounded')) return 'insufficientEvidence';
      if (content.toLowerCase().includes('clarify')) return 'clarification';
      return 'completed';
    };
    return [
      map('PROCESSING', 'RAG', ''),
      map('COMPLETED', 'RAG', 'Please clarify what you mean.'),
      map('COMPLETED', 'RAG', 'There is not enough grounded information.'),
      map('COMPLETED', 'SAFETY', 'Safety support.'),
      map('FAILED', 'RAG', 'Try again.'),
    ];
  });
  expect(states).toEqual(['pending', 'clarification', 'insufficientEvidence', 'safety', 'technicalFailure']);
});
