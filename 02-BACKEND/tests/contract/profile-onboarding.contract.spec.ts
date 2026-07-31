import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import '../helpers/test-env';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { validateEnv } from '../../src/common/config';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ProfileModule } from '../../src/modules/profile/profile.module';
import { ProfileDeletionService } from '../../src/modules/profile/profile-deletion.service';
import { EMAIL_PORT } from '../../src/modules/auth/ports/email.port';
import { FakeEmailAdapter } from '../../src/modules/auth/ports/fake-email.adapter';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';
import { NOTICE_VERSION_V1 } from '../../prisma/seed/notice-versions';

/**
 * T036 — Profile + onboarding contract (contracts/profile-onboarding.md,
 * FR-009..FR-011, FR-033). Boots the real Auth + Profile stack over an in-memory
 * Prisma + FakeEmailAdapter. Verifies profile PUT (advances to ASSESSMENT_PENDING),
 * language PUT (re-renders direction, keeps progress), GET profile/state, the
 * consent gate before profile (FR-006), EMAIL_VERIFIED gating, validation, and
 * profile deletion (T041).
 */
describe('Profile + onboarding contract (US3)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let fakeEmail: FakeEmailAdapter;
  let deletion: ProfileDeletionService;
  let agent: ReturnType<typeof request.agent>;

  const AUTH = '/api/v1/auth';
  const ONB = '/api/v1/onboarding';
  const ME = '/api/v1/me';
  const email = 'profile@test.dev';
  const password = 'password123';

  async function registerAndCapture() {
    await agent.post(`${AUTH}/register`).send({ email, password });
    return fakeEmail.last!;
  }

  /** Register → verify → login; returns the access token. */
  async function verifiedAccessToken(): Promise<string> {
    const captured = await registerAndCapture();
    await agent.get(`${AUTH}/verify-email`).query({ token: captured.token, userId: captured.userId });
    const login = await agent.post(`${AUTH}/login`).send({ email, password });
    return login.body.accessToken as string;
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  /** Grant v1 consent so the user may advance past the boundary (FR-006). */
  async function grantConsent(token: string): Promise<void> {
    const body = {
      service_boundary_version: NOTICE_VERSION_V1.serviceBoundaryVersion,
      terms_version: NOTICE_VERSION_V1.termsVersion,
      privacy_notice_version: NOTICE_VERSION_V1.privacyNoticeVersion,
      acknowledgments: { service_boundary: true, terms: true, privacy_notice: true },
      consent_language_code: 'en',
      product_channel_id: 'priora-mind-web',
    };
    await agent.post(`${ONB}/consent`).set(auth(token)).send(body);
  }

  function profileBody(language_code: 'ar' | 'en' = 'en', timezone = 'Africa/Cairo') {
    return { language_code, timezone };
  }

  beforeAll(async () => {
    prisma = new InMemoryPrisma();
    prisma.noticeVersionSet.create({
      data: { ...NOTICE_VERSION_V1, publishedAt: new Date('2026-01-01T00:00:00Z') },
    });
    fakeEmail = new FakeEmailAdapter();
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, envFilePath: [] }),
        PrismaModule,
        AuthModule,
        ProfileModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(EMAIL_PORT)
      .useValue(fakeEmail)
      .compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    agent = request.agent(app.getHttpServer());
    deletion = module.get(ProfileDeletionService);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    prisma.reset();
    prisma.noticeVersionSet.create({
      data: { ...NOTICE_VERSION_V1, publishedAt: new Date('2026-01-01T00:00:00Z') },
    });
    fakeEmail.reset();
  });

  // ── access control ──────────────────────────────────────────────

  it('PUT /onboarding/profile without a token returns 401', async () => {
    const res = await agent.put(`${ONB}/profile`).send(profileBody());
    expect(res.status).toBe(401);
  });

  it('PUT /onboarding/profile for a REGISTERED (unverified) user returns 403 EMAIL_NOT_VERIFIED', async () => {
    const captured = await registerAndCapture();
    const login = await agent.post(`${AUTH}/login`).send({ email, password });
    const res = await agent.put(`${ONB}/profile`).set(auth(login.body.accessToken)).send(profileBody());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(captured.userId).toBeDefined();
  });

  it('PUT /onboarding/profile before granting consent → 403 ONBOARDING_STEP_BLOCKED (FR-006)', async () => {
    const token = await verifiedAccessToken();
    const res = await agent.put(`${ONB}/profile`).set(auth(token)).send(profileBody());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ONBOARDING_STEP_BLOCKED');
    expect(res.body.error.next).toBe('boundary');
    expect(prisma.profileStore.size).toBe(0);
  });

  // ── profile save ──────────────────────────────────────────────────

  it('PUT /onboarding/profile after consent saves language+timezone and advances to ASSESSMENT_PENDING (FR-009/FR-010)', async () => {
    const token = await verifiedAccessToken();
    await grantConsent(token);
    const res = await agent.put(`${ONB}/profile`).set(auth(token)).send(profileBody('ar', 'Africa/Cairo'));
    expect(res.status).toBe(200);
    expect(res.body.onboarding_state).toBe('ASSESSMENT_PENDING');
    expect(res.body.next).toBe('/assessment');
    expect(res.body.preferences.language_code).toBe('ar');
    expect(res.body.preferences.timezone).toBe('Africa/Cairo');
    expect(prisma.profileStore.size).toBe(1);
    expect(prisma.preferencesStore.size).toBe(1);
    const state = [...prisma.onboardingStateStore.values()][0];
    expect(state.state).toBe('ASSESSMENT_PENDING');
  });

  it('PUT /onboarding/profile with an invalid timezone → 400 VALIDATION, no advance', async () => {
    const token = await verifiedAccessToken();
    await grantConsent(token);
    const res = await agent
      .put(`${ONB}/profile`)
      .set(auth(token))
      .send(profileBody('en', 'Not/A/Zone'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(prisma.profileStore.size).toBe(0);
  });

  it('PUT /onboarding/profile with an invalid language → 400 VALIDATION', async () => {
    const token = await verifiedAccessToken();
    await grantConsent(token);
    const res = await agent
      .put(`${ONB}/profile`)
      .set(auth(token))
      .send({ language_code: 'fr', timezone: 'UTC' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  // ── GET profile ─────────────────────────────────────────────────

  it('GET /me/profile before profile is saved → 404', async () => {
    const token = await verifiedAccessToken();
    await grantConsent(token);
    const res = await agent.get(`${ME}/profile`).set(auth(token));
    expect(res.status).toBe(404);
  });

  it('GET /me/profile after profile is saved → 200 {language_code, timezone} (FR-009)', async () => {
    const token = await verifiedAccessToken();
    await grantConsent(token);
    await agent.put(`${ONB}/profile`).set(auth(token)).send(profileBody('ar', 'Asia/Dubai'));
    const res = await agent.get(`${ME}/profile`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.language_code).toBe('ar');
    expect(res.body.timezone).toBe('Asia/Dubai');
  });

  // ── language switch keeps progress (FR-011) ──────────────────────

  it('PUT /me/preferences/language switches direction without clearing onboarding progress (FR-011)', async () => {
    const token = await verifiedAccessToken();
    await grantConsent(token);
    await agent.put(`${ONB}/profile`).set(auth(token)).send(profileBody('ar', 'Africa/Cairo'));

    const toEn = await agent
      .put(`${ME}/preferences/language`)
      .set(auth(token))
      .send({ language_code: 'en' });
    expect(toEn.status).toBe(200);
    expect(toEn.body.language_code).toBe('en');
    expect(toEn.body.dir).toBe('ltr');

    const toAr = await agent
      .put(`${ME}/preferences/language`)
      .set(auth(token))
      .send({ language_code: 'ar' });
    expect(toAr.status).toBe(200);
    expect(toAr.body.dir).toBe('rtl');

    // Progress is retained: onboarding state unchanged, timezone retained.
    const state = await agent.get(`${ONB}/state`).set(auth(token));
    expect(state.body.onboarding_state).toBe('ASSESSMENT_PENDING');
    expect(state.body.language_code).toBe('ar');
    const profile = await agent.get(`${ME}/profile`).set(auth(token));
    expect(profile.body.timezone).toBe('Africa/Cairo');
  });

  it('PUT /me/preferences/language with an invalid language → 400 VALIDATION', async () => {
    const token = await verifiedAccessToken();
    await grantConsent(token);
    await agent.put(`${ONB}/profile`).set(auth(token)).send(profileBody());
    const res = await agent
      .put(`${ME}/preferences/language`)
      .set(auth(token))
      .send({ language_code: 'fr' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('PUT /me/preferences/language before the profile step creates a preferences row with no timezone; putProfile later sets it (FR-009/FR-011)', async () => {
    const token = await verifiedAccessToken();
    await grantConsent(token);

    // Language switch at the profile step, before the profile form is submitted. No
    // default timezone is invented (FR-009); the field stays nullable until putProfile.
    const res = await agent
      .put(`${ME}/preferences/language`)
      .set(auth(token))
      .send({ language_code: 'ar' });
    expect(res.status).toBe(200);
    expect(res.body.language_code).toBe('ar');

    // The preferences row exists with the language set and timezone unset (nullable).
    expect(prisma.preferencesStore.size).toBe(1);
    const prefs = [...prisma.preferencesStore.values()][0];
    expect(prefs.languageCode).toBe('ar');
    expect(prefs.timezone).toBeNull();

    // Completing the profile step later sets the validated timezone (FR-009).
    const saved = await agent
      .put(`${ONB}/profile`)
      .set(auth(token))
      .send(profileBody('ar', 'Asia/Dubai'));
    expect(saved.status).toBe(200);
    expect(saved.body.preferences.timezone).toBe('Asia/Dubai');
    expect([...prisma.preferencesStore.values()][0].timezone).toBe('Asia/Dubai');
  });

  // ── onboarding state ────────────────────────────────────────────

  it('GET /onboarding/state after consent (before profile) routes to /onboarding/profile', async () => {
    const token = await verifiedAccessToken();
    await grantConsent(token);
    const res = await agent.get(`${ONB}/state`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.requires_reconsent).toBe(false);
    expect(res.body.next_route).toBe('/onboarding/profile');
    expect(['NOT_STARTED', 'IN_PROGRESS']).toContain(res.body.onboarding_state);
  });

  it('GET /onboarding/state after profile routes to /assessment (FR-033)', async () => {
    const token = await verifiedAccessToken();
    await grantConsent(token);
    await agent.put(`${ONB}/profile`).set(auth(token)).send(profileBody());
    const res = await agent.get(`${ONB}/state`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.onboarding_state).toBe('ASSESSMENT_PENDING');
    expect(res.body.assessment_state).toBeNull();
    expect(res.body.next_route).toBe('/assessment');
    expect(res.body.language_code).toBe('en');
  });

  it('GET /onboarding/state without a token returns 401', async () => {
    const res = await agent.get(`${ONB}/state`);
    expect(res.status).toBe(401);
  });

  // ── US8 resume routing (FR-033) ──────────────────────────────────
  //
  // FR-033: GET /onboarding/state returns the correct `current_step` +
  // `next_route` for the user's persisted onboarding state so the frontend can
  // redirect a returning user to the correct unfinished step (or the right
  // post-onboarding destination). Profile MUST NOT read the Assessment table
  // (SAD §5 / ADR-005); the assessment_state is a derived routing hint only.
  // Each state below is injected directly (consent is granted first so the
  // guard floor is satisfied), then the endpoint's pure state→route mapping is
  // asserted — covering the resume + redirect-to-unfinished contract.

  /** Grant v1 consent + set the user's onboarding state/currentStep directly so
   * the guard's consent floor is met and the state→route mapping can be asserted. */
  async function setOnboardingState(
    state:
      | 'NOT_STARTED'
      | 'IN_PROGRESS'
      | 'ASSESSMENT_PENDING'
      | 'ASSESSMENT_IN_PROGRESS'
      | 'ASSESSMENT_SUBMITTED'
      | 'COMPLETED'
      | 'SAFETY_HOLD',
    currentStep: string | null,
  ): Promise<string> {
    const token = await verifiedAccessToken();
    await grantConsent(token);
    const userId = [...prisma.userStore.values()][0].id;
    const existing = [...prisma.onboardingStateStore.values()].find((r) => r.userId === userId);
    if (existing) {
      prisma.onboardingState.update({ where: { id: existing.id }, data: { state, currentStep } });
    } else {
      prisma.onboardingState.create({ data: { userId, state, currentStep } });
    }
    return token;
  }

  it('US8: ASSESSMENT_IN_PROGRESS routes to /assessment with current_step "assessment" (FR-033)', async () => {
    const token = await setOnboardingState('ASSESSMENT_IN_PROGRESS', 'assessment');
    const res = await agent.get(`${ONB}/state`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.onboarding_state).toBe('ASSESSMENT_IN_PROGRESS');
    expect(res.body.current_step).toBe('assessment');
    expect(res.body.assessment_state).toBe('IN_PROGRESS');
    expect(res.body.next_route).toBe('/assessment');
  });

  it('US8: ASSESSMENT_SUBMITTED routes to /assessment/result (result pending, FR-033)', async () => {
    const token = await setOnboardingState('ASSESSMENT_SUBMITTED', 'assessment');
    const res = await agent.get(`${ONB}/state`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.current_step).toBe('assessment');
    expect(res.body.assessment_state).toBe('SCORED');
    expect(res.body.next_route).toBe('/assessment/result');
  });

  it('US8: SAFETY_HOLD routes to /safety/hold with assessment_state SUSPENDED (FR-033)', async () => {
    const token = await setOnboardingState('SAFETY_HOLD', 'safety_hold');
    const res = await agent.get(`${ONB}/state`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.current_step).toBe('safety_hold');
    expect(res.body.assessment_state).toBe('SUSPENDED');
    expect(res.body.next_route).toBe('/safety/hold');
  });

  it('US8: COMPLETED routes to /dashboard (post-onboarding, FR-033)', async () => {
    const token = await setOnboardingState('COMPLETED', null);
    const res = await agent.get(`${ONB}/state`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.onboarding_state).toBe('COMPLETED');
    expect(res.body.assessment_state).toBe('SCORED');
    expect(res.body.next_route).toBe('/dashboard');
  });

  it('US8: ASSESSMENT_PENDING routes to /assessment with null current_step (resume hint, FR-033)', async () => {
    const token = await setOnboardingState('ASSESSMENT_PENDING', null);
    const res = await agent.get(`${ONB}/state`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.current_step).toBeNull();
    expect(res.body.assessment_state).toBeNull();
    expect(res.body.next_route).toBe('/assessment');
  });

  // ── US9 authoritative completion check (FR-033, SC-009) ─────────
  //
  // GET /onboarding/completion is the authoritative boolean the frontend router
  // uses to bypass onboarding for COMPLETED users (US9). `completed` is true
  // ONLY when OnboardingState = COMPLETED — SAFETY_HOLD and every incomplete
  // state report completed:false so the router routes to the unfinished step /
  // safety hold rather than assuming completion. If the state cannot be
  // determined (no onboarding row), the user is treated as NOT completed and
  // routed to the earliest unfinished step (US9 failure path — fail-closed:
  // never assume completion). EMAIL_VERIFIED-only (no consent gate), mirroring
  // GET /onboarding/state.

  it('US9: GET /onboarding/completion without a token returns 401', async () => {
    const res = await agent.get(`${ONB}/completion`);
    expect(res.status).toBe(401);
  });

  it('US9: COMPLETED → completed:true + post_onboarding_route /dashboard (SC-009)', async () => {
    const token = await setOnboardingState('COMPLETED', null);
    const res = await agent.get(`${ONB}/completion`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
    expect(res.body.onboarding_state).toBe('COMPLETED');
    expect(res.body.post_onboarding_route).toBe('/dashboard');
  });

  it('US9: ASSESSMENT_IN_PROGRESS → completed:false (must not bypass onboarding)', async () => {
    const token = await setOnboardingState('ASSESSMENT_IN_PROGRESS', 'assessment');
    const res = await agent.get(`${ONB}/completion`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(false);
    expect(res.body.onboarding_state).toBe('ASSESSMENT_IN_PROGRESS');
    expect(res.body.post_onboarding_route).toBe('/dashboard');
  });

  it('US9: SAFETY_HOLD → completed:false (safety before completion, FR-019b)', async () => {
    const token = await setOnboardingState('SAFETY_HOLD', 'safety_hold');
    const res = await agent.get(`${ONB}/completion`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(false);
    expect(res.body.onboarding_state).toBe('SAFETY_HOLD');
  });

  it('US9: undeterminable (no onboarding row) → completed:false + NOT_STARTED (earliest unfinished, US9 failure path)', async () => {
    // Verified but no onboarding state row at all → state cannot be determined →
    // fail-closed: treat as NOT_STARTED (not completed) → earliest unfinished step.
    const token = await verifiedAccessToken();
    const res = await agent.get(`${ONB}/completion`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(false);
    expect(res.body.onboarding_state).toBe('NOT_STARTED');
    expect(res.body.post_onboarding_route).toBe('/dashboard');
  });

  // ── profile deletion (T041) ─────────────────────────────────────

  it('deleteProfileForUsers removes profile/preferences/onboarding and is idempotent', async () => {
    const token = await verifiedAccessToken();
    await grantConsent(token);
    await agent.put(`${ONB}/profile`).set(auth(token)).send(profileBody());
    const userId = [...prisma.userStore.values()][0].id;
    expect(prisma.profileStore.size).toBe(1);
    expect(prisma.preferencesStore.size).toBe(1);
    expect(prisma.onboardingStateStore.size).toBe(1);

    const first = await deletion.deleteProfileForUsers([userId]);
    expect(first.deleted).toBe(3);
    expect(first.errors).toBe(0);
    expect(prisma.profileStore.size).toBe(0);
    expect(prisma.preferencesStore.size).toBe(0);
    expect(prisma.onboardingStateStore.size).toBe(0);

    const second = await deletion.deleteProfileForUsers([userId]);
    expect(second.deleted).toBe(0); // idempotent re-run
  });
});