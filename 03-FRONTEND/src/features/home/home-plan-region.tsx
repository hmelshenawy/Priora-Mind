'use client';

import type { ReactNode } from 'react';
import type { ActionStatus, CoachingPlanResponse } from '@priora/shared-types';
import { useTranslations } from 'next-intl';
import { CoachingPlanView } from '../coaching/coaching-plan-view';
import type { HomeDashboardState } from './home-dashboard-state';
import type { PrimaryAction } from './home-primary-action';

/**
 * Labels threaded from the page for the reused `<CoachingPlanView/>` (Spec 004,
 * NOT modified — AD-2/AD-4). Built from the existing `coaching.*` namespace.
 */
export type CoachingPlanLabels = {
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
  openChat: string;
  continueChat: string;
};

type HomePlanRegionProps = {
  state: HomeDashboardState;
  primaryAction: PrimaryAction;
  planData: CoachingPlanResponse | undefined;
  locale: string;
  /** Retry failed generation — the manual trigger for the single plan-generation flow (AD-7, FR-007). */
  onStart: () => void;
  onAccept: () => void;
  onOpenChat: () => void;
  onUpdateAction: (actionId: string, status: ActionStatus, expectedVersion?: number) => void;
  onRefetch: () => void;
  startPending: boolean;
  acceptPending: boolean;
  updatingActionId?: string;
  planLabels: CoachingPlanLabels;
};

function guidanceLabel(action: PrimaryAction, home: (key: string) => string): string {
  switch (action) {
    case 'accept-plan':
      return home('guidance.acceptPlan');
    case 'continue-plan':
      return home('guidance.continuePlan');
    case 'review-completed-plan':
      return home('guidance.reviewCompletedPlan');
    default:
      return '';
  }
}

function StateCard({
  title,
  body,
  action,
  loading = false,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  loading?: boolean;
  onAction?: () => void;
}) {
  return (
    <section className="max-w-xl rounded-3xl border border-slate-200 bg-white p-6 text-start shadow-sm">
      <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
      <p className="mt-3 text-slate-600">{body}</p>
      {action && onAction ? (
        <button
          type="button"
          className="mt-5 rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
          disabled={loading}
          onClick={onAction}
        >
          {action}
        </button>
      ) : null}
    </section>
  );
}

/**
 * Coaching status region (FR-032 Priority 1 + 2). Always renders the synchronous
 * wrapper `<section id="coaching-plan">` so the Plan anchor target exists from
 * first paint for every state (AD-5). For READY states it reuses `<CoachingPlanView/>`
 * (its own action IS the single primary action — NO competing Home CTA, AD-2/AD-4);
 * `PrimaryAction` drives only a short guidance label. No-plan states show the
 * generating state — the single automatic generation flow (AD-7) starts immediately,
 * so NO competing Generate CTA is rendered. The only Home-level CTA is the explicit
 * Retry action for failed generation (FR-007).
 */
export function HomePlanRegion(props: HomePlanRegionProps) {
  const t = useTranslations('coaching');
  const common = useTranslations('common');
  const home = useTranslations('home');
  const {
    state,
    primaryAction,
    planData,
    planLabels,
    locale,
    onStart,
    onAccept,
    onOpenChat,
    onUpdateAction,
    onRefetch,
    startPending,
    acceptPending,
    updatingActionId,
  } = props;

  const guidance = guidanceLabel(primaryAction, home);
  const body = renderStateBody(state, {
    t,
    common,
    planData,
    planLabels,
    locale,
    onStart,
    onAccept,
    onOpenChat,
    onUpdateAction,
    onRefetch,
    startPending,
    acceptPending,
    updatingActionId,
  });

  return (
    <section id="coaching-plan" aria-labelledby="coaching-plan-title" className="w-full">
      {guidance ? <p className="mb-4 text-sm font-medium text-slate-500">{guidance}</p> : null}
      {body}
    </section>
  );
}

type StateBodyCtx = {
  planData: CoachingPlanResponse | undefined;
  planLabels: CoachingPlanLabels;
  locale: string;
  onStart: () => void;
  onAccept: () => void;
  onOpenChat: () => void;
  onUpdateAction: (actionId: string, status: ActionStatus, expectedVersion?: number) => void;
  onRefetch: () => void;
  startPending: boolean;
  acceptPending: boolean;
  updatingActionId?: string;
};

function renderStateBody(state: HomeDashboardState, ctx: StateBodyCtx & { t: (key: string) => string; common: (key: string) => string }): ReactNode {
  const { t, common, planData, planLabels, locale, onStart, onAccept, onOpenChat, onUpdateAction, onRefetch, startPending, acceptPending, updatingActionId } = ctx;
  switch (state) {
    case 'readyProposed':
    case 'readyActive':
    case 'readyCompleted':
      // CoachingPlanView's own accept / continue-chat / action controls are the
      // single primary action for READY states — NO Home-level CTA button (AD-2/AD-4).
      return planData ? (
        <CoachingPlanView
          plan={planData}
          locale={locale}
          onAccept={onAccept}
          onOpenChat={onOpenChat}
          onUpdateAction={onUpdateAction}
          accepting={acceptPending}
          updatingActionId={updatingActionId}
          labels={planLabels}
        />
      ) : null;
    case 'firstRun':
    case 'startable':
    case 'starting':
      // No plan: the single automatic generation flow (the preserved Spec 002 auto-start
      // effect, AD-7) starts immediately, so the Home Dashboard shows the generating state
      // with NO competing Generate CTA. The explicit Retry action for failed generation is
      // retained separately (FR-007); first-run chat action is a US9 concern.
      return <p className="text-slate-600">{t('starting')}</p>;
    case 'pending':
      return <p className="text-slate-600">{t('pending')}</p>;
    case 'generating':
      return <p className="text-slate-600">{t('generating')}</p>;
    case 'failedRetryable':
      // Explicit user-triggered retry (FR-007); no automatic retry (FR-012), no polling.
      return (
        <StateCard
          title={t('failedTitle')}
          body={t('failedBody')}
          action={startPending ? undefined : t('retry')}
          onAction={startPending ? undefined : onStart}
        />
      );
    case 'unavailable':
      return <StateCard title={t('unavailableTitle')} body={t('unavailableBody')} />;
    case 'noAssessment':
      return <StateCard title={t('noAssessmentTitle')} body={t('noAssessmentBody')} />;
    case 'safetyHold':
      return <p className="text-slate-600">{t('safetyHoldBody')}</p>;
    case 'ineligible':
      return <p className="text-slate-600">{t('ineligibleBody')}</p>;
    case 'notReady':
      return <StateCard title={t('notReadyTitle')} body={t('notReadyBody')} action={common('retry')} onAction={onRefetch} />;
    case 'notActive':
      return <StateCard title={t('notActiveTitle')} body={t('notActiveBody')} action={common('retry')} onAction={onRefetch} />;
    case 'error':
      return <StateCard title={t('errorTitle')} body={t('errorBody')} action={common('retry')} onAction={onRefetch} />;
    default:
      // loading
      return <p className="text-slate-600">{common('loading')}</p>;
  }
}
