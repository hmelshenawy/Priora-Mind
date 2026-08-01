'use client';

import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { RequireOnboarding } from '../../../../components/guards/require-onboarding';
import { ApiError } from '../../../../lib/api-client';
import { CoachingPlanView } from '../../../../features/coaching/coaching-plan-view';
import {
  useAcceptPlanMutation,
  useCoachingPlanQuery,
  useStartGenerationMutation,
} from '../../../../features/coaching/coaching-hooks';
import { resolveDashboardView } from '../../../../features/coaching/coaching-dashboard-state';

export default function DashboardPage() {
  const locale = useLocale();
  const t = useTranslations('coaching');
  const common = useTranslations('common');
  const plan = useCoachingPlanQuery();
  const start = useStartGenerationMutation();
  const accept = useAcceptPlanMutation();
  const startRequested = useRef(false);

  useEffect(() => {
    if (plan.error instanceof ApiError && plan.error.code === 'PLAN_NOT_FOUND' && !start.isPending && !startRequested.current) {
      startRequested.current = true;
      start.mutate();
    }
  }, [plan.error, start]);

  const view = resolveDashboardView({ data: plan.data, error: plan.error instanceof ApiError ? plan.error : null, startPending: start.isPending });
  let content = <p className="text-slate-600">{common('loading')}</p>;
  if (view === 'starting') {
    content = <p className="text-slate-600">{t('starting')}</p>;
  } else if (view === 'startable') {
    content = <StateCard title={t('startableTitle')} body={t('startableBody')} action={t('start')} loading={start.isPending} onAction={() => { startRequested.current = true; start.mutate(); }} />;
  } else if (view === 'pending') {
    content = <p className="text-slate-600">{t('pending')}</p>;
  } else if (view === 'generating') {
    content = <p className="text-slate-600">{t('generating')}</p>;
  } else if (view === 'failedRetryable') {
    content = <StateCard title={t('failedTitle')} body={t('failedBody')} action={common('retry')} loading={start.isPending} onAction={() => { startRequested.current = true; start.mutate(); }} />;
  } else if (view === 'unavailable') {
    content = <StateCard title={t('unavailableTitle')} body={t('unavailableBody')} />;
  } else if (view === 'noAssessment') {
    content = <StateCard title={t('noAssessmentTitle')} body={t('noAssessmentBody')} />;
  } else if (view === 'safetyHold') {
    content = <StateCard title={t('safetyHoldTitle')} body={t('safetyHoldBody')} />;
  } else if (view === 'ineligible') {
    content = <StateCard title={t('ineligibleTitle')} body={t('ineligibleBody')} />;
  } else if (plan.data?.generationStatus === 'READY') {
    content = (
      <CoachingPlanView
        plan={plan.data}
        locale={locale}
        onAccept={() => accept.mutate()}
        accepting={accept.isPending}
        labels={{
          goals: t('goals'),
          actions: t('actions'),
          acceptPlan: t('acceptPlan'),
          accepting: t('accepting'),
          proposed: t('proposed'),
          active: t('active'),
          completed: t('completed'),
          actionIncomplete: t('actionIncomplete'),
          actionComplete: t('actionComplete'),
        }}
      />
    );
  } else if (view === 'error') {
    content = <StateCard title={t('errorTitle')} body={t('errorBody')} action={common('retry')} onAction={() => plan.refetch()} />;
  }

  return (
    <RequireOnboarding>
      <main className="container mx-auto flex min-h-screen flex-col items-center justify-center px-4 py-10 text-center">
        {content}
      </main>
    </RequireOnboarding>
  );
}

function StateCard({ title, body, action, loading = false, onAction }: { title: string; body: string; action?: string; loading?: boolean; onAction?: () => void }) {
  return (
    <section className="max-w-xl rounded-3xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-slate-600">{body}</p>
      {action && onAction ? <button className="mt-5 rounded-full bg-slate-950 px-5 py-2 text-white disabled:opacity-60" disabled={loading} onClick={onAction}>{loading ? action : action}</button> : null}
    </section>
  );
}
