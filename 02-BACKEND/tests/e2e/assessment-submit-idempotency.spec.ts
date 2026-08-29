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
import { EMAIL_PORT } from '../../src/modules/auth/ports/email.port';
import { FakeEmailAdapter } from '../../src/modules/auth/ports/fake-email.adapter';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';
import { NOTICE_VERSION_V1 } from '../../prisma/seed/notice-versions';
import { CURRENT_STATE_QUESTIONS } from '../../src/modules/assessment/constants/assessment-definition';

/**
 * T045 — Assessment submit idempotency (FR-015, FR-034, AC-X4, SC-003). Boots the
 * real Auth + Profile + Assessment stack over an in-memory Prisma (the project's
 * integration-test fixture; no external DB). Verifies that double + near-concurrent
 * submissions of the same complete assessment produce exactly ONE AssessmentResult
 * (idempotent conditional transition + unique result on assessment_id, research D6),
 * and that independent users get independent results.
 */
describe('Assessment submit idempotency (US4 e2e)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let fakeEmail: FakeEmailAdapter;
  let agent: ReturnType<typeof request.agent>;

  const AUTH = '/api/v1/auth';
  const ONB = '/api/v1/onboarding';
  const A = '/api/v1/assessment';

  async function registerAndCapture(em: string) {
    await agent.post(`${AUTH}/register`).send({ email: em, password: 'password123' });
    return fakeEmail.last!;
  }
  async function verifiedAccessToken(em: string): Promise<string> {
    const captured = await registerAndCapture(em);
    await agent
      .get(`${AUTH}/verify-email`)
      .query({ token: captured.token, userId: captured.userId });
    const login = await agent.post(`${AUTH}/login`).send({ email: em, password: 'password123' });
    return login.body.accessToken as string;
  }
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function ready(token: string) {
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
  }

  async function answerAll(token: string, selected: string[] = ['stress', 'mood']) {
    for (const q of CURRENT_STATE_QUESTIONS) {
      await agent.put(`${A}/answers/${q.id}`).set(auth(token)).send({ value: 2 });
    }
    await agent.put(`${A}/answers/AG-01`).set(auth(token)).send({ domains: selected });
    const ranking: Record<string, number> = {};
    selected.forEach((d, i) => (ranking[d] = i + 1));
    await agent.put(`${A}/answers/AG-02`).set(auth(token)).send({ ranking });
    const goals: Record<string, { text: string }> = {};
    selected.forEach((d) => (goals[d] = { text: `improve ${d}` }));
    await agent.put(`${A}/answers/AG-03`).set(auth(token)).send({ goals });
    // US6: SQ-01=S0 (SQ-02 not triggered) + SQ-03=F0 — NORMAL path, no SAFETY_HOLD.
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S0' });
    await agent.put(`${A}/answers/SQ-03`).set(auth(token)).send({ code: 'F0' });
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

  it('double submit (sequential) yields exactly one AssessmentResult with the same result_id (FR-015)', async () => {
    const token = await verifiedAccessToken('idem1@test.dev');
    await ready(token);
    await answerAll(token);

    const first = await agent.post(`${A}/submit`).set(auth(token));
    expect(first.status).toBe(200);
    const second = await agent.post(`${A}/submit`).set(auth(token));
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.result_id).toBe(first.body.result_id);
    expect(prisma.assessmentResultStore.size).toBe(1);
    expect(prisma.assessmentStore.size).toBe(1);
  });

  it('near-concurrent submit (Promise.all) yields one result; both responses reference it (AC-X4, SC-003)', async () => {
    const token = await verifiedAccessToken('idem2@test.dev');
    await ready(token);
    await answerAll(token);

    const [a, b] = await Promise.all([
      agent.post(`${A}/submit`).set(auth(token)),
      agent.post(`${A}/submit`).set(auth(token)),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // Exactly one result row; both responses agree on the result_id.
    expect(prisma.assessmentResultStore.size).toBe(1);
    const ids = new Set([a.body.result_id, b.body.result_id]);
    expect(ids.size).toBe(1);
  });

  it('submit after a partial restart (clear then re-complete) produces a fresh single result (FR-034)', async () => {
    const token = await verifiedAccessToken('idem3@test.dev');
    await ready(token);
    await answerAll(token);
    const first = await agent.post(`${A}/submit`).set(auth(token));
    expect(first.status).toBe(200);
    // Restart is blocked once SCORED (no retake, FR-018a).
    const restart = await agent.post(`${A}/restart`).set(auth(token));
    expect(restart.status).toBe(409);
    expect(prisma.assessmentResultStore.size).toBe(1);
  });

  it('independent users produce independent results (no cross-user leakage, FR-027)', async () => {
    const t1 = await verifiedAccessToken('idem4@test.dev');
    await ready(t1);
    await answerAll(t1, ['stress', 'mood']);
    const r1 = await agent.post(`${A}/submit`).set(auth(t1));

    const t2 = await verifiedAccessToken('idem5@test.dev');
    await ready(t2);
    await answerAll(t2, ['focus', 'energy']);
    const r2 = await agent.post(`${A}/submit`).set(auth(t2));

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.result_id).not.toBe(r2.body.result_id);
    expect(prisma.assessmentResultStore.size).toBe(2);
    expect(prisma.assessmentStore.size).toBe(2);

    // Each user reads only their own result.
    const mine1 = await agent.get(`${A}/result`).set(auth(t1));
    const mine2 = await agent.get(`${A}/result`).set(auth(t2));
    expect(mine1.body.result_id).toBe(r1.body.result_id);
    expect(mine2.body.result_id).toBe(r2.body.result_id);
  });
});