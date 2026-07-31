'use client';

import { useTranslations } from 'next-intl';
import { RequireOnboarding } from '../../../../components/guards/require-onboarding';

/**
 * /dashboard — post-onboarding destination placeholder (US9 will flesh this out).
 * US8 (FR-035, acceptance scenario 2): an authenticated user whose onboarding is
 * NOT complete is redirected to their unfinished onboarding step by
 * `RequireOnboarding` (UX-only; backend gating is authoritative). Only completed
 * users reach the placeholder.
 */
export default function DashboardPage() {
  const t = useTranslations('protected');
  return (
    <RequireOnboarding>
      <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-semibold">{t('dashboardPlaceholder')}</h1>
      </main>
    </RequireOnboarding>
  );
}