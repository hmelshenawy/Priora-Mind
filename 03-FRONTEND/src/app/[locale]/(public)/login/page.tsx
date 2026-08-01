'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Link, useRouter } from '../../../../i18n/navigation';
import { useLoginMutation } from '../../../../features/auth/auth-hooks';
import {
  useOnboardingCompletionQuery,
  useOnboardingStateQuery,
} from '../../../../features/onboarding/profile-hooks';
import { ApiError } from '../../../../lib/api-client';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
type LoginForm = z.infer<typeof schema>;

/**
 * /login (US1, FR-035). Collects email + password and POSTs to /auth/login.
 *
 * Reuses the existing auth/session plumbing:
 *  - `useLoginMutation` → `authApi.login` stores the access token via the shared
 *    in-memory `setAccessToken` (auth-token.ts). The refresh token stays in the
 *    HttpOnly cookie set by the backend; nothing is written to localStorage.
 *  - Post-login routing mirrors the landing page (`app/[locale]/page.tsx`): the
 *    authoritative step→route mapping is the backend's `next_route` (FR-033), so
 *    this page does NOT duplicate `routeForStep`/`STEP_ROUTE`. Completed users →
 *    /dashboard; incomplete users → their `next_route` (which is /safety/hold for
 *    SAFETY_HOLD); unknown/missing → the boundary (the earliest unfinished step).
 *
 * Anti-enumeration (FR-004): the backend returns the SAME 401 `INVALID_CREDENTIALS`
 * for an unknown email and a wrong password, so a single credential-error message
 * is shown — account existence is never disclosed.
 *
 * Loading, validation-error, invalid-credentials, and generic-error states are
 * all covered. EN/AR parity + RTL come from the locale catalog + the `dir`-driven
 * root layout (Constitution X).
 */
export default function LoginPage() {
  const t = useTranslations('public');
  const router = useRouter();
  // Flipped true after a successful login; enables the onboarding routing queries.
  const [redirecting, setRedirecting] = useState(false);

  const loginMut = useLoginMutation();
  // Gated on `redirecting` so an unauthenticated visitor never triggers these
  // calls; the access token is in memory by the time they fire.
  const completion = useOnboardingCompletionQuery({ enabled: redirecting });
  const state = useOnboardingStateQuery({
    enabled: redirecting && !!completion.data && !completion.data.completed,
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(schema) });

  async function onSubmit(values: LoginForm) {
    try {
      await loginMut.mutateAsync(values);
      // authApi.login already stored the access token in memory. Defer routing
      // to the effect below, which waits for the onboarding-state probe.
      setRedirecting(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION' && err.fields) {
        for (const f of err.fields) {
          // Map server field paths back onto the form; never echoes the value.
          setError(f.path as keyof LoginForm, { message: f.message });
        }
      }
      // INVALID_CREDENTIALS + unexpected errors are surfaced via loginMut.error.
    }
  }

  // Post-login routing — same decision as the landing page (single-source mapping).
  useEffect(() => {
    if (!redirecting || completion.error || !completion.data) return;
    if (completion.data.completed) {
      router.replace('/dashboard'); // US9: completed → post-onboarding dest
      return;
    }
    // Incomplete (incl. SAFETY_HOLD, whose `next_route` is /safety/hold) → the
    // authoritative unfinished-step route; fall back to the boundary if missing.
    if (state.data) {
      router.replace(state.data.next_route ?? '/onboarding/boundary');
    }
  }, [redirecting, completion.data, completion.error, state.data, router]);

  if (redirecting) {
    return (
      <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-muted-foreground" role="status" aria-live="polite">
          {t('loginRedirecting')}
        </p>
      </main>
    );
  }

  // INVALID_CREDENTIALS — same message for unknown email + wrong password
  // (anti-enumeration, FR-004). Excluded from the generic-error branch below.
  const credentialError =
    loginMut.isError &&
    loginMut.error instanceof ApiError &&
    loginMut.error.code === 'INVALID_CREDENTIALS'
      ? t('loginInvalidCredentials')
      : null;

  const genericError =
    loginMut.isError &&
    !(loginMut.error instanceof ApiError &&
      (loginMut.error.code === 'VALIDATION' || loginMut.error.code === 'INVALID_CREDENTIALS'))
      ? t('error')
      : null;

  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="w-full max-w-sm space-y-2 text-center">
        <h1 className="text-2xl font-semibold">{t('loginTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('loginSubtitle')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4" noValidate>
        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm font-medium">
            {t('emailLabel')}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t('emailPlaceholder')}
            {...register('email')}
            className="w-full rounded border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p role="alert" className="text-sm text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm font-medium">
            {t('passwordLabel')}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
            className="w-full rounded border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
            aria-invalid={!!errors.password}
          />
          {errors.password ? (
            <p role="alert" className="text-sm text-destructive">
              {errors.password.message}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('passwordHint')}</p>
          )}
        </div>

        {credentialError && (
          <p role="alert" className="text-sm text-destructive">
            {credentialError}
          </p>
        )}
        {genericError && (
          <p role="alert" className="text-sm text-destructive">
            {genericError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || loginMut.isPending}
          className="w-full rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
        >
          {isSubmitting || loginMut.isPending ? t('loginSubmitting') : t('submitLogin')}
        </button>
      </form>

      <p className="text-sm text-muted-foreground">
        {t('loginToRegisterPrompt')}{' '}
        <Link href="/register" className="font-medium underline">
          {t('loginToRegisterLink')}
        </Link>
      </p>
    </main>
  );
}