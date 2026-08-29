import { expect, test, type Page } from '@playwright/test';
import type { ConversationSummaryDto } from '@priora/shared-types';

/**
 * Home Dashboard journeys (Spec 006). Mirrors the existing coaching-plan.spec.ts
 * auth/login stubs. US1 (coaching state + next action), US2 (no-plan auto-start),
 * US3 (failed/unavailable), US4 (accept), US5/US6 (continue/start-new chat),
 * US7 (eligibility/safety + TopNav scope), US9 (first-run), US10 (returning-user),
 * US8 (responsive + RTL).
 *
 * The whole file runs serially in one worker: every journey mounts the dashboard
 * against the shared Next.js dev server, and running the file's describes in
 * parallel workers races the initial route compilation (page-load timeouts). Serial
 * mode keeps this file deterministic without changing the project-wide config
 * (CI already runs `workers: 1`).
 */
test.describe.configure({ mode: 'serial' });

const basePlan = {
  plan_id: 'plan-1',
  plan_version: 1,
  source: { assessment_id: 'assessment-1', result_id: 'result-1', definition_version: '1.0', library_version: '1.0', disclaimer_version: '1.0' },
  title: { en: 'Your coaching plan', ar: 'خطة التوجيه الخاصة بك' },
  summary: { en: 'A grounded weekly plan.', ar: 'خطة أسبوعية مستندة إلى تقييمك.' },
  disclaimer: { en: 'Coaching only.', ar: 'للتوجيه فقط.' },
  focus_areas: [{ id: 'focus-1', domain: 'stress', source: 'priority', position: 1, reason: { en: 'Stress is your priority.', ar: 'الضغط هو أولويتك.' } }],
  goals: [{ id: 'goal-1', focus_area_id: 'focus-1', library_key: 'goal.stress', position: 1, copy: { en: 'Build a small routine.', ar: 'ابنِ روتينًا صغيرًا.' } }],
  actions: [{ id: 'action-1', focus_area_id: 'focus-1', goal_id: 'goal-1', library_key: 'action.stress', position: 1, pacing_label: { en: 'This week', ar: 'هذا الأسبوع' }, copy: { en: 'Take one short pause.', ar: 'خذ استراحة قصيرة واحدة.' }, status: 'INCOMPLETE', version: 1 }],
  progress: { completed: 0, total: 1 },
};

const proposedPlan = { ...basePlan, generationStatus: 'READY', planStatus: 'PROPOSED' };
const activePlan = { ...basePlan, generationStatus: 'READY', planStatus: 'ACTIVE' };
const completedPlan = { ...basePlan, generationStatus: 'READY', planStatus: 'COMPLETED', actions: [{ ...basePlan.actions[0], status: 'COMPLETE', version: 2 }], progress: { completed: 1, total: 1 } };

async function stubAuth(page: Page) {
  await page.route('**/api/v1/auth/login', (route) => route.fulfill({ json: { accessToken: 'token', profile: { onboarding_state: 'COMPLETED', language_code: 'en' } } }));
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ json: { accessToken: 'token' } }));
  await page.route('**/api/v1/onboarding/completion', (route) => route.fulfill({ json: { completed: true, onboarding_state: 'COMPLETED', post_onboarding_route: '/dashboard' } }));
  await page.route('**/api/v1/onboarding/state', (route) => route.fulfill({ json: { onboarding_state: 'COMPLETED', current_step: null, assessment_state: 'SCORED', language_code: 'en', requires_reconsent: false, next_route: '/dashboard' } }));
}

async function loginToDashboard(page: Page, locale: 'en' | 'ar' = 'en') {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(locale === 'ar' ? 'البريد الإلكتروني' : 'Email').fill('user@example.com');
  await page.getByLabel(locale === 'ar' ? 'كلمة المرور' : 'Password').fill('password123');
  await page.getByRole('button', { name: locale === 'ar' ? 'تسجيل الدخول' : 'Sign in' }).click();
}

const planRegion = (page: Page) => page.locator('#coaching-plan');
const forbiddenGenerationLabel = /Start plan|Generate plan|Reset plan|New plan/;

