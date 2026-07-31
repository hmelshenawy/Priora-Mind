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
import { AssessmentModule } from '../../src/modules/assessment/assessment.module';
import { SafetyModule } from '../../src/modules/safety/safety.module';
import { RetentionModule } from '../../src/modules/retention/retention.module';
import { EMAIL_PORT } from '../../src/modules/auth/ports/email.port';
import { FakeEmailAdapter } from '../../src/modules/auth/ports/fake-email.adapter';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';
import { NOTICE_VERSION_V1 } from '../../prisma/seed/notice-versions';
import { CURRENT_STATE_QUESTIONS } from '../../src/modules/assessment/assessment-definition';

/**
 * T088 — Backend-enforced user-data isolation (FR-027..FR-029, SC-008, AC-X3).
 *
 * Route guards are UX only (FR-028); every protected endpoint derives the owner
 * from the verified access token and scopes ALL reads/writes to that owner. This
 * suite proves cross-user access is impossible through the real HTTP surface:
 *  - Two fully-onboarded users (A, B) with deliberately distinct data.
 *  - B's token can never read A's profile, onboarding state, assessment, answers,
 *    or result — and vice versa. Each endpoint returns only the authenticated
 *    owner's row(s).
 *  - B mutating answers never touches A's assessment.
 *  - Anti-enumeration (FR-004): registration is acknowledged identically whether or
 *    not the email exists; unknown-email and wrong-password logins are
 *    indistinguishable (same 401 INVALID_CREDENTIALS).
 */
