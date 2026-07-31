'use client';

import { useMutation } from '@tanstack/react-query';
import { authApi, type RegisterBody } from './auth.api';

/**
 * Auth mutations (US1). Each wraps an AuthApiService call in a TanStack Query
 * mutation so pages get `isPending`/`isError`/`error` for loading & error states.
 * The access token is stored in memory inside authApi (login) / cleared (logout).
 */

export function useRegisterMutation() {
  return useMutation({
    mutationFn: (body: RegisterBody) => authApi.register(body),
  });
}

export function useResendVerificationMutation() {
  return useMutation({
    mutationFn: (email: string) => authApi.resendVerification(email),
  });
}

export function useVerifyEmailMutation() {
  return useMutation({
    mutationFn: ({ token, userId }: { token: string; userId: string }) =>
      authApi.verifyEmail(token, userId),
  });
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => authApi.login(body),
  });
}

export function useLogoutMutation() {
  return useMutation({
    mutationFn: () => authApi.logout(),
  });
}