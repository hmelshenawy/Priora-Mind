/**
 * Onboarding step → frontend route map (US8, FR-033/FR-035).
 *
 * Mirrors the backend `STEP_ROUTE` (profile.service.ts) so a 403
 * `ONBOARDING_STEP_BLOCKED` response — which carries the unfinished step name
 * in `error.next` — can be mapped client-side to the correct resume route. The
 * i18n navigation helpers prefix these bare paths with the active locale.
 *
 * SECURITY: this mapping is UX-only (FR-028). The backend guard is the real
 * boundary; this just routes a blocked user to the right unfinished step instead
 * of a hardcoded one.
 */

export type OnboardingStep =
  | 'boundary'
  | 'profile'
  | 'assessment'
  | 'result'
  | 'safety_hold'
  | 'dashboard';

/** Backend step name → bare frontend route (locale prefix added by the router). */
export const STEP_ROUTE: Record<OnboardingStep, string> = {
  boundary: '/onboarding/boundary',
  profile: '/onboarding/profile',
  assessment: '/assessment',
  result: '/assessment/result',
  safety_hold: '/safety/hold',
  dashboard: '/dashboard',
};

/** Default resume target when the backend did not include a `next` step
 * (defensive — the backend always includes it for ONBOARDING_STEP_BLOCKED). */
const DEFAULT_RESUME_ROUTE = '/onboarding/boundary';

/**
 * Map an unfinished onboarding step name (from `ONBOARDING_STEP_BLOCKED.next`)
 * to the frontend route the user should resume at. Unknown/null step names fall
 * back to the boundary (the earliest onboarding step), never to a protected area.
 */
export function routeForStep(step: string | null | undefined): string {
  if (step && step in STEP_ROUTE) return STEP_ROUTE[step as OnboardingStep];
  return DEFAULT_RESUME_ROUTE;
}