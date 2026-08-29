import { test, expect, type Page } from '@playwright/test';

/**
 * US1 login page (FR-035) + RequireAuth redirect.
 *
 * The dev server runs without a backend, so auth + onboarding endpoints are
 * stubbed with `page.route` (deterministic, no API server required). The
 * rendering / RTL / RequireAuth-redirect cases hit no endpoints and need no
 * mocks. Anti-enumeration (FR-004): the same `INVALID_CREDENTIALS` message is
 * shown for an unknown email and a wrong password.
 */

const EMAIL = 'tester@example.com';
const PASSWORD = 'password123';

/** Stub POST /auth/login with the given status + JSON body. */
async function mockLogin(page: Page, status: number, body: unknown) {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/** Stub the two onboarding-state probes used by the post-login router. */
async function mockOnboarding(
  page: Page,
  completion: { completed: boolean; onboarding_state: string; post_onboarding_route: '/dashboard' },
  state: {
    onboarding_state: string;
    next_route: string | null;
    current_step: string | null;
    assessment_state: string | null;
    language_code: 'en' | 'ar' | null;
    requires_reconsent: boolean;
  },
) {
  await page.route('**/api/v1/onboarding/completion', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(completion),
    }),
  );
  await page.route('**/api/v1/onboarding/state', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state) }),
  );
}

async function fillAndSubmit(page: Page) {
  // Wait for the route to compile + hydrate before driving the keyboard/click —
  // the dev server compiles lazily and concurrent suites can starve it (same
  // readiness pattern as rtl.spec.ts's `gotoRegisterReady`).
  await expect(page.getByRole('heading', { name: 'Sign in to Priora Mind' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Timeout for redirect assertions: the destination route may cold-compile under
 *  parallel load, and the post-login router waits on the onboarding-state probe. */
const REDIRECT_TIMEOUT = 20_000;

test.describe('login page — rendering + localization', () => {
  test('renders the form, inputs, submit, and a link to register (EN/LTR)', async ({ page }) => {
    await page.goto('/en/login');

    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Sign in to Priora Mind' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    const registerLink = page.getByRole('link', { name: 'Create one' });
    await expect(registerLink).toBeVisible();
    await expect(registerLink).toHaveAttribute('href', '/en/register');
  });

  test('Arabic renders RTL with Arabic copy + a locale-prefixed register link', async ({ page }) => {
    await page.goto('/ar/login');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(
      page.getByRole('heading', { name: 'تسجيل الدخول إلى بريورا مايند' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'تسجيل الدخول' })).toBeVisible();

    const registerLink = page.getByRole('link', { name: 'أنشئ حسابًا' });
    await expect(registerLink).toBeVisible();
    await expect(registerLink).toHaveAttribute('href', '/ar/register');
  });

  test('register page links back to login ("Already have an account? Sign in")', async ({ page }) => {
    await page.goto('/en/register');
    const loginLink = page.getByRole('link', { name: 'Sign in' });
    await expect(loginLink).toBeVisible({ timeout: 15_000 });
    await expect(loginLink).toHaveAttribute('href', '/en/login');
  });
});

test.describe('login page — invalid credentials', () => {
  test('shows the invalid-credentials message and stays on /login (anti-enumeration)', async ({
    page,
  }) => {
    // Same 401 shape the backend returns for a wrong password AND an unknown email.
    await mockLogin(page, 401, {
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
    });
    await page.goto('/en/login');

    await fillAndSubmit(page);

    await expect(page.getByText('Incorrect email or password.')).toBeVisible();
    await expect(page).toHaveURL(/\/en\/login$/);
  });
});

test.describe('login page — successful login + onboarding redirect', () => {
  test('routes a COMPLETED user to /dashboard', async ({ page }) => {
    await mockLogin(page, 200, {
      accessToken: 'access-token',
      profile: { onboarding_state: 'COMPLETED', language_code: 'en' },
    });
    await mockOnboarding(
      page,
      { completed: true, onboarding_state: 'COMPLETED', post_onboarding_route: '/dashboard' },
      {
        onboarding_state: 'COMPLETED',
        next_route: null,
        current_step: null,
        assessment_state: null,
        language_code: 'en',
        requires_reconsent: false,
      },
    );
    await page.goto('/en/login');

    await fillAndSubmit(page);

    await expect(page).toHaveURL(/\/en\/dashboard$/, { timeout: REDIRECT_TIMEOUT });
  });

  test('routes an incomplete user to their unfinished step via next_route', async ({ page }) => {
    await mockLogin(page, 200, {
      accessToken: 'access-token',
      profile: { onboarding_state: 'IN_PROGRESS', language_code: 'en' },
    });
    await mockOnboarding(
      page,
      { completed: false, onboarding_state: 'IN_PROGRESS', post_onboarding_route: '/dashboard' },
      {
        onboarding_state: 'IN_PROGRESS',
        next_route: '/onboarding/boundary',
        current_step: 'boundary',
        assessment_state: null,
        language_code: 'en',
        requires_reconsent: false,
      },
    );
    await page.goto('/en/login');

    await fillAndSubmit(page);

    await expect(page).toHaveURL(/\/en\/onboarding\/boundary$/, { timeout: REDIRECT_TIMEOUT });
  });

  test('routes a SAFETY_HOLD user to /safety/hold', async ({ page }) => {
    await mockLogin(page, 200, {
      accessToken: 'access-token',
      profile: { onboarding_state: 'SAFETY_HOLD', language_code: 'en' },
    });
    await mockOnboarding(
      page,
      { completed: false, onboarding_state: 'SAFETY_HOLD', post_onboarding_route: '/dashboard' },
      {
        onboarding_state: 'SAFETY_HOLD',
        next_route: '/safety/hold',
        current_step: 'safety_hold',
        assessment_state: null,
        language_code: 'en',
        requires_reconsent: false,
      },
    );
    await page.goto('/en/login');

    await fillAndSubmit(page);

    await expect(page).toHaveURL(/\/en\/safety\/hold$/, { timeout: REDIRECT_TIMEOUT });
  });
});

test.describe('RequireAuth — redirect unauthenticated visits to /login', () => {
  test('a protected route visited without a session redirects to /login', async ({ page }) => {
    // No mocks: the page calls no endpoint that must succeed; RequireAuth redirects
    // client-side as soon as it observes no in-memory access token.
    await page.goto('/en/dashboard');

    await expect(page).toHaveURL(/\/en\/login$/, { timeout: REDIRECT_TIMEOUT });
  });
});