/** Minimal conversation-summary fixture (ConversationSummaryDto). */
function conversation(
  id: string,
  overrides: Partial<{ title: string | null; updatedAt: string }> = {},
): ConversationSummaryDto {
  return {
    id,
    title: overrides.title ?? `Conversation ${id}`,
    status: 'ACTIVE',
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-08-04T00:00:00.000Z',
    lastMessageAt: null,
  };
}

/**
 * Stub the conversations list endpoint (the Home recent-list query) and, when an
 * onCreate factory is supplied, the create-conversation endpoint (start-new). The
 * route glob matches the list/create path but NOT a per-conversation detail fetch,
 * so navigating to a /chat/{id} thread doesn't need a full chat-page mock — its
 * detail query simply errors and the test still asserts the URL landed correctly.
 */
async function stubConversations(
  page: Page,
  items: ConversationSummaryDto[],
  onCreate?: () => ConversationSummaryDto,
) {
  // GET recent list — the home query is `?includeArchived=false&limit=5` (the chat
  // sidebar uses `?includeArchived=false`), so match any query string via regex rather
  // than a glob that requires an exact query match.
  await page.route(/\/api\/v1\/conversations\?.*/, (route) =>
    route.fulfill({ json: { items, nextCursor: null } }),
  );
  // Conversation detail (and any subpath) — keep navigation to /chat/{id} off the dev
  // server so these Home-Dashboard tests stay self-contained.
  await page.route('**/api/v1/conversations/**', (route) =>
    route.fulfill({ json: { conversation: conversation('stub'), messages: [], nextMessagesCursor: null } }),
  );
  if (onCreate) {
    // POST create-conversation — bare path, no query (regex end-anchored).
    await page.route(/\/api\/v1\/conversations$/, (route) => {
      if (route.request().method() !== 'POST') {
        return route.fulfill({ json: { items, nextCursor: null } });
      }
      return route.fulfill({ status: 201, json: { conversation: onCreate() } });
    });
  }
}

test.describe('home dashboard coaching-state journeys', () => {
  test.describe.configure({ mode: 'serial' });

  test('renders the welcome header and loading state before the plan resolves', async ({ page }) => {
    await stubAuth(page);
    // Never fulfill the plan request — the query stays pending and the Home Dashboard
    // shows the loading state (the #coaching-plan wrapper is rendered synchronously).
    await page.route('**/api/v1/coaching/plan', () => new Promise<void>(() => { /* pending */ }));
    await loginToDashboard(page);
    await expect(page.getByRole('heading', { name: 'Your coaching home' })).toBeVisible({ timeout: 15_000 });
    await expect(planRegion(page).getByText('Loading…')).toBeVisible();
  });

  test('renders the pending state with no start/retry action', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ json: { plan_id: 'plan-1', generationStatus: 'PENDING' } }));
    await loginToDashboard(page);
    await expect(planRegion(page).getByText('Preparing your coaching plan…')).toBeVisible({ timeout: 15_000 });
    await expect(planRegion(page).getByRole('button')).toHaveCount(0);
  });

  test('renders the generating state with no start/retry action', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ json: { plan_id: 'plan-1', generationStatus: 'GENERATING' } }));
    await loginToDashboard(page);
    await expect(planRegion(page).getByText('Generating your coaching plan…')).toBeVisible({ timeout: 15_000 });
    await expect(planRegion(page).getByRole('button')).toHaveCount(0);
  });

  test('renders ready-proposed with the accept next action and no duplicate Home CTA', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ json: proposedPlan }));
    await loginToDashboard(page);
    await expect(page.getByRole('heading', { name: 'Your coaching plan' })).toBeVisible({ timeout: 15_000 });
    // FR-035 recommended next action renders as a guidance label; CoachingPlanView's own
    // Accept button is the single primary action (no competing Home CTA — AD-2/AD-4).
    await expect(planRegion(page).getByText('Next: accept your plan')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept plan' })).toBeVisible();
    await expect(planRegion(page).getByRole('button', { name: forbiddenGenerationLabel })).toHaveCount(0);
  });

  test('renders ready-active with the continue next action', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ json: activePlan }));
    await loginToDashboard(page);
    await expect(page.getByRole('heading', { name: 'Your coaching plan' })).toBeVisible({ timeout: 15_000 });
    await expect(planRegion(page).getByText('Next: continue your plan')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue chat' })).toBeVisible();
    await expect(planRegion(page).getByRole('button', { name: forbiddenGenerationLabel })).toHaveCount(0);
  });

  test('renders ready-completed with review wording, continue-chat, and no new-plan CTA', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ json: completedPlan }));
    await loginToDashboard(page);
    await expect(page.getByRole('heading', { name: 'Your coaching plan' })).toBeVisible({ timeout: 15_000 });
    await expect(planRegion(page).getByText('Next: review your completed plan')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue chat' })).toBeVisible();
    // FR-010a: no new-plan / accept action for a completed plan.
    await expect(page.getByRole('button', { name: 'Accept plan' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start plan' })).toHaveCount(0);
    await expect(planRegion(page).getByRole('button', { name: forbiddenGenerationLabel })).toHaveCount(0);
  });
});

