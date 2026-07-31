'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  profileApi,
  type LanguageCode,
  type PutLanguageBody,
  type PutProfileBody,
} from './profile.api';

/**
 * Profile + onboarding hooks (US3, FR-035). TanStack Query wrappers around the
 * ProfileApiService so the profile page gets loading/error states and cached
 * reads. The onboarding-state query drives resume routing (US8/US9, FR-033).
 */

export function useOnboardingStateQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['onboarding', 'state'],
    queryFn: () => profileApi.getOnboardingState(),
    retry: 1,
    enabled: options?.enabled,
  });
}

/**
 * Authoritative completion check (US9, FR-033). `retry: false` so a 401
 * (unauthenticated visitor) is not retried — the api-client already attempts one
 * transparent refresh internally; a further TanStack retry would waste calls. A
 * 401 is treated by the router as "unauthenticated → stay on the public landing."
 */
export function useOnboardingCompletionQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['onboarding', 'completion'],
    queryFn: () => profileApi.getOnboardingCompletion(),
    retry: false,
    enabled: options?.enabled,
  });
}

export function useProfileQuery() {
  // 404 is expected before the profile is saved — treat it as "no profile yet"
  // rather than a hard error so the page can render the blank form.
  return useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => profileApi.getProfile(),
    retry: 1,
  });
}

export function usePutProfileMutation() {
  return useMutation({
    mutationFn: (body: PutProfileBody) => profileApi.putProfile(body),
  });
}

export function usePutLanguageMutation() {
  return useMutation({
    mutationFn: (body: PutLanguageBody) => profileApi.putLanguage(body),
  });
}

/** Re-export the supported language codes for selectors. */
export type { LanguageCode };