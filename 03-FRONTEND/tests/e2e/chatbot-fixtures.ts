import type { Page, Route } from '@playwright/test';

export const chatConversation = {
  id: '11111111-1111-4111-8111-111111111111',
  title: null,
  status: 'ACTIVE',
  createdAt: '2026-08-02T12:00:00.000Z',
  updatedAt: '2026-08-02T12:00:00.000Z',
  lastMessageAt: null,
};

export const citedAssistantMessage = {
  id: '33333333-3333-4333-8333-333333333333',
  conversationId: chatConversation.id,
  role: 'assistant',
  content: 'Try a short grounding exercise.',
  status: 'COMPLETED',
  route: 'RAG',
  createdAt: '2026-08-02T12:02:00.000Z',
  completedAt: '2026-08-02T12:02:01.000Z',
  sources: [
    {
      chunkId: 'chunk-1',
      sourceId: 'source-1',
      sourceTitle: 'Grounding Guide',
      sourceFile: 'grounding.pdf',
      sourceType: 'PDF',
      chunkIndex: 2,
      score: 0.91,
      citationPage: 5,
      pageStart: 5,
      pageEnd: 6,
      citationHeading: 'Grounding',
      citationSection: 'Exercises',
      textHash: 'hash-1',
      displayOrder: 1,
    },
  ],
};

export async function stubChatAuth(page: Page) {
  await page.route('**/api/v1/auth/login', (route) => route.fulfill({ json: { accessToken: 'token', profile: { onboarding_state: 'COMPLETED', language_code: 'en' } } }));
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ json: { accessToken: 'token' } }));
  await page.route('**/api/v1/onboarding/completion', (route) => route.fulfill({ json: { completed: true, onboarding_state: 'COMPLETED', post_onboarding_route: '/dashboard' } }));
  await page.route('**/api/v1/onboarding/state', (route) => route.fulfill({ json: { onboarding_state: 'COMPLETED', current_step: null, assessment_state: 'SCORED', language_code: 'en', requires_reconsent: false, next_route: '/dashboard' } }));
}

export async function login(page: Page, locale: 'en' | 'ar' = 'en') {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(locale === 'ar' ? 'البريد الإلكتروني' : 'Email').fill('user@example.com');
  await page.getByLabel(locale === 'ar' ? 'كلمة المرور' : 'Password').fill('password123');
  await page.getByRole('button', { name: locale === 'ar' ? 'تسجيل الدخول' : 'Sign in' }).click();
}

export function fulfillJson(route: Route, json: unknown, status = 200) {
  return route.fulfill({ status, json });
}
