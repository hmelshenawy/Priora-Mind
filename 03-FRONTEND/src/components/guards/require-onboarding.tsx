'use client';

import { useEffect, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '../../i18n/navigation';
import { useOnboardingStateQuery } from '../../features/onboarding/profile-hooks';

/**
 * UX-only onboarding-completion guard (US8, FR-035, acceptance scenario 2).
 *
 * Wraps a protected area that REQUIRES completed onboarding (e.g. /dashboard).
 * If onboarding is not COMPLETED, the user is redirected to their unfinished
 * onboarding step via `next_route` from GET /onboarding/state (FR-033) — never
 * to the protected area. SAFETY_HOLD users are routed to /safety/hold (their
 * `next_route`), keeping safety before completion.
 *
 * SECURITY: this guard is NOT a security boundary (FR-028). The backend enforces
 * authorization + onboarding-step gating; a client missing this component must
 * never expose protected data. This only improves UX by routing an incomplete
 * user to the correct unfinished step instead of flashing a protected shell
 * that the backend will immediately gate.
 */
export function RequireOnboarding({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const router = useRouter();
  const q = useOnboardingStateQuery();

  useEffect(() => {
    const state = q.data?.onboarding_state;
    if (!q.data || state === 'COMPLETED') return;
    // Incomplete (or safety-held) → route to the unfinished step (FR-033).
    // `next_route` is authoritative for the unfinished step; fall back to the
    // boundary if it is missing.
    const route = q.data.next_route ?? '/onboarding/boundary';
    router.replace(route);
  }, [q.data, router]);

  if (q.isLoading) {
    return (
      <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-10">
        <p className="text-muted-foreground">{t('loading')}</p>
      </main>
    );
  }

  // While redirecting an incomplete user, render nothing (no protected flash).
  if (q.data && q.data.onboarding_state !== 'COMPLETED') return null;

  return <>{children}</>;
}