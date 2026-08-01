'use client';

import type { CoachingPlanResponse, LanguageCode } from '@priora/shared-types';
import { selectBilingualText } from './coaching-dashboard-state';

function text(value: { en: string; ar: string }, locale: string): string {
  return selectBilingualText(value, locale) || value[(locale === 'ar' ? 'ar' : 'en') as LanguageCode];
}

export function CoachingPlanView({
  plan,
  locale,
  onAccept,
  accepting,
  labels,
}: {
  plan: CoachingPlanResponse;
  locale: string;
  onAccept: () => void;
  accepting: boolean;
  labels: {
    goals: string;
    actions: string;
    acceptPlan: string;
    accepting: string;
    proposed: string;
    active: string;
    completed: string;
    actionIncomplete: string;
    actionComplete: string;
  };
}) {
  const statusLabel = plan.planStatus === 'PROPOSED' ? labels.proposed : plan.planStatus === 'ACTIVE' ? labels.active : labels.completed;
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-6 text-start shadow-sm">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{statusLabel}</p>
        <h1 className="text-3xl font-semibold text-slate-950">{text(plan.title, locale)}</h1>
        <p className="text-slate-700">{text(plan.summary, locale)}</p>
        {plan.planStatus === 'PROPOSED' ? (
          <button
            type="button"
            onClick={onAccept}
            disabled={accepting}
            className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {accepting ? labels.accepting : labels.acceptPlan}
          </button>
        ) : null}
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {plan.focus_areas.map((area) => (
          <article key={area.id} className="rounded-2xl bg-slate-50 p-4">
            <h2 className="font-semibold text-slate-900">{area.domain}</h2>
            <p className="mt-2 text-sm text-slate-700">{text(area.reason, locale)}</p>
          </article>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">{labels.goals}</h2>
        {plan.goals.map((goal) => <p key={goal.id} className="rounded-2xl border p-4">{text(goal.copy, locale)}</p>)}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-950">{labels.actions}</h2>
        {plan.actions.map((action) => (
          <article key={action.id} className="rounded-2xl border p-4">
            <p>{text(action.copy, locale)}</p>
            <p className="mt-2 text-sm text-slate-500">{action.status === 'COMPLETE' ? labels.actionComplete : labels.actionIncomplete}</p>
          </article>
        ))}
      </section>
      <footer className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">
        {text(plan.disclaimer, locale)}
      </footer>
    </section>
  );
}
