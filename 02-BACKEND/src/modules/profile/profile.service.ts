import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConsentService } from '../auth/consent.service';
import {
  OnboardingGuardService,
  type OnboardingGuardContext,
  type OnboardingStep,
} from './onboarding.guard';
import {
  type LanguageCode,
  type OnboardingCompletionResponse,
  type OnboardingStateResponse,
  type PreferencesView,
  type PutLanguageInput,
  type PutLanguageResponse,
  type PutProfileInput,
  type PutProfileResponse,
  dirFor,
} from './profile.dto';

/**
 * Profile domain service (FR-009..FR-011, FR-033; contracts/profile-onboarding.md;
 * data-model §5–§7). Owns the Profile / Preferences / OnboardingState rows.
 *
 * Journey wiring (data-model §7):
 *  - The OnboardingGuard (T033) is the authority for step ordering; this service
 *    builds the guard context from the persisted OnboardingState + ConsentService
 *    and asserts entry before mutating state (FR-006/FR-033).
 *  - putProfile transitions NOT_STARTED|IN_PROGRESS → ASSESSMENT_PENDING (profile
 *    saved; advances to assessment). Re-saving is a no-op on state (FR-034).
 *  - putLanguage updates only the language preference; it never clears onboarding
 *    state or saved answers (FR-011). The persisted language drives RTL/LTR +
 *    localization for all subsequent screens (FR-010).
 *
 * The OnboardingState row is created lazily by this module (its owner) — the Auth
 * consent flow does not touch Profile tables (SAD §5 / ADR-005). Missing row is
 * treated as NOT_STARTED; the consent→IN_PROGRESS transition is implicit because
 * the guard already required consent before putProfile runs.
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentService,
    private readonly guard: OnboardingGuardService,
  ) {}

  async getProfile(userId: string): Promise<PreferencesView> {
    const profile = await this.prisma.profile.findFirst({ where: { userId } });
    if (!profile) throw new NotFoundException({ error: { code: 'PROFILE_NOT_FOUND' } });
    const prefs = await this.prisma.preferences.findFirst({ where: { userId } });
    return {
      language_code: (prefs?.languageCode ?? 'en') as LanguageCode,
      timezone: prefs?.timezone ?? '',
    };
  }

  async putProfile(userId: string, input: PutProfileInput): Promise<PutProfileResponse> {
    const ctx = await this.contextFor(userId);
    this.guard.assertCanEnter('profile', ctx); // 403 ONBOARDING_STEP_BLOCKED if no consent
    const now = new Date();

    await this.upsertProfile(userId, now);
    await this.upsertPreferences(userId, input.language_code, input.timezone, now);
    await this.transitionTo(userId, 'ASSESSMENT_PENDING', now);

    return {
      profile: { created_at: now.toISOString() },
      preferences: { language_code: input.language_code, timezone: input.timezone },
      onboarding_state: 'ASSESSMENT_PENDING',
      next: '/assessment',
    };
  }

  async putLanguage(userId: string, input: PutLanguageInput): Promise<PutLanguageResponse> {
    const ctx = await this.contextFor(userId);
    this.guard.assertCanEnter('profile', ctx); // consent gate; never clears progress
    const now = new Date();
    const existing = await this.prisma.preferences.findFirst({ where: { userId } });
    if (existing) {
      await this.prisma.preferences.update({
        where: { id: existing.id },
        data: { languageCode: input.language_code, updatedAt: now },
      });
    } else {
      await this.prisma.preferences.create({
        data: { userId, languageCode: input.language_code, timezone: null },
      });
    }
    await this.touchActivity(userId, now);
    return { language_code: input.language_code, dir: dirFor(input.language_code) };
  }

  async getOnboardingState(userId: string): Promise<OnboardingStateResponse> {
    const row = await this.prisma.onboardingState.findFirst({ where: { userId } });
    const state = row?.state ?? 'NOT_STARTED';
    const consentGranted = await this.consent.hasGrantedCurrentConsent(userId);
    const consentStatus = await this.safeConsentStatus(userId);
    const language = await this.languageOf(userId);

    const ctx: OnboardingGuardContext = {
      userId,
      onboardingState: state,
      emailVerified: true, // EmailVerifiedGuard enforced at the route
      consentGranted,
    };
    const step = this.guard.nextStep(ctx);
    return {
      onboarding_state: state,
      current_step: row?.currentStep ?? null,
      // Derived from the onboarding state only — Profile MUST NOT read the
      // Assessment table (SAD §5 / ADR-005). The authoritative assessment_state
      // is GET /assessment; this is a routing hint. ASSESSMENT_PENDING → null
      // (assessment not yet started), matching the pre-US4 contract.
      assessment_state: deriveAssessmentState(state),
      language_code: language,
      requires_reconsent: consentStatus?.requires_reconsent ?? true, // fail-closed
      next_route: step ? STEP_ROUTE[step] : null,
    };
  }

  /**
   * Authoritative completion check (US9, FR-033; contracts/profile-onboarding.md
   * GET /onboarding/completion). `completed` is true ONLY when the persisted
   * OnboardingState is COMPLETED — SAFETY_HOLD and every incomplete state report
   * completed:false so the router routes to the unfinished step / safety hold
   * instead of assuming completion. If the state cannot be determined (no row),
   * report NOT_STARTED with completed:false (the earliest unfinished step) —
   * fail-closed: never assume completion (US9 failure path). This reads only the
   * OnboardingState row Profile owns; it does NOT read the Assessment table
   * (SAD §5 / ADR-005). EMAIL_VERIFIED-only (no consent gate), mirroring state.
   */
  async getOnboardingCompletion(userId: string): Promise<OnboardingCompletionResponse> {
    const row = await this.prisma.onboardingState.findFirst({ where: { userId } });
    const state = row?.state ?? 'NOT_STARTED';
    return {
      completed: state === 'COMPLETED',
      onboarding_state: state,
      post_onboarding_route: '/dashboard',
    };
  }

  // ─────────────────────────── helpers ───────────────────────────

  /** Consent status without throwing (fail-closed → treats undetermined as re-consent). */
  private async safeConsentStatus(userId: string) {
    try {
      return await this.consent.getConsentStatus(userId);
    } catch (err) {
      this.logger.warn(`consent-status-error: ${errName(err)}`);
      return null;
    }
  }

  private async contextFor(userId: string): Promise<OnboardingGuardContext> {
    const row = await this.prisma.onboardingState.findFirst({ where: { userId } });
    const consentGranted = await this.consent.hasGrantedCurrentConsent(userId);
    return {
      userId,
      onboardingState: row?.state ?? 'NOT_STARTED',
      emailVerified: true,
      consentGranted,
    };
  }

  private async languageOf(userId: string): Promise<LanguageCode | null> {
    const prefs = await this.prisma.preferences.findFirst({ where: { userId } });
    return (prefs?.languageCode as LanguageCode | undefined) ?? null;
  }

  private async upsertProfile(userId: string, now: Date): Promise<void> {
    const existing = await this.prisma.profile.findFirst({ where: { userId } });
    if (existing) {
      await this.prisma.profile.update({ where: { id: existing.id }, data: { updatedAt: now } });
    } else {
      await this.prisma.profile.create({ data: { userId, createdAt: now, updatedAt: now } });
    }
  }

  private async upsertPreferences(
    userId: string,
    languageCode: LanguageCode,
    timezone: string,
    now: Date,
  ): Promise<void> {
    const existing = await this.prisma.preferences.findFirst({ where: { userId } });
    if (existing) {
      await this.prisma.preferences.update({
        where: { id: existing.id },
        data: { languageCode, timezone, updatedAt: now },
      });
    } else {
      await this.prisma.preferences.create({ data: { userId, languageCode, timezone } });
    }
  }

  /** Transition to `target` if the current state is in the pre-step set; else no-op
   * on state (re-save allowed, FR-034). Creates the row lazily if missing. */
  private async transitionTo(
    userId: string,
    target: 'ASSESSMENT_PENDING',
    now: Date,
  ): Promise<void> {
    const existing = await this.prisma.onboardingState.findFirst({ where: { userId } });
    if (!existing) {
      await this.prisma.onboardingState.create({
        data: { userId, state: target, currentStep: null, updatedAt: now, lastActivityAt: now },
      });
      return;
    }
    const preSteps = ['NOT_STARTED', 'IN_PROGRESS'];
    const next = preSteps.includes(existing.state) ? target : existing.state;
    await this.prisma.onboardingState.update({
      where: { id: existing.id },
      data: { state: next as never, updatedAt: now, lastActivityAt: now },
    });
  }

  private async touchActivity(userId: string, now: Date): Promise<void> {
    const existing = await this.prisma.onboardingState.findFirst({ where: { userId } });
    if (existing) {
      await this.prisma.onboardingState.update({
        where: { id: existing.id },
        data: { updatedAt: now, lastActivityAt: now },
      });
    }
  }
}

