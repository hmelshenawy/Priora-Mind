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
import { RetentionService } from '../../src/modules/retention/retention.service';
import { PROFILE_DELETION_PORT } from '../../src/modules/profile/ports/profile-deletion.port';
import { EMAIL_PORT } from '../../src/modules/auth/ports/email.port';
import { FakeEmailAdapter } from '../../src/modules/auth/ports/fake-email.adapter';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';
import { NOTICE_VERSION_V1 } from '../../prisma/seed/notice-versions';
import { CURRENT_STATE_QUESTIONS } from '../../src/modules/assessment/assessment-definition';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * T086 — Scheduled retention-cleanup (research D10, data-model §14, Consent §8).
 *
 * Invokes `RetentionService.runScheduledRetention(now)` directly (the @Cron
 * orchestrator) against the real per-module deletion ports over an in-memory
 * Prisma, and verifies the Consent §8 retention schedule:
 *  - unverified accounts expire at 7d; verified pre-consent at 30d inactivity;
 *    incomplete onboarding/assessment at 30d inactivity (boundary: strict `<`).
 *  - completed/consented data is retained while the account exists.
 *  - idempotency: a same-window re-run is a no-op (one DeletionLog row, no double
 *    delete).
 *  - per-category failure isolation: one port throwing → status `partial`, the other
 *    categories still run and delete their rows.
 *  - a sanitized DeletionLog row is written per run (counters only).
 */
