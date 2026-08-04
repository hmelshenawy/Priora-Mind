import { expect, test } from '@playwright/test';
import { chatConversation, fulfillJson, stubChatAuth } from './chatbot-fixtures';

test('composer blocks empty and whitespace-only messages before sending', async ({ page }) => {
  await stubChatAuth(page);
  let sendCount = 0;
  await page.route('**/api/v1/conversations?includeArchived=false', (route) => fulfillJson(route, { items: [chatConversation], nextCursor: null }));
  await page.route(`**/api/v1/conversations/${chatConversation.id}`, (route) => fulfillJson(route, { conversation: chatConversation, messages: [], nextMessagesCursor: null }));
  await page.route(`**/api/v1/conversations/${chatConversation.id}/messages`, (route) => {
    sendCount += 1;
    return fulfillJson(route, {});
  });

  await page.goto(`/en/chat/${chatConversation.id}`);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Enter a message before sending.')).toBeVisible();
  await page.getByLabel('Type your message…').fill('   ');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Enter a message before sending.')).toBeVisible();
  expect(sendCount).toBe(0);
});
