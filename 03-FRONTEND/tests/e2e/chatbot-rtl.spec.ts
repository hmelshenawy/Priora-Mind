import { expect, test } from '@playwright/test';
import { chatConversation, citedAssistantMessage, fulfillJson, stubChatAuth } from './chatbot-fixtures';

test('Arabic RTL chat renders navigation, composer, and citations', async ({ page }) => {
  await stubChatAuth(page);
  await page.route('**/api/v1/conversations?includeArchived=false', (route) => fulfillJson(route, { items: [chatConversation], nextCursor: null }));
  await page.route(`**/api/v1/conversations/${chatConversation.id}`, (route) => fulfillJson(route, { conversation: chatConversation, messages: [citedAssistantMessage], nextMessagesCursor: null }));

  await page.goto(`/ar/chat/${chatConversation.id}`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'محادثة التوجيه' })).toBeVisible();
  await expect(page.getByLabel('اكتب رسالتك…')).toBeVisible();
  await expect(page.getByRole('region', { name: 'المصادر' })).toBeVisible();
});