describe('Scheduled retention-cleanup (e2e)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let fakeEmail: FakeEmailAdapter;
  let retention: RetentionService;
  let agent: ReturnType<typeof request.agent>;

  const AUTH = '/api/v1/auth';
  const ONB = '/api/v1/onboarding';
  const A = '/api/v1/assessment';
  // Fixed "now" so cutoffs are deterministic. Cutoffs: 7d (unverified), 30d (others).
  const NOW = new Date('2026-07-15T03:00:00Z');
  const UNVERIFIED_CUTOFF = new Date(NOW.getTime() - 7 * MS_PER_DAY);
  const INACTIVITY_CUTOFF = new Date(NOW.getTime() - 30 * MS_PER_DAY);

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function registerAndCapture(em: string) {
    await agent.post(`${AUTH}/register`).send({ email: em, password: 'password123' });
    return fakeEmail.last!;
  }
  async function verifiedAccessToken(em: string): Promise<string> {
    const captured = await registerAndCapture(em);
    await agent.get(`${AUTH}/verify-email`).query({ token: captured.token, userId: captured.userId });
    const login = await agent.post(`${AUTH}/login`).send({ email: em, password: 'password123' });
    return login.body.accessToken as string;
  }

  /** Fully onboard a user (consent → profile → all answers → submit → COMPLETED). */
  async function fullyOnboard(token: string) {
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
    await agent.put(`${ONB}/profile`).set(auth(token)).send({ language_code: 'en', timezone: 'UTC' });
    for (const q of CURRENT_STATE_QUESTIONS) {
      await agent.put(`${A}/answers/${q.id}`).set(auth(token)).send({ value: 2 });
    }
    await agent.put(`${A}/answers/AG-01`).set(auth(token)).send({ domains: ['stress'] });
    await agent.put(`${A}/answers/AG-02`).set(auth(token)).send({ ranking: { stress: 1 } });
    await agent.put(`${A}/answers/AG-03`).set(auth(token)).send({ goals: { stress: { text: 'g' } } });
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S0' });
    await agent.put(`${A}/answers/SQ-03`).set(auth(token)).send({ code: 'F0' });
    const submit = await agent.post(`${A}/submit`).set(auth(token));
    expect(submit.status).toBe(200);
  }

  /** Age every in-scope `lastActivityAt` for a user's rows to `old`. */
  function ageUser(userId: string, old: Date) {
    const u = prisma.userStore.get(userId);
    if (u) u.lastActivityAt = old;
    for (const o of prisma.onboardingStateStore.values()) if (o.userId === userId) o.lastActivityAt = old;
    for (const a of prisma.assessmentStore.values()) if (a.userId === userId) a.lastActivityAt = old;
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

    retention = module.get(RetentionService);
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

  // ── unverified accounts: 7d cutoff ──────────────────────────────────

  it('unverified account older than 7d is deleted; newer than 7d is retained (Consent §8)', async () => {
    const stale = await verifiedAccessToken('stale-unverified@test.dev');
    const staleId = [...prisma.userStore.values()].find((u) => u.email === 'stale-unverified@test.dev')!.id;
    // Re-register a second user but DO NOT verify (stays REGISTERED).
    await agent.post(`${AUTH}/register`).send({ email: 'fresh-unverified@test.dev', password: 'password123' });
    const freshId = [...prisma.userStore.values()].find((u) => u.email === 'fresh-unverified@test.dev')!.id;
    expect(prisma.userStore.get(staleId)!.status).toBe('EMAIL_VERIFIED');

    // Make a REGISTERED (unverified) account 8d old.
    prisma.userStore.get(freshId)!.status = 'REGISTERED';
    prisma.userStore.get(freshId)!.lastActivityAt = new Date(NOW.getTime() - 8 * MS_PER_DAY);
    // The verified one is also aged but will be retained (verified, has consent path? no — verified only, no consent yet)
    prisma.userStore.get(staleId)!.lastActivityAt = new Date(NOW.getTime() - 8 * MS_PER_DAY);

    await retention.runScheduledRetention(NOW);

    // The unverified 8d-old account is gone.
    expect(prisma.userStore.has(freshId)).toBe(false);
    // The verified 8d-old account is retained (within the 30d pre-consent window).
    expect(prisma.userStore.has(staleId)).toBe(true);

    const row = [...prisma.deletionLogStore.values()][0];
    expect(row.runKind).toBe('scheduled_retention');
    expect(row.status).toBe('completed');
    const counts = row.categoryCounts as { auth: { deleted: number } };
    expect(counts.auth.deleted).toBeGreaterThanOrEqual(1);
  });

  it('boundary: unverified account exactly at the 7d cutoff is NOT deleted (strict <)', async () => {
    await agent.post(`${AUTH}/register`).send({ email: 'boundary@test.dev', password: 'password123' });
    const id = [...prisma.userStore.values()].find((u) => u.email === 'boundary@test.dev')!.id;
    prisma.userStore.get(id)!.status = 'REGISTERED';
    prisma.userStore.get(id)!.lastActivityAt = UNVERIFIED_CUTOFF; // exactly at cutoff

    await retention.runScheduledRetention(NOW);
    // `lastActivityAt < cutoff` is strict → exactly-at is retained.
    expect(prisma.userStore.has(id)).toBe(true);
  });

  // ── verified pre-consent accounts: 30d cutoff, consented retained ──

  it('verified pre-consent account inactive 31d is deleted; verified+consented 31d is retained (Consent §8)', async () => {
    // Pre-consent: verified, never consented, 31d inactive.
    const preConsentToken = await verifiedAccessToken('preconsent@test.dev');
    const preConsentId = [...prisma.userStore.values()].find((u) => u.email === 'preconsent@test.dev')!.id;
    prisma.userStore.get(preConsentId)!.lastActivityAt = new Date(NOW.getTime() - 31 * MS_PER_DAY);
    expect(prisma.consentStore.size).toBe(0);

    // Consented: verified + consented, 31d inactive — must be retained.
    const consentedToken = await verifiedAccessToken('consented@test.dev');
    await fullyOnboard(consentedToken);
    const consentedId = [...prisma.userStore.values()].find((u) => u.email === 'consented@test.dev')!.id;
    ageUser(consentedId, new Date(NOW.getTime() - 31 * MS_PER_DAY));
    expect(prisma.consentStore.size).toBe(1);

    await retention.runScheduledRetention(NOW);

    expect(prisma.userStore.has(preConsentId)).toBe(false);
    expect(prisma.userStore.has(consentedId)).toBe(true);
    // Consented user's consent record + completed onboarding + result all retained.
    expect(prisma.consentStore.size).toBe(1);
    expect([...prisma.onboardingStateStore.values()].some((o) => o.userId === consentedId)).toBe(true);
    expect(prisma.assessmentResultStore.size).toBe(1);
  });

  // ── incomplete onboarding/assessment: 30d cutoff, completed retained ─

  it('incomplete onboarding state inactive 31d is deleted; COMPLETED onboarding 31d is retained (Consent §8)', async () => {
    // User A: partially onboarded (IN_PROGRESS), 31d inactive.
    const a = await verifiedAccessToken('incomplete@test.dev');
    await agent
      .post(`${ONB}/consent`)
      .set(auth(a))
      .send({
        service_boundary_version: NOTICE_VERSION_V1.serviceBoundaryVersion,
        terms_version: NOTICE_VERSION_V1.termsVersion,
        privacy_notice_version: NOTICE_VERSION_V1.privacyNoticeVersion,
        acknowledgments: { service_boundary: true, terms: true, privacy_notice: true },
        consent_language_code: 'en',
        product_channel_id: 'priora-mind-web',
      });
    await agent.put(`${ONB}/profile`).set(auth(a)).send({ language_code: 'en', timezone: 'UTC' });
    await agent.put(`${A}/answers/${CURRENT_STATE_QUESTIONS[0].id}`).set(auth(a)).send({ value: 2 });
    const aId = [...prisma.userStore.values()].find((u) => u.email === 'incomplete@test.dev')!.id;
    ageUser(aId, new Date(NOW.getTime() - 31 * MS_PER_DAY));
    const aOnboarding = [...prisma.onboardingStateStore.values()].find((o) => o.userId === aId)!;
    expect(aOnboarding.state).not.toBe('COMPLETED');

    // User B: fully onboarded (COMPLETED), 31d inactive.
    const b = await verifiedAccessToken('completed@test.dev');
    await fullyOnboard(b);
    const bId = [...prisma.userStore.values()].find((u) => u.email === 'completed@test.dev')!.id;
    ageUser(bId, new Date(NOW.getTime() - 31 * MS_PER_DAY));
    const bOnboarding = [...prisma.onboardingStateStore.values()].find((o) => o.userId === bId)!;
    expect(bOnboarding.state).toBe('COMPLETED');

    await retention.runScheduledRetention(NOW);

    // A's incomplete onboarding state is purged; B's COMPLETED state is retained.
    expect([...prisma.onboardingStateStore.values()].some((o) => o.userId === aId)).toBe(false);
    expect([...prisma.onboardingStateStore.values()].some((o) => o.userId === bId && o.state === 'COMPLETED')).toBe(true);
    // B's completed assessment (SCORED) + result are retained while the account exists.
    expect([...prisma.assessmentStore.values()].some((x) => x.userId === bId && x.state === 'SCORED')).toBe(true);
    expect(prisma.assessmentResultStore.size).toBe(1);
  });

  it('incomplete assessment inactive 31d is deleted with its answers; SCORED assessment retained (Consent §8)', async () => {
    // Incomplete assessment (IN_PROGRESS) 31d old with answers.
    const a = await verifiedAccessToken('inc-assessment@test.dev');
    await agent
      .post(`${ONB}/consent`)
      .set(auth(a))
      .send({
        service_boundary_version: NOTICE_VERSION_V1.serviceBoundaryVersion,
        terms_version: NOTICE_VERSION_V1.termsVersion,
        privacy_notice_version: NOTICE_VERSION_V1.privacyNoticeVersion,
        acknowledgments: { service_boundary: true, terms: true, privacy_notice: true },
        consent_language_code: 'en',
        product_channel_id: 'priora-mind-web',
      });
    await agent.put(`${ONB}/profile`).set(auth(a)).send({ language_code: 'en', timezone: 'UTC' });
    for (const q of CURRENT_STATE_QUESTIONS.slice(0, 3)) {
      await agent.put(`${A}/answers/${q.id}`).set(auth(a)).send({ value: 2 });
    }
    const aId = [...prisma.userStore.values()].find((u) => u.email === 'inc-assessment@test.dev')!.id;
    const aAssessment = [...prisma.assessmentStore.values()].find((x) => x.userId === aId)!;
    aAssessment.lastActivityAt = new Date(NOW.getTime() - 31 * MS_PER_DAY);
    const answerCountBefore = prisma.assessmentAnswerStore.size;
    expect(answerCountBefore).toBe(3);

    await retention.runScheduledRetention(NOW);

    // The incomplete assessment + its answers are gone.
    expect([...prisma.assessmentStore.values()].some((x) => x.userId === aId)).toBe(false);
    expect(prisma.assessmentAnswerStore.size).toBe(0);
  });

  // ── idempotency ─────────────────────────────────────────────────────

  it('re-running the same window is a no-op: one DeletionLog row, no extra deletions (idempotency)', async () => {
    await agent.post(`${AUTH}/register`).send({ email: 'idem@test.dev', password: 'password123' });
    const id = [...prisma.userStore.values()].find((u) => u.email === 'idem@test.dev')!.id;
    prisma.userStore.get(id)!.status = 'REGISTERED';
    prisma.userStore.get(id)!.lastActivityAt = new Date(NOW.getTime() - 8 * MS_PER_DAY);

    const first = await retention.runScheduledRetention(NOW);
    expect(first.status).toBe('completed');
    expect(prisma.userStore.has(id)).toBe(false);
    expect(prisma.deletionLogStore.size).toBe(1);

    // Re-run the same window — the DeletionLog row is the dedup marker.
    const second = await retention.runScheduledRetention(NOW);
    expect(second.status).toBe('completed');
    // No second DeletionLog row, no extra work.
    expect(prisma.deletionLogStore.size).toBe(1);
  });

  it('a different run window (next day) executes again and writes a new DeletionLog row', async () => {
    await agent.post(`${AUTH}/register`).send({ email: 'idem2@test.dev', password: 'password123' });
    const id = [...prisma.userStore.values()].find((u) => u.email === 'idem2@test.dev')!.id;
    prisma.userStore.get(id)!.status = 'REGISTERED';
    prisma.userStore.get(id)!.lastActivityAt = new Date(NOW.getTime() - 8 * MS_PER_DAY);

    await retention.runScheduledRetention(NOW);
    expect(prisma.deletionLogStore.size).toBe(1);

    // A second unverified account for the next-day window.
    await agent.post(`${AUTH}/register`).send({ email: 'idem3@test.dev', password: 'password123' });
    const id3 = [...prisma.userStore.values()].find((u) => u.email === 'idem3@test.dev')!.id;
    prisma.userStore.get(id3)!.status = 'REGISTERED';
    prisma.userStore.get(id3)!.lastActivityAt = new Date(NOW.getTime() - 8 * MS_PER_DAY);

    const nextDay = new Date(NOW.getTime() + MS_PER_DAY);
    await retention.runScheduledRetention(nextDay);
    expect(prisma.deletionLogStore.size).toBe(2);
    expect(prisma.userStore.has(id3)).toBe(false);
  });

  // ── per-category failure isolation ──────────────────────────────────

  it('a failing category is counted as partial; the other categories still run and delete their rows (research D10)', async () => {
    // Build a separate app where PROFILE_DELETION_PORT throws on deleteExpired.
    const localPrisma = new InMemoryPrisma();
    localPrisma.noticeVersionSet.create({
      data: { ...NOTICE_VERSION_V1, publishedAt: new Date('2026-01-01T00:00:00Z') },
    });
    const localEmail = new FakeEmailAdapter();
    const failingProfilePort = {
      deleteExpired: async (): Promise<{ deleted: number; errors: number }> => {
        throw new Error('profile-deletion-boom');
      },
      deleteProfileForUsers: async (): Promise<{ deleted: number; errors: number }> => ({ deleted: 0, errors: 0 }),
    };
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
      .useValue(localPrisma)
      .overrideProvider(EMAIL_PORT)
      .useValue(localEmail)
      .overrideProvider(PROFILE_DELETION_PORT)
      .useValue(failingProfilePort)
      .compile();
    const localRetention = module.get(RetentionService);
    const localApp = module.createNestApplication();
    localApp.use(cookieParser());
    localApp.setGlobalPrefix('api/v1');
    localApp.useGlobalFilters(new AllExceptionsFilter());
    await localApp.init();
    const localAgent = request.agent(localApp.getHttpServer());

    try {
      // Seed: an unverified account 8d old (auth category will delete it) + an
      // incomplete onboarding state 31d old (profile category will FAIL).
      await localAgent.post(`${AUTH}/register`).send({ email: 'fail-auth@test.dev', password: 'password123' });
      const authId = [...localPrisma.userStore.values()].find((u) => u.email === 'fail-auth@test.dev')!.id;
      localPrisma.userStore.get(authId)!.status = 'REGISTERED';
      localPrisma.userStore.get(authId)!.lastActivityAt = new Date(NOW.getTime() - 8 * MS_PER_DAY);

      const t = await verifiedTokenLocal(localAgent, localEmail, 'fail-profile@test.dev');
      await localAgent
        .post(`${ONB}/consent`)
        .set({ Authorization: `Bearer ${t}` })
        .send({
          service_boundary_version: NOTICE_VERSION_V1.serviceBoundaryVersion,
          terms_version: NOTICE_VERSION_V1.termsVersion,
          privacy_notice_version: NOTICE_VERSION_V1.privacyNoticeVersion,
          acknowledgments: { service_boundary: true, terms: true, privacy_notice: true },
          consent_language_code: 'en',
          product_channel_id: 'priora-mind-web',
        });
      await localAgent.put(`${ONB}/profile`).set({ Authorization: `Bearer ${t}` }).send({ language_code: 'en', timezone: 'UTC' });
      const profId = [...localPrisma.userStore.values()].find((u) => u.email === 'fail-profile@test.dev')!.id;
      for (const o of localPrisma.onboardingStateStore.values()) if (o.userId === profId) o.lastActivityAt = new Date(NOW.getTime() - 31 * MS_PER_DAY);

      const outcome = await localRetention.runScheduledRetention(NOW);
      // Profile category failed → status partial.
      expect(outcome.status).toBe('partial');
      // The auth category still ran and deleted the unverified account.
      expect(localPrisma.userStore.has(authId)).toBe(false);
      // A DeletionLog row was still written.
      expect(localPrisma.deletionLogStore.size).toBe(1);
      const row = [...localPrisma.deletionLogStore.values()][0];
      expect(row.status).toBe('partial');
    } finally {
      await localApp.close();
    }
  });
});

async function verifiedTokenLocal(
  agent: ReturnType<typeof request.agent>,
  fakeEmail: FakeEmailAdapter,
  em: string,
): Promise<string> {
  await agent.post('/api/v1/auth/register').send({ email: em, password: 'password123' });
  const captured = fakeEmail.last!;
  await agent.get('/api/v1/auth/verify-email').query({ token: captured.token, userId: captured.userId });
  const login = await agent.post('/api/v1/auth/login').send({ email: em, password: 'password123' });
  return login.body.accessToken as string;
}