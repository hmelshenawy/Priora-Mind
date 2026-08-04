import { expect, test, type Page } from '@playwright/test';

const plan = {
  plan_id: 'plan-1',
  plan_version: 1,
  generationStatus: 'READY',
  planStatus: 'PROPOSED',
  source: { assessment_id: 'assessment-1', result_id: 'result-1', definition_version: '1.0', library_version: '1.0', disclaimer_version: '1.0' },
  title: { en: 'Your coaching plan', ar: 'خطة التوجيه الخاصة بك' },
  summary: { en: 'A grounded weekly plan.', ar: 'خطة أسبوعية مستندة إلى تقييمك.' },
  disclaimer: { en: 'Coaching only.', ar: 'للتوجيه فقط.' },
  focus_areas: [{ id: 'focus-1', domain: 'stress', source: 'priority', position: 1, reason: { en: 'Stress is your priority.', ar: 'الضغط هو أولويتك.' } }],
  goals: [{ id: 'goal-1', focus_area_id: 'focus-1', library_key: 'goal.stress', position: 1, copy: { en: 'Build a small routine.', ar: 'ابنِ روتينًا صغيرًا.' } }],
  actions: [{ id: 'action-1', focus_area_id: 'focus-1', goal_id: 'goal-1', library_key: 'action.stress', position: 1, pacing_label: { en: 'This week', ar: 'هذا الأسبوع' }, copy: { en: 'Take one short pause.', ar: 'خذ استراحة قصيرة واحدة.' }, status: 'INCOMPLETE', version: 1 }],
  progress: { completed: 0, total: 1 },
};

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