describe('Backend-enforced user-data isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let fakeEmail: FakeEmailAdapter;
  let agent: ReturnType<typeof request.agent>;

  const AUTH = '/api/v1/auth';
  const ONB = '/api/v1/onboarding';
  const A = '/api/v1/assessment';
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function verifiedAccessToken(em: string): Promise<string> {
    await agent.post(`${AUTH}/register`).send({ email: em, password: 'password123' });
    const captured = fakeEmail.last!;
    await agent.get(`${AUTH}/verify-email`).query({ token: captured.token, userId: captured.userId });
    const login = await agent.post(`${AUTH}/login`).send({ email: em, password: 'password123' });
    return login.body.accessToken as string;
  }

  async function consent(token: string) {
    await agent
      .post(`${ONB}/consent`)
      .set(auth(token))
      .send({
        service_boundary_version: NOTICE_VERSION_V1.serviceBoundaryVersion,
        terms_version: NOTICE_VERSION_V1.termsVersion,
        privacy_notice_version: NOTICE_VERSION_V1.privacyNoticeVersion,
        acknowledgments: { service_boundary: true, terms: true, privacy_notice: true },
        consent_language_code: 'en',
        product_channel_id: 'priora-mind-web',
      });
  }

  /** Fully onboard with a chosen language + a chosen single AG-01 domain so the
   * result's selected_priorities is user-distinct (isolation sentinel). */
  async function fullyOnboard(token: string, lang: 'en' | 'ar', domain: string) {
    await consent(token);
    await agent.put(`${ONB}/profile`).set(auth(token)).send({ language_code: lang, timezone: 'UTC' });
    for (const q of CURRENT_STATE_QUESTIONS) {
      await agent.put(`${A}/answers/${q.id}`).set(auth(token)).send({ value: 2 });
    }
    await agent.put(`${A}/answers/AG-01`).set(auth(token)).send({ domains: [domain] });
    await agent.put(`${A}/answers/AG-02`).set(auth(token)).send({ ranking: { [domain]: 1 } });
    await agent.put(`${A}/answers/AG-03`).set(auth(token)).send({ goals: { [domain]: { text: 'g' } } });
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S0' });
    await agent.put(`${A}/answers/SQ-03`).set(auth(token)).send({ code: 'F0' });
    const submit = await agent.post(`${A}/submit`).set(auth(token));
    expect(submit.status).toBe(200);
    return submit.body;
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
        AssessmentModule,
        SafetyModule,
        RetentionModule,
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

  // ── profile isolation (FR-027/FR-029) ────────────────────────────────

  it('GET /me/profile returns only the authenticated owner profile — never another user (SC-008)', async () => {
    const a = await verifiedAccessToken('iso-a@test.dev');
    const b = await verifiedAccessToken('iso-b@test.dev');
    await consent(a);
    await agent.put(`${ONB}/profile`).set(auth(a)).send({ language_code: 'en', timezone: 'UTC' });
    await consent(b);
    await agent.put(`${ONB}/profile`).set(auth(b)).send({ language_code: 'ar', timezone: 'UTC' });

    const aProf = await agent.get('/api/v1/me/profile').set(auth(a));
    const bProf = await agent.get('/api/v1/me/profile').set(auth(b));
    expect(aProf.status).toBe(200);
    expect(bProf.status).toBe(200);
    expect(aProf.body.language_code).toBe('en');
    expect(bProf.body.language_code).toBe('ar');
    // B never receives A's profile (en) and vice versa.
    expect(bProf.body.language_code).not.toBe('en');
    expect(aProf.body.language_code).not.toBe('ar');
  });

  // ── onboarding state isolation (FR-029) ──────────────────────────────

  it('GET /onboarding/state returns only the owner state — incomplete A vs completed B never cross (SC-008)', async () => {
    const a = await verifiedAccessToken('iso-state-a@test.dev');
    const b = await verifiedAccessToken('iso-state-b@test.dev');
    // A: partially onboarded (consent + profile + one answer) → still incomplete.
    await consent(a);
    await agent.put(`${ONB}/profile`).set(auth(a)).send({ language_code: 'en', timezone: 'UTC' });
    await agent.put(`${A}/answers/${CURRENT_STATE_QUESTIONS[0].id}`).set(auth(a)).send({ value: 2 });
    // B: fully onboarded → COMPLETED.
    await fullyOnboard(b, 'en', 'stress');

    const aState = await agent.get(`${ONB}/state`).set(auth(a));
    const bState = await agent.get(`${ONB}/state`).set(auth(b));
    expect(aState.status).toBe(200);
    expect(bState.status).toBe(200);
    expect(aState.body.onboarding_state).not.toBe('COMPLETED');
    expect(bState.body.onboarding_state).toBe('COMPLETED');
    // B's next route is the post-onboarding destination; A's is an unfinished step.
    expect(bState.body.next_route).toBe('/dashboard');
    expect(aState.body.next_route).not.toBe('/dashboard');
  });

  // ── assessment + answers + result isolation (FR-029, AC-X3) ──────────

  it('each user has their own assessment; B answering never mutates A assessment (AC-X3)', async () => {
    const a = await verifiedAccessToken('iso-asm-a@test.dev');
    const b = await verifiedAccessToken('iso-asm-b@test.dev');
    await consent(a);
    await agent.put(`${ONB}/profile`).set(auth(a)).send({ language_code: 'en', timezone: 'UTC' });
    await consent(b);
    await agent.put(`${ONB}/profile`).set(auth(b)).send({ language_code: 'en', timezone: 'UTC' });

    // A answers 3 questions; B answers 5.
    for (const q of CURRENT_STATE_QUESTIONS.slice(0, 3)) {
      await agent.put(`${A}/answers/${q.id}`).set(auth(a)).send({ value: 2 });
    }
    for (const q of CURRENT_STATE_QUESTIONS.slice(0, 5)) {
      await agent.put(`${A}/answers/${q.id}`).set(auth(b)).send({ value: 2 });
    }

    const aView = await agent.get(`${A}`).set(auth(a));
    const bView = await agent.get(`${A}`).set(auth(b));
    expect(aView.body.assessment_id).not.toBe(bView.body.assessment_id);
    // A's answered set is untouched by B's activity (3, not 5).
    expect(aView.body.answered).toHaveLength(3);
    expect(bView.body.answered).toHaveLength(5);
  });

  it('submit yields only the owner result — B never receives A priorities, A never receives B (FR-029, AC-X3)', async () => {
    const a = await verifiedAccessToken('iso-res-a@test.dev');
    const b = await verifiedAccessToken('iso-res-b@test.dev');
    const aSubmit = await fullyOnboard(a, 'en', 'stress');
    const bSubmit = await fullyOnboard(b, 'en', 'mood');

    const aDomains = aSubmit.result.selected_priorities.domains as string[];
    const bDomains = bSubmit.result.selected_priorities.domains as string[];
    expect(aDomains).toContain('stress');
    expect(aDomains).not.toContain('mood');
    expect(bDomains).toContain('mood');
    expect(bDomains).not.toContain('stress');
    // Distinct result ids — two separate owner-scoped results.
    expect(aSubmit.result_id).not.toBe(bSubmit.result_id);
  });

  it('a user cannot read or submit against another user consent (FR-029, AC-X3)', async () => {
    const a = await verifiedAccessToken('iso-consent-a@test.dev');
    const b = await verifiedAccessToken('iso-consent-b@test.dev');
    // Only A consents.
    await consent(a);
    await agent.put(`${ONB}/profile`).set(auth(a)).send({ language_code: 'en', timezone: 'UTC' });

    // B has NOT consented — B's own consent state shows no grant (never A's record).
    const bConsent = await agent.get(`${ONB}/consent`).set(auth(b));
    expect(bConsent.status).toBe(200);
    expect(bConsent.body.has_granted).toBe(false);
    // A's consent state shows a grant.
    const aConsent = await agent.get(`${ONB}/consent`).set(auth(a));
    expect(aConsent.body.has_granted).toBe(true);
    // Only one consent record exists in the store (A's); B never gained access to it.
    expect(prisma.consentStore.size).toBe(1);
  });

  // ── anti-enumeration (FR-004) ────────────────────────────────────────

  it('registration acknowledges an existing email identically to a new one (FR-004)', async () => {
    const first = await agent.post(`${AUTH}/register`).send({ email: 'enum@test.dev', password: 'password123' });
    const second = await agent.post(`${AUTH}/register`).send({ email: 'enum@test.dev', password: 'password123' });
    const other = await agent.post(`${AUTH}/register`).send({ email: 'enum-other@test.dev', password: 'password123' });
    // Same status + same acknowledgment body — no "already exists" disclosure.
    expect(second.status).toBe(first.status);
    expect(other.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    expect(other.body).toEqual(first.body);
    // Only one account row was created for the duplicate email (no second row, no leak).
    expect([...prisma.userStore.values()].filter((u) => u.email === 'enum@test.dev')).toHaveLength(1);
  });

  it('unknown-email and wrong-password logins are indistinguishable (FR-004)', async () => {
    // Register + verify a known user.
    await agent.post(`${AUTH}/register`).send({ email: 'known@test.dev', password: 'password123' });
    const captured = fakeEmail.last!;
    await agent.get(`${AUTH}/verify-email`).query({ token: captured.token, userId: captured.userId });

    const unknown = await agent.post(`${AUTH}/login`).send({ email: 'never-registered@test.dev', password: 'password123' });
    const wrongPw = await agent.post(`${AUTH}/login`).send({ email: 'known@test.dev', password: 'wrong-password' });
    // Both 401 with the identical INVALID_CREDENTIALS code — no account-existence leak.
    expect(unknown.status).toBe(401);
    expect(wrongPw.status).toBe(401);
    expect(unknown.body).toEqual(wrongPw.body);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});