test.describe('home dashboard no-plan generation (US2)', () => {
  test.describe.configure({ mode: 'serial' });

  test('no-plan: auto-start is the single generation flow and reaches the generating state', async ({ page }) => {
    await stubAuth(page);
    let postCount = 0;
    await page.route('**/api/v1/coaching/plan', async (route) => {
      if (route.request().method() === 'POST') {
        postCount += 1;
        await route.fulfill({ status: 202, json: { plan_id: 'plan-1', generationStatus: 'PENDING' } });
        return;
      }
      // No plan until generation starts; after the start POST the backend reports PENDING.
      await route.fulfill(postCount === 0 ? { status: 404, json: { error: { code: 'PLAN_NOT_FOUND' } } } : { json: { plan_id: 'plan-1', generationStatus: 'PENDING' } });
    });
    await loginToDashboard(page);
    // Exactly one generation request — the single automatic generation flow (the preserved
    // auto-start effect, AD-7). No competing Generate CTA is rendered for the no-plan state.
    await expect.poll(() => postCount, { timeout: 15_000 }).toBe(1);
    await expect(planRegion(page).getByText(/Preparing your coaching plan|Generating your coaching plan/)).toBeVisible({ timeout: 15_000 });
    await expect(planRegion(page).getByRole('button', { name: /Start plan|Generate/ })).toHaveCount(0);
  });

  test('no-plan: polls only while PENDING/GENERATING and stops polling on READY', async ({ page }) => {
    await stubAuth(page);
    let postCount = 0;
    let getCount = 0;
    await page.route('**/api/v1/coaching/plan', async (route) => {
      if (route.request().method() === 'POST') {
        postCount += 1;
        await route.fulfill({ status: 202, json: { plan_id: 'plan-1', generationStatus: 'PENDING' } });
        return;
      }
      getCount += 1;
      if (postCount === 0) {
        await route.fulfill({ status: 404, json: { error: { code: 'PLAN_NOT_FOUND' } } });
      } else if (getCount <= 3) {
        await route.fulfill({ json: { plan_id: 'plan-1', generationStatus: 'GENERATING' } });
      } else {
        await route.fulfill({ json: proposedPlan });
      }
    });
    await loginToDashboard(page);
    await expect.poll(() => postCount, { timeout: 15_000 }).toBe(1);
    // Polling continues while the backend reports GENERATING (SC-004).
    await expect.poll(() => getCount, { timeout: 15_000 }).toBeGreaterThan(2);
    // Reaches READY and the plan renders.
    await expect(page.getByRole('heading', { name: 'Your coaching plan' })).toBeVisible({ timeout: 15_000 });
    const countAtReady = getCount;
    // No further polling after a terminal READY state (FR-011, SC-004).
    await page.waitForTimeout(5_000);
    expect(getCount).toBe(countAtReady);
    expect(postCount).toBe(1);
  });
});

