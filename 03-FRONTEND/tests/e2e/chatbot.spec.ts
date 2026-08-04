import { expect, test, type Page } from '@playwright/test';
import { chatConversation, citedAssistantMessage, fulfillJson, login, stubChatAuth } from './chatbot-fixtures';

const plan = {
  plan_id: 'plan-1',
  plan_version: 1,
  generationStatus: 'READY',
  planStatus: 'ACTIVE',
  source: { assessment_id: 'assessment-1', result_id: 'result-1', definition_version: '1.0', library_version: '1.0', disclaimer_version: '1.0' },
  title: { en: 'Your coaching plan', ar: 'خطة التوجيه الخاصة بك' },
  summary: { en: 'A grounded weekly plan.', ar: 'خطة أسبوعية مستندة إلى تقييمك.' },
  disclaimer: { en: 'Coaching only.', ar: 'للتوجيه فقط.' },
  focus_areas: [],
  goals: [],
  actions: [],
  progress: { completed: 0, total: 0 },
};

async function stubPlan(page: Page) {
  await page.route('**/api/v1/coaching/plan', (route) => fulfillJson(route, plan));
}

async function stubConversations(page: Page) {
  await page.route('**/api/v1/conversations?includeArchived=false', (route) => fulfillJson(route, { items: [chatConversation], nextCursor: null }));
  await page.route('**/api/v1/conversations?includeArchived=true', (route) => fulfillJson(route, { items: [chatConversation], nextCursor: null }));
  await page.route(`**/api/v1/conversations/${chatConversation.id}`, (route) => fulfillJson(route, { conversation: chatConversation, messages: [citedAssistantMessage], nextMessagesCursor: null }));
}

