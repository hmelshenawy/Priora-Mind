'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '../../i18n/navigation';
import {
  useOnboardingCompletionQuery,
  useOnboardingStateQuery,
} from '../../features/onboarding/profile-hooks';

/**
 * App entry / landing (US9, FR-033, SC-009).
 *
 * Public-facing surface that also acts as the returning-user router:
 *  - A returning user whose onboarding is COMPLETED is bypassed straight to
 *    /dashboard (the post-onboarding transition point) — never forced through
 *    onboarding again (US9, FR-018a).
 *  - A returning user whose onboarding is incomplete is routed to their
 *    unfinished step via GET /onboarding/state `next_route` (FR-033).
 *  - An unauthenticated visitor (the completion probe 401s) sees the landing.
 *
 * The authoritative `completed` boolean comes from GET /onboarding/completion
 * (FR-033, US9). The probe runs unconditionally (not gated on the in-memory
 * token) so a returning user who reloaded the page — in-memory token cleared,
 * HttpOnly refresh cookie still present — is still routed correctly: the
 * api-client transparently re-mints an access token via the refresh cookie on
 * the first 401 and retries. A 401 that remains (truly anonymous) is treated as
 * "unauthenticated → stay on the landing."
 *
 * SECURITY: this routing is UX-only (FR-028) — backend route guards + ownership
 * checks are authoritative. No protected data loads before the redirect resolves;
 * the landing shell renders only the app name + tagline.
 */
export default function Home() {
  const t = useTranslations('common');
  const router = useRouter();
  const completion = useOnboardingCompletionQuery();
  // Only fetch the unfinished-step route when the user is authenticated but NOT
  // completed — avoids an extra call for completed + anonymous visitors.
  const state = useOnboardingStateQuery({
    enabled: !!completion.data && !completion.data.completed,
  });

  useEffect(() => {
    // Unauthenticated (401) or transient error → stay on the public landing.
    // Fail-safe: never assume completion or force a route on an uncertain state.
    if (completion.error || !completion.data) return;
    if (completion.data.completed) {
      router.replace('/dashboard'); // US9: bypass onboarding → post-onboarding dest
      return;
    }
    // Incomplete (or undeterminable → completed:false) → unfinished step. The
    // state query provides the authoritative next_route; fall back to the
    // boundary (the earliest unfinished step) if it is missing.
    if (state.data) {
      router.replace(state.data.next_route ?? '/onboarding/boundary');
    }
  }, [completion.data, completion.error, state.data, router]);

  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-3xl font-semibold">{t('appName')}</h1>
      <p className="text-muted-foreground">{t('tagline')}</p>
    </main>
  );
}