test.describe('home dashboard chat journeys (US5/US6)', () => {
  test.describe.configure({ mode: 'serial' });

  test('continue-chat targets the most-recently-updated active conversation (items[0]) and navigates by URL (FR-017, SC-005)', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ json: activePlan }));
    const items = [
      conversation('newest', { title: 'Newest chat', updatedAt: '2026-08-04T10:00:00.000Z' }),
      conversation('older', { title: 'Older chat', updatedAt: '2026-08-04T08:00:00.000Z' }),
    ];
    await stubConversations(page, items);
    await loginToDashboard(page);
    const continueCard = page.locator('section#home-chat article', {
      has: page.getByRole('heading', { name: 'Continue your last conversation' }),
    });
    await expect(continueCard).toBeVisible({ timeout: 15_000 });
    // FR-017: deterministic target = items[0] (most-recently-updated), not the older one.
    await expect(continueCard.getByText('Newest chat')).toBeVisible();
    await page.getByRole('button', { name: 'Open last conversation' }).click();
    await expect(page).toHaveURL(/\/chat\/newest$/);
    // SC-005: a reload keeps the user in the same conversation (deep link, not transient state).
    await page.reload();
    await expect(page).toHaveURL(/\/chat\/newest$/);
  });

  test('open-conversations link navigates to the chat view (FR-018)', async ({ page }) => {
    // FR-023: the recent list (and its "Open all conversations" link) is suppressed
    // below the `sm` breakpoint, so this journey is desktop-only (mobile reaches
    // /chat via the TopNav "Chat" link instead).
    const viewportWidth = page.viewportSize()?.width ?? 1280;
    test.skip(viewportWidth < 640, 'recent list is hidden on small viewports');
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ json: activePlan }));
    await stubConversations(page, [conversation('c1')]);
    await loginToDashboard(page);
    await page.getByRole('link', { name: 'Open all conversations' }).click();
    await expect(page).toHaveURL(/\/chat$/);
  });

  test('start-new creates a conversation and lands on its URL (FR-019, SC-006)', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ json: activePlan }));
    const created = conversation('brand-new', { title: null });
    let postCount = 0;
    await stubConversations(page, [], () => {
      postCount += 1;
      return created;
    });
    await loginToDashboard(page);
    await expect(page.getByRole('button', { name: 'Start conversation' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Start conversation' }).click();
    await expect(page).toHaveURL(/\/chat\/brand-new$/);
    expect(postCount).toBe(1);
  });
});

test.describe('home dashboard failed-generation journeys (US3)', () => {
  test.describe.configure({ mode: 'serial' });

  test('failedRetryable shows an explicit retry CTA, no auto-retry, no polling (FR-007/FR-012)', async ({ page }) => {
    await stubAuth(page);
    let getCount = 0;
    let postCount = 0;
    await page.route('**/api/v1/coaching/plan', async (route) => {
      if (route.request().method() === 'POST') {
        postCount += 1;
        // Keep the mutation pending long enough to prove the retry action disappears.
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({ status: 202, json: { plan_id: 'plan-1', generationStatus: 'PENDING' } });
        return;
      }
      getCount += 1;
      // Before any retry: failedRetryable (503, retryable). After the retry POST: PENDING.
      await route.fulfill(
        postCount === 0
          ? { status: 503, json: { error: { code: 'PLAN_UNAVAILABLE', retryable: true } } }
          : { json: { plan_id: 'plan-1', generationStatus: 'PENDING' } },
      );
    });
    await stubConversations(page, []);
    await loginToDashboard(page);
    await expect(planRegion(page).getByText('Coaching plan generation failed')).toBeVisible({ timeout: 15_000 });
    // No auto-start (PLAN_UNAVAILABLE, not PLAN_NOT_FOUND) and no polling while failed.
    const getsAtFail = getCount;
    await page.waitForTimeout(3_000);
    expect(getCount).toBe(getsAtFail);
    expect(postCount).toBe(0);
    // Explicit user retry → pending/generating (the same mutation as auto-start, AD-7).
    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toHaveCount(1);
    await expect(planRegion(page).getByRole('button', { name: forbiddenGenerationLabel })).toHaveCount(0);
    await retry.click();
    // Prevent duplicate retries while the existing mutation is in flight.
    await expect(retry).toHaveCount(0);
    await expect(planRegion(page).getByText(/Preparing your coaching plan|Generating your coaching plan/)).toBeVisible({ timeout: 15_000 });
    expect(postCount).toBe(1);
  });

  test('unavailable (non-retryable) shows no retry CTA and no polling', async ({ page }) => {
    await stubAuth(page);
    let getCount = 0;
    await page.route('**/api/v1/coaching/plan', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fulfill({ status: 202, json: { plan_id: 'plan-1', generationStatus: 'PENDING' } });
        return;
      }
      getCount += 1;
      await route.fulfill({ status: 503, json: { error: { code: 'PLAN_UNAVAILABLE', retryable: false } } });
    });
    await stubConversations(page, []);
    await loginToDashboard(page);
    await expect(planRegion(page).getByText('Coaching plan unavailable')).toBeVisible({ timeout: 15_000 });
    await expect(planRegion(page).getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await expect(planRegion(page).getByRole('button', { name: forbiddenGenerationLabel })).toHaveCount(0);
    const gets = getCount;
    await page.waitForTimeout(3_000);
    expect(getCount).toBe(gets);
  });
});

