import { describe, it, expect } from 'vitest';
import { OnboardingGuardServiceImpl } from '../../src/modules/profile/onboarding.service';
import type { OnboardingGuardContext } from '../../src/modules/profile/onboarding.guard';

/**
 * T033 — OnboardingGuard rules (FR-002/FR-006/FR-008/FR-033). The guard is pure
 * over a provided context, so the journey ordering is unit-testable with no DB.
 * Verifies the email-verified + consent floor before profile/assessment.
 */
describe('OnboardingGuard (US2 rules)', () => {
  const guard = new OnboardingGuardServiceImpl();

  const ctx = (overrides: Partial<OnboardingGuardContext> = {}): OnboardingGuardContext => ({
    userId: 'u1',
    onboardingState: 'NOT_STARTED',
    emailVerified: true,
    consentGranted: false,
    ...overrides,
  });

  it('boundary requires emailVerified', () => {
    expect(() => guard.assertCanEnter('boundary', ctx({ emailVerified: false }))).toThrow();
    expect(() => guard.assertCanEnter('boundary', ctx({ emailVerified: true }))).not.toThrow();
  });

  it('profile requires emailVerified + consent granted (FR-006)', () => {
    expect(() => guard.assertCanEnter('profile', ctx({ emailVerified: true, consentGranted: false }))).toThrow();
    expect(() => guard.assertCanEnter('profile', ctx({ emailVerified: false, consentGranted: true }))).toThrow();
    expect(() =>
      guard.assertCanEnter('profile', ctx({ emailVerified: true, consentGranted: true })),
    ).not.toThrow();
  });

  it('assessment requires emailVerified + consent granted (FR-006/FR-008)', () => {
    expect(() => guard.assertCanEnter('assessment', ctx({ consentGranted: false }))).toThrow();
    expect(() =>
      guard.assertCanEnter('assessment', ctx({ consentGranted: true })),
    ).not.toThrow();
  });

  it('a blocked entry throws 403 ONBOARDING_STEP_BLOCKED with the correct next step', () => {
    try {
      guard.assertCanEnter('profile', ctx({ emailVerified: true, consentGranted: false }));
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as { getStatus: () => number }).getStatus()).toBe(403);
      const body = (e as { getResponse: () => unknown }).getResponse() as {
        error: { code: string; next: string };
      };
      expect(body.error.code).toBe('ONBOARDING_STEP_BLOCKED');
      expect(body.error.next).toBe('boundary');
    }
  });

  it('nextStep routes to boundary when consent is missing, then profile, then assessment', () => {
    expect(guard.nextStep(ctx({ emailVerified: false }))).toBeNull();
    expect(guard.nextStep(ctx({ emailVerified: true, consentGranted: false }))).toBe('boundary');
    expect(
      guard.nextStep(ctx({ emailVerified: true, consentGranted: true, onboardingState: 'NOT_STARTED' })),
    ).toBe('profile');
    expect(
      guard.nextStep(ctx({ emailVerified: true, consentGranted: true, onboardingState: 'IN_PROGRESS' })),
    ).toBe('profile');
    expect(
      guard.nextStep(
        ctx({ emailVerified: true, consentGranted: true, onboardingState: 'ASSESSMENT_PENDING' }),
      ),
    ).toBe('assessment');
  });
});