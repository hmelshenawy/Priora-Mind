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
import { SAFETY_DELETION_PORT } from '../../src/modules/safety/ports/safety-deletion.port';
import { EMAIL_PORT } from '../../src/modules/auth/ports/email.port';
import { FakeEmailAdapter } from '../../src/modules/auth/ports/fake-email.adapter';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';
import { NOTICE_VERSION_V1 } from '../../prisma/seed/notice-versions';
import { CURRENT_STATE_QUESTIONS } from '../../src/modules/assessment/assessment-definition';

/**
 * T087 — User-initiated account deletion (Consent §9, FR-031). DELETE /me/account
 * is the only surface. Verifies:
 *  - authenticated only (401 without token).
 *  - full deletion: every in-scope store (profile, preferences, onboarding, assessment,
 *    answers, result, safety history, consent, account row) is removed; response is
 *    { confirmation_id, status: 'completed', completed: true }.
 *  - idempotency: a re-request for an already-deleted account is a no-op returning
 *    completed (Consent §12).
 *  - no completion until all stores confirm: a failing category → status 'partial',
 *    completed: false, the account row is KEPT (deletedAt set, access disabled) and
 *    the user is NOT told deletion is complete.
 *  - blocks new processing on acceptance: once deletedAt is set, a fresh login is
 *    rejected (Consent §9).
 *  - a retry safely continues deleting remaining rows and then completes.
 */