test.describe('chatbot navigation and recovery', () => {
  test('opens chat from coaching plan and returns to plan', async ({ page }) => {
    await stubChatAuth(page);
    await stubPlan(page);
    await stubConversations(page);

    await login(page);
    await expect(page.getByRole('heading', { name: 'Your coaching plan' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Continue chat', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/chat/);
    await page.getByRole('link', { name: 'Back to plan', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Your coaching plan' })).toBeVisible();
  });

  test('creates a conversation and opens the selected conversation URL', async ({ page }) => {
    await stubChatAuth(page);
    await stubPlan(page);
    await page.route('**/api/v1/conversations?includeArchived=false', (route) => fulfillJson(route, { items: [], nextCursor: null }));
    await page.route('**/api/v1/conversations', (route) => {
      if (route.request().method() === 'POST') return fulfillJson(route, { conversation: chatConversation });
      return route.fallback();
    });
    await page.route(`**/api/v1/conversations/${chatConversation.id}`, (route) => fulfillJson(route, { conversation: chatConversation, messages: [], nextMessagesCursor: null }));

    await page.goto('/en/chat');
    const createRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/v1/conversations'));
    await page.getByRole('button', { name: 'New conversation', exact: true }).click();
    await createRequest;
    await expect(page).toHaveURL(new RegExp(`/en/chat/${chatConversation.id}`));
  });

  test('recovers selected conversation after direct open and refresh', async ({ page }) => {
    await stubChatAuth(page);
    await stubConversations(page);

    await page.goto(`/en/chat/${chatConversation.id}`);
    await expect(page.getByText('Try a short grounding exercise.')).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByText('Try a short grounding exercise.')).toBeVisible();
  });
});

test.describe('chatbot message sending', () => {
  test('sends a message and shows the completed assistant response', async ({ page }) => {
    await stubChatAuth(page);
    await stubConversations(page);
    await page.route(`**/api/v1/conversations/${chatConversation.id}/messages`, (route) => fulfillJson(route, {
      conversationId: chatConversation.id,
      userMessage: { id: 'u1', conversationId: chatConversation.id, role: 'user', content: 'Help me pause', status: 'COMPLETED', route: null, sources: [], createdAt: '2026-08-02T12:03:00.000Z', completedAt: '2026-08-02T12:03:00.000Z' },
      assistantMessage: { id: 'a1', conversationId: chatConversation.id, role: 'assistant', content: 'Take one slow breath.', status: 'COMPLETED', route: 'RAG', sources: [], createdAt: '2026-08-02T12:03:01.000Z', completedAt: '2026-08-02T12:03:02.000Z' },
    }));

    await page.goto(`/en/chat/${chatConversation.id}`);
    await page.getByLabel('Type your message…').fill('Help me pause');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Help me pause')).toBeVisible();
    await expect(page.getByText('Take one slow breath.')).toBeVisible();
  });

  test('renders clarification and insufficient-evidence responses distinctly', async ({ page }) => {
    await stubChatAuth(page);
    const messages = [
      { id: 'a2', conversationId: chatConversation.id, role: 'assistant', content: 'Please clarify what you mean.', status: 'COMPLETED', route: 'RAG', sources: [], createdAt: '2026-08-02T12:04:00.000Z', completedAt: '2026-08-02T12:04:00.000Z' },
      { id: 'a3', conversationId: chatConversation.id, role: 'assistant', content: 'There is not enough grounded information to answer.', status: 'COMPLETED', route: 'RAG', sources: [], createdAt: '2026-08-02T12:05:00.000Z', completedAt: '2026-08-02T12:05:00.000Z' },
    ];
    await page.route('**/api/v1/conversations?includeArchived=false', (route) => fulfillJson(route, { items: [chatConversation], nextCursor: null }));
    await page.route(`**/api/v1/conversations/${chatConversation.id}`, (route) => fulfillJson(route, { conversation: chatConversation, messages, nextMessagesCursor: null }));

    await page.goto(`/en/chat/${chatConversation.id}`);
    await expect(page.getByText('Clarification needed')).toBeVisible();
    await expect(page.getByTestId('message-insufficientEvidence').getByText('Not enough grounded information', { exact: true })).toBeVisible();
  });

  test('retries a failed message with a new idempotency key and no retry endpoint', async ({ page }) => {
    await stubChatAuth(page);
    await stubConversations(page);
    const keys: string[] = [];
    await page.route(`**/api/v1/conversations/${chatConversation.id}/messages`, (route) => {
      keys.push(route.request().headers()['x-idempotency-key'] ?? '');
      return fulfillJson(route, {
        conversationId: chatConversation.id,
        userMessage: { id: `u${keys.length}`, conversationId: chatConversation.id, role: 'user', content: 'Retry this', status: 'COMPLETED', route: null, sources: [], createdAt: '2026-08-02T12:06:00.000Z', completedAt: '2026-08-02T12:06:00.000Z' },
        assistantMessage: { id: `f${keys.length}`, conversationId: chatConversation.id, role: 'assistant', content: "I'm having trouble processing that right now. Please try again in a moment.", status: 'FAILED', route: 'RAG', sources: [], createdAt: '2026-08-02T12:06:01.000Z', completedAt: '2026-08-02T12:06:02.000Z' },
      });
    });

    await page.goto(`/en/chat/${chatConversation.id}`);
    await page.getByLabel('Type your message…').fill('Retry this');
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByRole('button', { name: 'Try again' }).click();
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });
});

test.describe('chatbot citations', () => {
  test('renders citation title, section, page, and page range', async ({ page }) => {
    await stubChatAuth(page);
    await stubConversations(page);

    await page.goto(`/en/chat/${chatConversation.id}`);
    await expect(page.getByRole('region', { name: 'Sources' })).toBeVisible();
    await expect(page.getByText('Grounding Guide')).toBeVisible();
    await expect(page.getByText('Pages 5-6')).toBeVisible();
    await expect(page.getByText('Grounding', { exact: true })).toBeVisible();
  });

  test('renders citation fallback metadata and hides empty citation ui', async ({ page }) => {
    await stubChatAuth(page);
    const messages = [
      { ...citedAssistantMessage, id: 'fallback-source', sources: [{ ...citedAssistantMessage.sources[0], sourceTitle: '', sourceFile: null, pageStart: null, pageEnd: null, citationPage: null, citationHeading: null, citationSection: null }] },
      { ...citedAssistantMessage, id: 'no-source', content: 'No sources here.', sources: [] },
    ];
    await page.route('**/api/v1/conversations?includeArchived=false', (route) => fulfillJson(route, { items: [chatConversation], nextCursor: null }));
    await page.route(`**/api/v1/conversations/${chatConversation.id}`, (route) => fulfillJson(route, { conversation: chatConversation, messages, nextMessagesCursor: null }));

    await page.goto(`/en/chat/${chatConversation.id}`);
    await expect(page.getByText('Source 1')).toBeVisible();
    await expect(page.getByText('No sources here.')).toBeVisible();
    await expect(page.getByText('No sources here.').locator('..').getByRole('region', { name: 'Sources' })).toHaveCount(0);
  });
});

test.describe('chatbot conversation management', () => {
  test('archives, shows archived conversations, and preserves state on archive failure', async ({ page }) => {
    await stubChatAuth(page);
    let archived = false;
    let failArchive = false;
    await page.route('**/api/v1/conversations?includeArchived=false', (route) => fulfillJson(route, { items: archived ? [] : [chatConversation], nextCursor: null }));
    await page.route('**/api/v1/conversations?includeArchived=true', (route) => fulfillJson(route, { items: [{ ...chatConversation, status: archived ? 'ARCHIVED' : 'ACTIVE' }], nextCursor: null }));
    await page.route(`**/api/v1/conversations/${chatConversation.id}`, (route) => {
      if (route.request().method() === 'PATCH') {
        if (failArchive) return fulfillJson(route, { error: { code: 'INTERNAL' } }, 500);
        archived = true;
        return fulfillJson(route, { conversation: { ...chatConversation, status: 'ARCHIVED' } });
      }
      return fulfillJson(route, { conversation: chatConversation, messages: [], nextMessagesCursor: null });
    });

    await page.goto('/en/chat');
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByText('No conversations yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Show archived' }).click();
    await expect(page.getByText('Archived', { exact: true })).toBeVisible();
    failArchive = true;
    await page.getByRole('button', { name: 'Unarchive', exact: true }).click();
    await expect(page.getByText('Archived', { exact: true })).toBeVisible();
  });

  test('deletes after confirmation and preserves state on delete failure', async ({ page }) => {
    await stubChatAuth(page);
    let deleted = false;
    let failDelete = false;
    await page.route('**/api/v1/conversations?includeArchived=false', (route) => fulfillJson(route, { items: deleted ? [] : [chatConversation], nextCursor: null }));
    await page.route(`**/api/v1/conversations/${chatConversation.id}`, (route) => {
      if (route.request().method() === 'DELETE') {
        if (failDelete) return fulfillJson(route, { error: { code: 'INTERNAL' } }, 500);
        deleted = true;
        return route.fulfill({ status: 204 });
      }
      return fulfillJson(route, { conversation: chatConversation, messages: [], nextMessagesCursor: null });
    });
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto(`/en/chat/${chatConversation.id}`);
    failDelete = true;
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('heading', { name: 'Coaching chat' })).toBeVisible();
    failDelete = false;
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/en\/chat$/);
  });
});
