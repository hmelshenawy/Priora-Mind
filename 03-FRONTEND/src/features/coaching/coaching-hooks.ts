'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateActionBody } from '@priora/shared-types';
import { ApiError } from '../../lib/api-client';
import { coachingApi } from './coaching.api';
import { shouldPollPlan } from './coaching-dashboard-state';

export const coachingPlanKey = ['coaching', 'plan'] as const;
const PLAN_POLL_INTERVAL_MS = 1500;
const MAX_TRANSIENT_RETRIES = 2;

export function shouldRetryPlanQuery(failureCount: number, error: Error): boolean {
  if (failureCount >= MAX_TRANSIENT_RETRIES) return false;
  if (!(error instanceof ApiError)) return true;
  if (error.code === 'PLAN_UNAVAILABLE') return false;
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

export function useCoachingPlanQuery(enabled = true) {
  return useQuery({
    queryKey: coachingPlanKey,
    queryFn: () => coachingApi.getPlan(),
    enabled,
    retry: shouldRetryPlanQuery,
    retryDelay: (failureCount) => Math.min(500 * 2 ** failureCount, 2000),
    refetchInterval: (query) => {
      // TanStack Query retains the last successful data after a refetch error.
      // Stop polling on that error instead of repeatedly polling a cached
      // PENDING generation state while the backend is unavailable.
      if (query.state.error) return false;
      return shouldPollPlan(query.state.data) ? PLAN_POLL_INTERVAL_MS : false;
    },
  });
}

export function useStartGenerationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => coachingApi.startGeneration(),
    onSuccess: (data) => {
      queryClient.setQueryData(coachingPlanKey, data);
      if (shouldPollPlan(data)) {
        void queryClient.invalidateQueries({ queryKey: coachingPlanKey });
      }
    },
  });
}

export function useAcceptPlanMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => coachingApi.acceptPlan(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: coachingPlanKey }),
  });
}

export function useUpdateActionStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ actionId, body }: { actionId: string; body: UpdateActionBody }) => coachingApi.updateAction(actionId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: coachingPlanKey }),
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'ACTION_CONFLICT') {
        void queryClient.invalidateQueries({ queryKey: coachingPlanKey });
      }
    },
  });
}