test.describe('coaching dashboard plan experience', () => {
  test.describe.configure({ mode: 'serial' });

  test('renders, accepts, tracks progress, supports keyboard, and switches locale from cached bilingual content', async ({ page }) => {
    await stubAuth(page);
    let postCount = 0;
    let getCount = 0;
    const current = structuredClone(plan);
    await page.route('**/api/v1/coaching/plan', async (route) => {
      if (route.request().method() === 'POST') {
        postCount += 1;
        await route.fulfill({ status: 202, json: { plan_id: 'plan-1', generationStatus: 'PENDING' } });
        return;
      }
      getCount += 1;
      await route.fulfill({ json: current });
    });
    await page.route('**/api/v1/coaching/plan/accept', async (route) => {
      current.planStatus = 'ACTIVE';
      await route.fulfill({ json: { plan_id: 'plan-1', planStatus: 'ACTIVE' } });
    });
    await page.route('**/api/v1/coaching/plan/actions/action-1', async (route) => {
      current.actions[0].status = 'COMPLETE';
      current.actions[0].version = 2;
      current.progress = { completed: 1, total: 1 };
      current.planStatus = 'COMPLETED';
      await route.fulfill({ json: { action: { id: 'action-1', status: 'COMPLETE', version: 2 }, progress: current.progress, plan_status: 'COMPLETED' } });
    });

    await loginToDashboard(page);
    await expect(page.getByRole('heading', { name: 'Your coaching plan' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Accept plan' }).click();
    await expect(page.getByText('Active')).toBeVisible();
    const markComplete = page.getByRole('button', { name: 'Mark complete' });
    for (let i = 0; i < 6; i += 1) {
      if (await markComplete.evaluate((node) => node === document.activeElement).catch(() => false)) break;
      await page.keyboard.press('Tab');
    }
    await expect(markComplete).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    await expect(page.getByText('1 of 1 actions complete')).toBeAttached();

    await page.goto('/ar/dashboard');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'خطة التوجيه الخاصة بك' })).toBeVisible();
    expect(postCount).toBe(0);
    expect(getCount).toBeGreaterThan(0);
  });

  const errorCases = [
    { code: 'PLAN_UNAVAILABLE', status: 503, retryable: true, text: 'Coaching plan generation failed' },
    { code: 'RESULT_NOT_FOUND', status: 404, text: 'Assessment required' },
    { code: 'PLAN_NOT_READY', status: 409, text: 'Plan still preparing' },
    { code: 'PLAN_NOT_ACTIVE', status: 409, text: 'Accept your plan first' },
    { code: 'INTERNAL', status: 500, text: 'We could not load your plan' },
  ];

  for (const item of errorCases) {
    test(`renders ${item.code} dashboard state`, async ({ page }) => {
      await stubAuth(page);
      await page.route('**/api/v1/coaching/plan', (route) => route.fulfill({ status: item.status, json: { error: { code: item.code, retryable: item.retryable } } }));
      await loginToDashboard(page);
      await expect(page.getByText(item.text)).toBeVisible({ timeout: 15_000 });
    });
  }

  test('stops pending-plan polling after a persistent 503', async ({ page }) => {
    await stubAuth(page);
    const startedAt = Date.now();
    const getTimestamps: number[] = [];
    await page.route('**/api/v1/coaching/plan', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fulfill({ status: 202, json: { plan_id: 'plan-1', generationStatus: 'PENDING' } });
        return;
      }

      getTimestamps.push(Date.now() - startedAt);
      if (getTimestamps.length === 1) {
        await route.fulfill({ status: 200, json: { plan_id: 'plan-1', generationStatus: 'PENDING' } });
        return;
      }

      await route.fulfill({ status: 503, json: { error: { code: 'PLAN_UNAVAILABLE', retryable: true } } });
    });

    await loginToDashboard(page);
    await expect.poll(() => getTimestamps.length, { timeout: 10_000 }).toBe(2);
    await page.waitForTimeout(5_000);
    expect(getTimestamps).toHaveLength(2);
    console.log(`PLAN_UNAVAILABLE GET offsets ms: ${getTimestamps.join(', ')}`);
  });

  test('bounds retries for a transient failure and stops after a ready response', async ({ page }) => {
    await stubAuth(page);
    let getCount = 0;
    await page.route('**/api/v1/coaching/plan', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fulfill({ status: 202, json: { plan_id: 'plan-1', generationStatus: 'PENDING' } });
        return;
      }
      getCount += 1;
      if (getCount < 3) {
        await route.fulfill({ status: 502, json: { error: { code: 'UPSTREAM_UNAVAILABLE' } } });
        return;
      }
      await route.fulfill({ json: plan });
    });

    await loginToDashboard(page);
    await expect(page.getByRole('heading', { name: 'Your coaching plan' })).toBeVisible({ timeout: 15_000 });
    expect(getCount).toBe(3);
    await page.waitForTimeout(2_000);
    expect(getCount).toBe(3);
  });

  test('allows an explicit user retry to restart a failed generation', async ({ page }) => {
    await stubAuth(page);
    const startedAt = Date.now();
    const getTimestamps: number[] = [];
    const postTimestamps: number[] = [];
    let postCount = 0;
    await page.route('**/api/v1/coaching/plan', async (route) => {
      if (route.request().method() === 'POST') {
        postCount += 1;
        postTimestamps.push(Date.now() - startedAt);
        await route.fulfill({ status: 202, json: { plan_id: 'plan-1', generationStatus: 'PENDING' } });
        return;
      }
      getTimestamps.push(Date.now() - startedAt);
      if (postCount === 0) {
        await route.fulfill({ status: 503, json: { error: { code: 'PLAN_UNAVAILABLE', retryable: true } } });
        return;
      }
      await route.fulfill({ json: plan });
    });

    await loginToDashboard(page);
    await expect(page.getByText('Coaching plan generation failed')).toBeVisible({ timeout: 15_000 });
    expect(getTimestamps).toHaveLength(1);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { name: 'Your coaching plan' })).toBeVisible({ timeout: 15_000 });
    expect(postCount).toBe(1);
    expect(getTimestamps).toHaveLength(2);
    expect(getTimestamps[1]).toBeGreaterThanOrEqual(postTimestamps[0]);
    await page.waitForTimeout(5_000);
    expect(getTimestamps).toHaveLength(2);
    console.log(`explicit retry POST/GET offsets ms: ${postTimestamps[0]} / ${getTimestamps[1]}`);
  });
});
