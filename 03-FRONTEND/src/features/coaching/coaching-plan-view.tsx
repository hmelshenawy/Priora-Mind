'use client';

import type { CoachingPlanResponse, LanguageCode } from '@priora/shared-types';
import type { ActionStatus } from '@priora/shared-types';
import { selectBilingualText } from './coaching-dashboard-state';

function text(value: { en: string; ar: string }, locale: string): string {
  return selectBilingualText(value, locale) || value[(locale === 'ar' ? 'ar' : 'en') as LanguageCode];
}

export function CoachingPlanView({
  plan,
  locale,
  onAccept,
  onUpdateAction,
  accepting,
  updatingActionId,
  labels,
}: {
  plan: CoachingPlanResponse;
  locale: string;
  onAccept: () => void;
  onUpdateAction: (actionId: string, status: ActionStatus, expectedVersion?: number) => void;
  accepting: boolean;
  updatingActionId?: string;
  labels: {
    goals: string;
    actions: string;
    focusAreas: string;
    disclaimer: string;
    acceptPlan: string;
    accepting: string;
    proposed: string;
    active: string;
    completed: string;
    actionIncomplete: string;
    actionComplete: string;
    markComplete: string;
    reopenAction: string;
    progress: string;
    progressValue: string;
  };
}) {
  const statusLabel = plan.planStatus === 'PROPOSED' ? labels.proposed : plan.planStatus === 'ACTIVE' ? labels.active : labels.completed;
  const actionsEnabled = plan.planStatus === 'ACTIVE' || plan.planStatus === 'COMPLETED';
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-6 text-start shadow-sm" aria-labelledby="coaching-plan-title">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{statusLabel}</p>
        <h1 id="coaching-plan-title" className="text-3xl font-semibold text-slate-950">{text(plan.title, locale)}</h1>
        <p className="text-slate-700">{text(plan.summary, locale)}</p>
        {plan.planStatus === 'PROPOSED' ? (
          <button
            type="button"
            onClick={onAccept}
            disabled={accepting}
            className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-slate-950 disabled:opacity-60"
          >
            {accepting ? labels.accepting : labels.acceptPlan}
          </button>
        ) : null}
      </header>
      <section className="rounded-2xl bg-slate-50 p-4" aria-label={labels.progress} aria-live="polite">
        <div className="flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
          <span>{labels.progress}</span>
          <span>{plan.progress.completed}/{plan.progress.total}</span>
        </div>
        <p className="sr-only">{labels.progressValue}</p>
        <div
          className="mt-2 h-2 rounded-full bg-slate-200"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={plan.progress.total}
          aria-valuenow={plan.progress.completed}
          aria-valuetext={labels.progressValue}
        >
          <div className="h-2 rounded-full bg-slate-950" style={{ width: `${plan.progress.total ? (plan.progress.completed / plan.progress.total) * 100 : 0}%` }} />
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3" aria-label={labels.focusAreas}>
        {plan.focus_areas.map((area) => (
          <article key={area.id} className="rounded-2xl bg-slate-50 p-4">
            <h2 className="font-semibold text-slate-900">{area.domain}</h2>
            <p className="mt-2 text-sm text-slate-700">{text(area.reason, locale)}</p>
          </article>
        ))}
      </section>
      <section className="space-y-3" aria-label={labels.goals}>
        <h2 className="text-xl font-semibold text-slate-950">{labels.goals}</h2>
        {plan.goals.map((goal) => <p key={goal.id} className="rounded-2xl border p-4">{text(goal.copy, locale)}</p>)}
      </section>
      <section className="space-y-3" aria-label={labels.actions}>
        <h2 className="text-xl font-semibold text-slate-950">{labels.actions}</h2>
        {plan.actions.map((action) => (
          <article key={action.id} className="rounded-2xl border p-4">
            <p>{text(action.copy, locale)}</p>
            <p className="mt-2 text-sm text-slate-500">{action.status === 'COMPLETE' ? labels.actionComplete : labels.actionIncomplete}</p>
            {actionsEnabled ? (
              <button
                type="button"
                aria-pressed={action.status === 'COMPLETE'}
                disabled={updatingActionId === action.id}
                onClick={() => onUpdateAction(action.id, action.status === 'COMPLETE' ? 'INCOMPLETE' : 'COMPLETE', action.version)}
                className="mt-3 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-slate-950 disabled:opacity-60"
              >
                {action.status === 'COMPLETE' ? labels.reopenAction : labels.markComplete}
              </button>
            ) : null}
          </article>
        ))}
      </section>
      <footer className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950" aria-label={labels.disclaimer}>
        {text(plan.disclaimer, locale)}
      </footer>
    </section>
  );
}
