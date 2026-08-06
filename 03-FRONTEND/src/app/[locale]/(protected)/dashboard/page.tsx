'use client';

import { useEffect, useRef } from 'react';
import type { CoachingPlanResponse } from '@priora/shared-types';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '../../../../i18n/navigation';
import { RequireOnboarding } from '../../../../components/guards/require-onboarding';
import { ApiError } from '../../../../lib/api-client';
import {
  useAcceptPlanMutation,
  useCoachingPlanQuery,
  useStartGenerationMutation,
  useUpdateActionStatusMutation,
} from '../../../../features/coaching/coaching-hooks';
import { resolveDashboardView } from '../../../../features/coaching/coaching-dashboard-state';
import { useCreateConversationMutation } from '../../../../features/chat/chat-hooks';
import { routeForStep } from '../../../../features/onboarding/onboarding-routes';
import { HomeDashboardView } from '../../../../features/home/home-dashboard-view';

export default function DashboardPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('coaching');
  const plan = useCoachingPlanQuery();
  const start = useStartGenerationMutation();
  const accept = useAcceptPlanMutation();
  const updateAction = useUpdateActionStatusMutation();
  const createConversation = useCreateConversationMutation();
  const startRequested = useRef(false);

  // Auto-start on PLAN_NOT_FOUND — the single plan-generation flow (Spec 002 preserved, AD-7).
  useEffect(() => {
    if (plan.error instanceof ApiError && plan.error.code === 'PLAN_NOT_FOUND' && !start.isPending && !startRequested.current) {
      startRequested.current = true;
      start.mutate();
    }
  }, [plan.error, start]);

  // Route-level eligibility/safety redirects (FR-013/FR-014, unchanged).
  useEffect(() => {
    if (!(plan.error instanceof ApiError)) return;
    if (plan.error.code === 'ONBOARDING_STEP_BLOCKED') router.replace(routeForStep(plan.error.nextStep));
    if (plan.error.code === 'SAFETY_HOLD') router.replace('/safety/hold');
  }, [plan.error, router]);

  const coachingView = resolveDashboardView({
    data: plan.data,
    error: plan.error instanceof ApiError ? plan.error : null,
    startPending: start.isPending,
  });

  // The explicit Retry CTA for failed generation invokes the SAME mutation as auto-start,
  // coordinated via the start-requested guard so the two never double-fire (AD-7, FR-007).
  // No-plan generation has exactly one trigger — the auto-start effect above (no Generate CTA).
  const handleStart = () => {
    startRequested.current = true;
    start.mutate();
  };

  // Continue an existing conversation by URL (FR-017, FR-020) — preserves Spec 005 recovery.
  const handleContinue = (conversationId: string) => router.push(`/chat/${conversationId}`);
  // Start a new conversation (FR-019): reuse the existing mutation and navigate to the new URL,
  // matching the ChatPageView pattern (FR-020, SC-006).
  const handleStartNewConversation = () =>
    createConversation.mutate(undefined, { onSuccess: (data) => router.push(`/chat/${data.conversation.id}`) });

  const readyPlan = plan.data?.generationStatus === 'READY' ? (plan.data as CoachingPlanResponse) : undefined;

  const planLabels = {
    focusAreas: t('focusAreas'),
    goals: t('goals'),
    actions: t('actions'),
    disclaimer: t('disclaimer'),
    acceptPlan: t('acceptPlan'),
    accepting: t('accepting'),
    proposed: t('proposed'),
    active: t('active'),
    completed: t('completed'),
    actionIncomplete: t('actionIncomplete'),
    actionComplete: t('actionComplete'),
    markComplete: t('markComplete'),
    reopenAction: t('reopenAction'),
    progress: t('progress'),
    progressValue: readyPlan ? t('progressValue', { completed: readyPlan.progress.completed, total: readyPlan.progress.total }) : '',
    openChat: t('openChat'),
    continueChat: t('continueChat'),
  };

  return (
    <RequireOnboarding>
      <HomeDashboardView
        coachingView={coachingView}
        planData={readyPlan}
        locale={locale}
        onStart={handleStart}
        onAccept={() => accept.mutate()}
        onOpenChat={() => router.push('/chat')}
        onUpdateAction={(actionId, status, expectedVersion) => updateAction.mutate({ actionId, body: { status, expected_version: expectedVersion } })}
        onRefetch={() => plan.refetch()}
        startPending={start.isPending}
        acceptPending={accept.isPending}
        updatingActionId={updateAction.variables?.actionId}
        planLabels={planLabels}
        onContinue={handleContinue}
        onStartNewConversation={handleStartNewConversation}
        createPending={createConversation.isPending}
      />
    </RequireOnboarding>
  );
}