'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from '../../i18n/navigation';
import { ensureAccessToken } from '../../lib/api-client';

/**
 * UX-only auth guard (FR-027 / FR-028, SAD.md).
 *
 * SECURITY NOTE: This guard is NOT a security boundary. Backend route guards and
 * ownership checks enforce isolation; a client missing this component must never
 * expose protected data. This component only improves UX by redirecting an
 * obviously-unauthenticated browser to the sign-in entry point instead of
 * showing a protected shell that will immediately 401. Never rely on it for
 * authorization — backend enforcement is authoritative.
 *
 * The intended destination is not captured as a return URL: the project does not
 * currently support safe return URLs, and introducing one here would create an
 * open-redirect surface. After sign-in, the login page routes via the backend's
 * authoritative `next_route` (FR-033), which already lands a completed user on
 * /dashboard and an incomplete user on their unfinished step — so the user is
 * never stranded and never reaches a protected area they cannot access.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    ensureAccessToken().then((authenticated) => {
      if (!active) return;
      if (!authenticated) router.replace('/login');
      setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [locale, router]);

  // Render children optimistically; the effect handles the redirect. The
  // protected API layer is the real gate, so flashing content briefly is safe
  // (no protected data loads until the API responds).
  return checking ? null : <>{children}</>;
}
