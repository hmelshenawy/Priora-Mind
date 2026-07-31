'use client';

import { useEffect, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from '../../i18n/navigation';
import { getAccessToken } from '../../lib/auth-token';

/**
 * UX-only auth guard (FR-027 / FR-028, SAD.md).
 *
 * SECURITY NOTE: This guard is NOT a security boundary. Backend route guards and
 * ownership checks enforce isolation; a client missing this component must never
 * expose protected data. This component only improves UX by redirecting an
 * obviously-unauthenticated browser to the registration entry point instead of
 * showing a protected shell that will immediately 401. Never rely on it for
 * authorization — backend enforcement is authoritative.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const router = useRouter();

  useEffect(() => {
    if (getAccessToken() === null) {
      router.replace(`/${locale}/register`);
    }
  }, [locale, router]);

  // Render children optimistically; the effect handles the redirect. The
  // protected API layer is the real gate, so flashing content briefly is safe
  // (no protected data loads until the API responds).
  return <>{children}</>;
}