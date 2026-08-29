'use client';

import { useEffect } from 'react';
import type { ActionStatus, CoachingPlanResponse } from '@priora/shared-types';
import { useTranslations } from 'next-intl';
import { useRecentConversationsQuery } from './home-hooks';
import { HOME_RECENT_CONVERSATIONS_LIMIT } from './home.api';
import { HomePlanRegion, type CoachingPlanLabels } from './home-plan-region';
import { HomeChatRegion } from './home-chat-region';
import { resolveHomeDashboardView, type ConversationsQueryState } from './home-dashboard-state';
import { resolvePrimaryAction } from './home-primary-action';
import { selectContinueChatTarget } from './home-chat';
import type { CoachingDashboardView } from '../coaching/coaching-dashboard-state';

type HomeDashboardViewProps = {
  coachingView: CoachingDashboardView;
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
  /** Continue an existing conversation by URL (FR-017, FR-020). */
  onContinue: (conversationId: string) => void;
  /** Start a new conversation (FR-019). The page owns the create mutation + navigation. */
  onStartNewConversation: () => void;
  createPending: boolean;
};

/**
 * Presentational orchestrator (AD-0): composes the reused coaching query/mutations and
 * the pure Home Dashboard modules, and renders the welcome header + plan region + chat
 * region in strict FR-032 order inside a page-owned `<main>`. Route-level effects
 * (auto-start, eligibility/safety redirects) and the create-conversation mutation +
 * navigation stay in `dashboard/page.tsx` (AD-7); this component owns presentation only.
 * The recent-conversations query is owned here (no route-level effect) and drives the
 * composite `firstRun` state via the query **status** (AD-9: `firstRun` is never asserted
 * while conversations is loading/errored). Each region renders its own loading/empty/error
 * surface so a failure in one query never blocks the other.
 */
export function HomeDashboardView(props: HomeDashboardViewProps) {
  const t = useTranslations('home');
  const { coachingView } = props;

  const conversations = useRecentConversationsQuery(HOME_RECENT_CONVERSATIONS_LIMIT);
  const items = conversations.data?.items ?? [];
  const conversationsQuery: ConversationsQueryState = {
    status: conversations.status === 'pending' ? 'loading' : conversations.status === 'error' ? 'error' : 'success',
    items,
  };

  const state = resolveHomeDashboardView({ coachingView, conversationsQuery });
  const primaryAction = resolvePrimaryAction(state);
  const continueTarget = selectContinueChatTarget(items);

  // Reliable Plan-anchor scroll (AD-5): the wrapper `<section id="coaching-plan">`
  // is always rendered synchronously, but Next.js client navigations do not always
  // trigger the browser's native hash scroll, so scroll it explicitly on hash change
  // (and on initial mount when a hash is present).
  useEffect(() => {
    const scroll = () => {
      if (window.location.hash === '#coaching-plan') {
        document.getElementById('coaching-plan')?.scrollIntoView({ behavior: 'smooth' });
      }
    };
    scroll();
    window.addEventListener('hashchange', scroll);
    return () => window.removeEventListener('hashchange', scroll);
  }, []);

  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center px-4 py-10">
      <header className="w-full max-w-4xl text-start">
        <h1 className="text-3xl font-semibold text-slate-950">{t('welcome')}</h1>
        <p className="mt-2 text-slate-600">{t('subtitle')}</p>
      </header>
      <div className="mt-8 flex w-full flex-col items-center">
        <HomePlanRegion
          state={state}
          primaryAction={primaryAction}
          planData={props.planData}
          locale={props.locale}
          onStart={props.onStart}
          onAccept={props.onAccept}
          onOpenChat={props.onOpenChat}
          onUpdateAction={props.onUpdateAction}
          onRefetch={props.onRefetch}
          startPending={props.startPending}
          acceptPending={props.acceptPending}
          updatingActionId={props.updatingActionId}
          planLabels={props.planLabels}
        />
        <HomeChatRegion
          continueTarget={continueTarget}
          recent={items}
          conversationsQueryStatus={conversationsQuery.status}
          retrying={conversations.isFetching}
          createPending={props.createPending}
          onContinue={props.onContinue}
          onStartNew={props.onStartNewConversation}
          onRetryConversations={() => conversations.refetch()}
        />
      </div>
    </main>
  );
}