import { z } from 'zod';

/**
 * Auth DTOs / Zod schemas (contracts/auth.md).
 * Passwords are validated structurally; the submitted value is NEVER echoed
 * back in a validation error (the global filter emits field paths only).
 */

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  consent_language_code: z.enum(['ar', 'en']).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  // Lenient on login: a single-character policy keeps the 401 uniform regardless
  // of whether the email exists (anti-enumeration, FR-004).
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailQuerySchema = z.object({
  token: z.string().min(1),
  userId: z.string().min(1),
});
export type VerifyEmailQuery = z.infer<typeof verifyEmailQuerySchema>;

/** Anti-enumeration response bodies (FR-004). Identical whether or not the account exists. */
export const REGISTER_ACK_MESSAGE =
  'If this email is not already registered, a verification email has been sent.';
export const RESEND_ACK_MESSAGE =
  'If the email is registered and unverified, a new verification link has been sent.';

export interface RegisterResponse {
  message: string;
}

export interface VerifyEmailResponse {
  status: 'verified';
  redirect: string;
}

export interface LoginProfile {
  /** Placeholder until US3 reads the real OnboardingState row. */
  onboarding_state: 'NOT_STARTED';
  language_code: string | null;
}

export interface LoginResponse {
  accessToken: string;
  profile: LoginProfile;
}

export interface RefreshResponse {
  accessToken: string;
}