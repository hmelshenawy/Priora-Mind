'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { consentApi, type LanguageCode, type RecordConsentBody } from './consent.api';

/**
 * Consent hooks (US2). TanStack Query wrappers around the ConsentApiService so
 * the boundary page gets loading/error states (FR-035). Notices are cached for a
 * short window — they are immutable per version set (research D5).
 */

export function useNoticesQuery(lang: LanguageCode) {
  return useQuery({
    queryKey: ['onboarding', 'notices', lang],
    queryFn: () => consentApi.getNotices(lang),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useConsentStatusQuery() {
  return useQuery({
    queryKey: ['onboarding', 'consent-status'],
    queryFn: () => consentApi.getConsentStatus(),
    retry: 1,
  });
}

export function useRecordConsentMutation() {
  return useMutation({
    mutationFn: (body: RecordConsentBody) => consentApi.recordConsent(body),
  });
}