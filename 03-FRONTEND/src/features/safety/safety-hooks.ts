'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { safetyApi } from './safety.api';

/**
 * Safety hooks (US6, FR-019b context, Safety Matrix §9). TanStack Query wrappers
 * around the SafetyApiService. `useHoldQuery` loads the SAFETY_HOLD page data
 * (current copy + immutable historical list); `useReentryMutation` submits the
 * user-initiated re-entry answers. Re-entry invalidates the active-assessment view
 * so the wizard resumes from the server-authoritative state after a resume.
 */

export function useHoldQuery(enabled = true) {
  return useQuery({
    queryKey: ['safety', 'hold'],
    queryFn: () => safetyApi.getHold(),
    enabled,
    retry: 1,
  });
}

export function useReentryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: safetyApi.reentry,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assessment', 'view'] });
      void qc.invalidateQueries({ queryKey: ['safety', 'hold'] });
    },
  });
}