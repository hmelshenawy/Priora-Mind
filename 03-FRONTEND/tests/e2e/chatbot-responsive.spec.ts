import { expect, test } from '@playwright/test';
import { chatConversation, citedAssistantMessage, fulfillJson, stubChatAuth } from './chatbot-fixtures';

async function stubChat(page: import('@playwright/test').Page) {
  await stubChatAuth(page);
  await page.route('**/api/v1/conversations?includeArchived=false', (route) => fulfillJson(route, { items: [chatConversation], nextCursor: null }));
  await page.route(`**/api/v1/conversations/${chatConversation.id}`, (route) => fulfillJson(route, { conversation: chatConversation, messages: [citedAssistantMessage], nextMessagesCursor: null }));
}

test('chat layout works on desktop and mobile without horizontal page scrolling', async ({ page }) => {
  await stubChat(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/en/chat/${chatConversation.id}`);
  await expect(page.getByRole('complementary', { name: 'Conversations' })).toBeVisible();
  await expect(page.getByLabel('Type your message…')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sources' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('complementary', { name: 'Conversations' })).toBeVisible();
  await expect(page.getByLabel('Type your message…')).toBeVisible();
  const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalScroll).toBe(false);
});
