'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateActionBody } from '@priora/shared-types';
import { ApiError } from '../../lib/api-client';
import { coachingApi } from './coaching.api';
import { shouldPollPlan } from './coaching-dashboard-state';

export const coachingPlanKey = ['coaching', 'plan'] as const;

export function useCoachingPlanQuery(enabled = true) {
  return useQuery({
    queryKey: coachingPlanKey,
    queryFn: () => coachingApi.getPlan(),
    enabled,
    retry: false,
    refetchInterval: (query) => {
      return shouldPollPlan(query.state.data) ? 1500 : false;
    },
  });
}

export function useStartGenerationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => coachingApi.startGeneration(),
    onSuccess: (data) => queryClient.setQueryData(coachingPlanKey, data),
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