describe('User-initiated account deletion (e2e)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let fakeEmail: FakeEmailAdapter;
  let agent: ReturnType<typeof request.agent>;

  const AUTH = '/api/v1/auth';
  const ONB = '/api/v1/onboarding';
  const A = '/api/v1/assessment';
  const ME = '/api/v1/me/account';

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

  function userIdOf(em: string): string {
    return [...prisma.userStore.values()].find((u) => u.email === em)!.id;
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

  // ── auth gate ────────────────────────────────────────────────────────

  it('DELETE /me/account requires authentication (401 without token)', async () => {
    const res = await agent.delete(ME);
    expect(res.status).toBe(401);
  });

  // ── full deletion ────────────────────────────────────────────────────

  it('full deletion removes every in-scope store and returns completed (Consent §9, FR-031)', async () => {
    const token = await verifiedAccessToken('delete-full@test.dev');
    await fullyOnboard(token);
    const id = userIdOf('delete-full@test.dev');

    // Sanity: all stores populated before deletion.
    expect(prisma.userStore.has(id)).toBe(true);
    expect([...prisma.consentStore.values()].some((c) => c.userId === id)).toBe(true);
    expect([...prisma.profileStore.values()].some((p) => p.userId === id)).toBe(true);
    expect([...prisma.preferencesStore.values()].some((p) => p.userId === id)).toBe(true);
    expect([...prisma.onboardingStateStore.values()].some((o) => o.userId === id)).toBe(true);
    expect([...prisma.assessmentStore.values()].some((a) => a.userId === id)).toBe(true);
    expect(prisma.assessmentAnswerStore.size).toBeGreaterThan(0);
    expect([...prisma.assessmentResultStore.values()].some((r) => r.userId === id)).toBe(true);
    expect([...prisma.safetyEvaluationStore.values()].some((e) => e.userId === id)).toBe(true);

    const res = await agent.delete(ME).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.completed).toBe(true);
    expect(res.body.confirmation_id).toContain('account:');

    // Every in-scope store for this user is gone.
    expect(prisma.userStore.has(id)).toBe(false);
    expect([...prisma.consentStore.values()].some((c) => c.userId === id)).toBe(false);
    expect([...prisma.profileStore.values()].some((p) => p.userId === id)).toBe(false);
    expect([...prisma.preferencesStore.values()].some((p) => p.userId === id)).toBe(false);
    expect([...prisma.onboardingStateStore.values()].some((o) => o.userId === id)).toBe(false);
    expect([...prisma.assessmentStore.values()].some((a) => a.userId === id)).toBe(false);
    expect(prisma.assessmentAnswerStore.size).toBe(0);
    expect([...prisma.assessmentResultStore.values()].some((r) => r.userId === id)).toBe(false);
    expect([...prisma.safetyEvaluationStore.values()].some((e) => e.userId === id)).toBe(false);

    // A sanitized DeletionLog row was written.
    const row = [...prisma.deletionLogStore.values()][0];
    expect(row.runKind).toBe('account_deletion');
    expect(row.status).toBe('completed');
  });

  // ── idempotency ──────────────────────────────────────────────────────

  it('re-requesting deletion for an already-deleted account is a no-op returning completed (Consent §12)', async () => {
    const token = await verifiedAccessToken('delete-idem@test.dev');
    await fullyOnboard(token);

    const first = await agent.delete(ME).set(auth(token));
    expect(first.body.completed).toBe(true);
    const logsAfterFirst = prisma.deletionLogStore.size;

    // The access token is still valid (JWT) even though the account row is gone,
    // so the second request reaches the service and short-circuits to completed.
    const second = await agent.delete(ME).set(auth(token));
    expect(second.status).toBe(200);
    expect(second.body.completed).toBe(true);
    expect(second.body.status).toBe('completed');
    // No second DeletionLog row (the account was already fully gone → no-op).
    expect(prisma.deletionLogStore.size).toBe(logsAfterFirst);
  });

  // ── partial failure: no false completion, access disabled, retry completes ─

  it('partial failure → status partial, completed false, account kept with deletedAt set; login is rejected (Consent §9/§12)', async () => {
    // Build a local app whose SAFETY_DELETION_PORT throws on the FIRST call only,
    // so a retry succeeds and the flow converges to completed.
    const localPrisma = new InMemoryPrisma();
    localPrisma.noticeVersionSet.create({
      data: { ...NOTICE_VERSION_V1, publishedAt: new Date('2026-01-01T00:00:00Z') },
    });
    const localEmail = new FakeEmailAdapter();
    let safetyCalls = 0;
    const flakySafetyPort = {
      deleteExpired: async (): Promise<{ deleted: number; errors: number }> => ({ deleted: 0, errors: 0 }),
      deleteSafetyForUsers: async (userIds: string[]): Promise<{ deleted: number; errors: number }> => {
        safetyCalls += 1;
        if (safetyCalls === 1) throw new Error('safety-deletion-boom');
        // Second call succeeds: delete the user's safety evaluations.
        const r = await localPrisma.safetyEvaluation.deleteMany({ where: { userId: { in: userIds } } });
        return { deleted: r.count, errors: 0 };
      },
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
      .overrideProvider(SAFETY_DELETION_PORT)
      .useValue(flakySafetyPort)
      .compile();
    const localApp = module.createNestApplication();
    localApp.use(cookieParser());
    localApp.setGlobalPrefix('api/v1');
    localApp.useGlobalFilters(new AllExceptionsFilter());
    await localApp.init();
    const localAgent = request.agent(localApp.getHttpServer());

    try {
      const token = await verifiedTokenLocal(localAgent, localEmail, 'partial@test.dev');
      await fullyOnboardLocal(localAgent, token);
      const id = [...localPrisma.userStore.values()].find((u) => u.email === 'partial@test.dev')!.id;

      const first = await localAgent.delete(ME).set({ Authorization: `Bearer ${token}` });
      expect(first.status).toBe(200);
      expect(first.body.status).toBe('partial');
      expect(first.body.completed).toBe(false);

      // Account is KEPT (partial — no false completion), but deletedAt is set so new
      // processing is blocked.
      expect(localPrisma.userStore.has(id)).toBe(true);
      expect(localPrisma.userStore.get(id)!.deletedAt).not.toBeNull();
      // Safety history survives the failed category; assessment/profile/consent were
      // already removed (they ran before safety failed).
      expect([...localPrisma.safetyEvaluationStore.values()].some((e) => e.userId === id)).toBe(true);
      expect([...localPrisma.assessmentStore.values()].some((a) => a.userId === id)).toBe(false);
      expect([...localPrisma.consentStore.values()].some((c) => c.userId === id)).toBe(false);

      // Blocks new processing: a fresh login is rejected because deletedAt is set.
      const login = await localAgent.post(`${AUTH}/login`).send({ email: 'partial@test.dev', password: 'password123' });
      expect(login.status).toBe(401);

      // A retry safely continues: safety now succeeds, then the account is hard-deleted.
      const second = await localAgent.delete(ME).set({ Authorization: `Bearer ${token}` });
      expect(second.status).toBe(200);
      expect(second.body.status).toBe('completed');
      expect(second.body.completed).toBe(true);
      expect(localPrisma.userStore.has(id)).toBe(false);
      expect([...localPrisma.safetyEvaluationStore.values()].some((e) => e.userId === id)).toBe(false);
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

async function fullyOnboardLocal(agent: ReturnType<typeof request.agent>, token: string): Promise<void> {
  const at = { Authorization: `Bearer ${token}` };
  await agent
    .post('/api/v1/onboarding/consent')
    .set(at)
    .send({
      service_boundary_version: NOTICE_VERSION_V1.serviceBoundaryVersion,
      terms_version: NOTICE_VERSION_V1.termsVersion,
      privacy_notice_version: NOTICE_VERSION_V1.privacyNoticeVersion,
      acknowledgments: { service_boundary: true, terms: true, privacy_notice: true },
      consent_language_code: 'en',
      product_channel_id: 'priora-mind-web',
    });
  await agent.put('/api/v1/onboarding/profile').set(at).send({ language_code: 'en', timezone: 'UTC' });
  for (const q of CURRENT_STATE_QUESTIONS) {
    await agent.put(`/api/v1/assessment/answers/${q.id}`).set(at).send({ value: 2 });
  }
  await agent.put('/api/v1/assessment/answers/AG-01').set(at).send({ domains: ['stress'] });
  await agent.put('/api/v1/assessment/answers/AG-02').set(at).send({ ranking: { stress: 1 } });
  await agent.put('/api/v1/assessment/answers/AG-03').set(at).send({ goals: { stress: { text: 'g' } } });
  await agent.put('/api/v1/assessment/answers/SQ-01').set(at).send({ code: 'S0' });
  await agent.put('/api/v1/assessment/answers/SQ-03').set(at).send({ code: 'F0' });
  const submit = await agent.post('/api/v1/assessment/submit').set(at);
  expect(submit.status).toBe(200);
}