test.describe('home dashboard plan action journeys (US4)', () => {
  test.describe.configure({ mode: 'serial' });

  test('accept transitions the proposed plan to active (FR-008)', async ({ page }) => {
    await stubAuth(page);
    const current = { ...proposedPlan };
    let acceptCount = 0;
    await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ json: current }));
    await page.route('**/api/v1/coaching/plan/accept', async (route) => {
      acceptCount += 1;
      current.planStatus = 'ACTIVE';
      await route.fulfill({ json: { plan_id: 'plan-1', planStatus: 'ACTIVE' } });
    });
    await stubConversations(page, []);
    await loginToDashboard(page);
    await expect(page.getByRole('button', { name: 'Accept plan' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Accept plan' }).click();
    // After accept, the plan query refetches and the active state renders with continue-chat.
    await expect(page.getByRole('button', { name: 'Continue chat' })).toBeVisible({ timeout: 15_000 });
    expect(acceptCount).toBe(1);
  });
});

test.describe('home dashboard eligibility & safety journeys (US7)', () => {
  test.describe.configure({ mode: 'serial' });

  test('noAssessment shows guidance with no start/retry action', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) =>
      route.fulfill({ status: 404, json: { error: { code: 'RESULT_NOT_FOUND' } } }),
    );
    await stubConversations(page, []);
    await loginToDashboard(page);
    await expect(planRegion(page).getByText('Assessment required')).toBeVisible({ timeout: 15_000 });
    await expect(planRegion(page).getByRole('button', { name: /Start plan|Generate|Retry/ })).toHaveCount(0);
  });

  test('safetyHold redirects to /safety/hold with no coaching CTA (FR-013)', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) =>
      route.fulfill({ status: 409, json: { error: { code: 'SAFETY_HOLD' } } }),
    );
    await stubConversations(page, []);
    await loginToDashboard(page);
    await expect(page).toHaveURL(/\/safety\/hold$/);
  });

  test('ineligible (ONBOARDING_STEP_BLOCKED) redirects to the unfinished onboarding step (FR-014, FR-033)', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) =>
      route.fulfill({ status: 403, json: { error: { code: 'ONBOARDING_STEP_BLOCKED', next: 'boundary' } } }),
    );
    await stubConversations(page, []);
    await loginToDashboard(page);
    await expect(page).toHaveURL(/\/onboarding\/boundary$/);
  });

  test('TopNav is present on /dashboard but absent on /assessment (layout-scope gate, AD-11)', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ json: activePlan }));
    await stubConversations(page, []);
    await loginToDashboard(page);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 15_000 });
    // /assessment has no AppShell layout (AD-11) — only /dashboard and /chat do.
    await page.goto('/en/assessment');
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
  });
});

