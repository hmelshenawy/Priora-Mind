'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { assessmentApi } from './assessment.api';

/**
 * Assessment hooks (US4, FR-035). TanStack Query wrappers around the
 * AssessmentApiService so the wizard gets loading/error states, cached reads
 * (definition is immutable per version — research D5), and idempotent writes.
 * Saves/submit invalidate the active-assessment view so progress stays in sync.
 */

export function useDefinitionQuery() {
  return useQuery({
    queryKey: ['assessment', 'definition'],
    queryFn: () => assessmentApi.getDefinition(),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useAssessmentQuery() {
  return useQuery({
    queryKey: ['assessment', 'view'],
    queryFn: () => assessmentApi.getAssessment(),
    retry: 1,
  });
}

export function useSaveAnswerMutation() {
  return useMutation({
    mutationFn: ({ questionId, body }: { questionId: string; body: unknown }) =>
      assessmentApi.saveAnswer(questionId, body),
  });
}

export function useRestartMutation() {
  return useMutation({ mutationFn: () => assessmentApi.restart() });
}

export function useSubmitMutation() {
  return useMutation({ mutationFn: () => assessmentApi.submit() });
}

export function useResultQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['assessment', 'result'],
    queryFn: () => assessmentApi.getResult(),
    enabled,
    retry: 1,
  });
}