import { expect, test } from '@playwright/test';

test('citation metadata formats page ranges and fallbacks', async ({ page }) => {
  const labels = await page.evaluate(() => {
    const format = (source: { sourceTitle?: string; sourceFile?: string; pageStart?: number; pageEnd?: number; citationPage?: number }, index: number) => {
      const title = source.sourceTitle || source.sourceFile || `Source ${index + 1}`;
      const location = source.pageStart && source.pageEnd && source.pageStart !== source.pageEnd
        ? `Pages ${source.pageStart}-${source.pageEnd}`
        : source.citationPage
          ? `Page ${source.citationPage}`
          : null;
      return { title, location };
    };
    return [format({ sourceTitle: 'Guide', pageStart: 4, pageEnd: 6 }, 0), format({}, 1)];
  });
  expect(labels).toEqual([{ title: 'Guide', location: 'Pages 4-6' }, { title: 'Source 2', location: null }]);
});