/** Maps a guard step to the frontend route the user resumes at (FR-033). */
const STEP_ROUTE: Record<OnboardingStep, string> = {
  boundary: '/onboarding/boundary',
  profile: '/onboarding/profile',
  assessment: '/assessment',
  result: '/assessment/result',
  safety_hold: '/safety/hold',
  dashboard: '/dashboard',
};

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown';
}

/**
 * Derive the assessment_state from the onboarding_state (pure mapping, no
 * Assessment-table read — SAD §5 / ADR-005). Submit transitions the Assessment
 * SUBMITTED→SCORED atomically with onboarding→ASSESSMENT_SUBMITTED, so both
 * ASSESSMENT_SUBMITTED and COMPLETED map to SCORED. ASSESSMENT_PENDING maps to
 * null: the assessment row is lazy-created on GET /assessment but is NOT_STARTED,
 * and Profile cannot observe that without a cross-module read, so it reports
 * "no assessment state" (routing hint only). SAFETY_HOLD maps to SUSPENDED.
 */
function deriveAssessmentState(onboardingState: string): string | null {
  switch (onboardingState) {
    case 'ASSESSMENT_IN_PROGRESS':
      return 'IN_PROGRESS';
    case 'ASSESSMENT_SUBMITTED':
    case 'COMPLETED':
      return 'SCORED';
    case 'SAFETY_HOLD':
      return 'SUSPENDED';
    default:
      return null; // NOT_STARTED | IN_PROGRESS | ASSESSMENT_PENDING
  }
}