test.describe('home dashboard first-run journeys (US9)', () => {
  test.describe.configure({ mode: 'serial' });

  test('no plan + no conversations shows the generating state (auto-start) with no Generate CTA and no error', async ({ page }) => {
    await stubAuth(page);
    let postCount = 0;
    await page.route('**/api/v1/coaching/plan', async (route) => {
      if (route.request().method() === 'POST') {
        postCount += 1;
        await route.fulfill({ status: 202, json: { plan_id: 'plan-1', generationStatus: 'PENDING' } });
        return;
      }
      await route.fulfill(
        postCount === 0
          ? { status: 404, json: { error: { code: 'PLAN_NOT_FOUND' } } }
          : { json: { plan_id: 'plan-1', generationStatus: 'PENDING' } },
      );
    });
    await stubConversations(page, []);
    await loginToDashboard(page);
    // Exactly one generation request — the single automatic generation flow (AD-7).
    await expect.poll(() => postCount, { timeout: 15_000 }).toBe(1);
    await expect(planRegion(page).getByText(/Preparing your coaching plan|Generating your coaching plan|Starting your coaching plan/)).toBeVisible({ timeout: 15_000 });
    await expect(planRegion(page).getByRole('button', { name: /Start plan|Generate/ })).toHaveCount(0);
    // FR-002b: the chat region shows the "start your first conversation" prompt, not an error.
    await expect(page.getByRole('heading', { name: 'Start your first conversation' })).toBeVisible();
  });

  test('plan exists + no conversations shows the plan normally plus the FR-002b prompt', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ json: activePlan }));
    await stubConversations(page, []);
    await loginToDashboard(page);
    await expect(page.getByRole('heading', { name: 'Your coaching plan' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Start your first conversation' })).toBeVisible();
  });

  test('no plan + conversations is startable (NOT firstRun) and auto-starts generation', async ({ page }) => {
    await stubAuth(page);
    let postCount = 0;
    await page.route('**/api/v1/coaching/plan', async (route) => {
      if (route.request().method() === 'POST') {
        postCount += 1;
        await route.fulfill({ status: 202, json: { plan_id: 'plan-1', generationStatus: 'PENDING' } });
        return;
      }
      await route.fulfill(
        postCount === 0
          ? { status: 404, json: { error: { code: 'PLAN_NOT_FOUND' } } }
          : { json: { plan_id: 'plan-1', generationStatus: 'PENDING' } },
      );
    });
    await stubConversations(page, [conversation('c1')]);
    await loginToDashboard(page);
    await expect.poll(() => postCount, { timeout: 15_000 }).toBe(1);
    await expect(planRegion(page).getByText(/Preparing your coaching plan|Generating your coaching plan|Starting your coaching plan/)).toBeVisible({ timeout: 15_000 });
    // firstRun requires zero conversations; with one, the continue-chat card renders instead.
    await expect(page.getByRole('heading', { name: 'Continue your last conversation' })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('home dashboard returning-user reconstruction (US10)', () => {
  test('close/reopen reconstructs from live APIs with no local persistence (FR-025, SC-014)', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ json: activePlan }));
    await stubConversations(page, [conversation('c1')]);
    await loginToDashboard(page);
    await expect(page.getByRole('heading', { name: 'Your coaching plan' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Continue your last conversation' })).toBeVisible();
    // SC-014: the Home Dashboard persists no state of its own. Access tokens stay
    // in-memory (refresh in an HttpOnly cookie), so localStorage is empty; any
    // sessionStorage keys are framework/dev artifacts (e.g. the Next.js dev debug
    // channel), never home-feature data.
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    const ssKeys = await page.evaluate(() => Object.keys(sessionStorage));
    expect(ssKeys.filter((k) => /plan|coaching|conversation|home/i.test(k))).toEqual([]);
    // FR-025: a reload reconstructs from the same live APIs (no cached nav state).
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your coaching plan' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Continue your last conversation' })).toBeVisible();
  });
});

test.describe('home dashboard responsive & RTL (US8)', () => {
  test.describe.configure({ mode: 'serial' });

  test('mobile viewport: recent list suppressed, primary chat actions visible, no horizontal overflow (FR-023)', async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: 375, height: 720 } });
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ json: activePlan }));
    await stubConversations(page, [conversation('c1', { title: 'A fairly long conversation title that could wrap on a narrow viewport' })]);
    await loginToDashboard(page);
    await expect(page.getByRole('button', { name: 'Open last conversation' })).toBeVisible({ timeout: 15_000 });
    // FR-023: the read-only recent list is suppressed below the `sm` breakpoint.
    await expect(page.getByRole('heading', { name: 'Recent conversations' })).toHaveCount(0);
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflowX).toBeLessThanOrEqual(0);
    await page.close();
  });

  test('Arabic locale renders fully translated and right-to-left with no horizontal overflow (SC-009)', async ({ page }) => {
    await stubAuth(page);
    await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ json: proposedPlan }));
    await stubConversations(page, [conversation('c1', { title: 'محادثة بعنوان عربي طويل قد يلتف على الشاشات الضيقة' })]);
    await loginToDashboard(page, 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'صفحتك الرئيسية للتوجيه' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'ابدأ محادثة' })).toBeVisible({ timeout: 15_000 });
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflowX).toBeLessThanOrEqual(0);
  });
});
