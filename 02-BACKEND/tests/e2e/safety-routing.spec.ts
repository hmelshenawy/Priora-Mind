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
import { EMAIL_PORT } from '../../src/modules/auth/ports/email.port';
import { FakeEmailAdapter } from '../../src/modules/auth/ports/fake-email.adapter';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';
import { NOTICE_VERSION_V1 } from '../../prisma/seed/notice-versions';
import { CURRENT_STATE_QUESTIONS } from '../../src/modules/assessment/assessment-definition';

/**
 * T061 — Safety routing e2e (FR-019a/FR-019b/FR-023/FR-025, Safety Matrix §4/§6/§9).
 * End-to-end journey over the real Auth + Profile + Assessment + Safety HTTP stack
 * (in-memory Prisma, no external DB). Proves the safety lifecycle integrates across
 * modules: a per-answer HIGH_RISK/CRISIS evaluation triggers SAFETY_HOLD, the
 * assessment is never scored while held, and user-initiated re-entry resumes the
 * suspended assessment so the NORMAL path can complete. Deterministic — no AI.
 */
describe('Safety routing (US6 e2e)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let fakeEmail: FakeEmailAdapter;
  let agent: ReturnType<typeof request.agent>;

  const AUTH = '/api/v1/auth';
  const ONB = '/api/v1/onboarding';
  const A = '/api/v1/assessment';
  const S = '/api/v1/safety';

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

  /** 16 current-state (mid-scale) + AG-01/02/03, leaving the flow at SQ-01. */
  async function answerCoaching(token: string, selected: string[] = ['stress', 'mood']) {
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

  it('CRISIS per-answer → SAFETY_HOLD; submit + result suppressed; never SCORED; re-entry NORMAL resumes and completes (FR-019a/FR-019b/FR-023)', async () => {
    const token = await verifiedAccessToken('crisis@test.dev');
    await ready(token);
    await answerCoaching(token);

    // Per-answer CRISIS interrupts immediately.
    const sq = await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S2' });
    expect(sq.status).toBe(200);
    expect(sq.body.safety_route.level).toBe('CRISIS');
    expect(sq.body.next_question_id).toBe(null);

    // Onboarding is held; the onboarding/state routing hint reports SUSPENDED for
    // SAFETY_HOLD, while the raw assessment stays interrupted in place (IN_PROGRESS,
    // observable via GET /assessment) — CRISIS never reaches SUBMITTED/SCORED.
    const state = await agent.get(`${ONB}/state`).set(auth(token));
    expect(state.body.onboarding_state).toBe('SAFETY_HOLD');
    expect(state.body.assessment_state).toBe('SUSPENDED'); // routing hint for SAFETY_HOLD
    const held = await agent.get(`${A}`).set(auth(token));
    expect(held.body.assessment_state).toBe('IN_PROGRESS'); // raw DB state (interrupted)

    // Submit is suppressed (409) — CRISIS never reaches SUBMITTED/SCORED.
    const submit = await agent.post(`${A}/submit`).set(auth(token));
    expect(submit.status).toBe(409);
    expect(submit.body.error.code).toBe('SAFETY_HOLD');
    expect(prisma.assessmentResultStore.size).toBe(0);
    const result = await agent.get(`${A}/result`).set(auth(token));
    expect(result.status).toBe(409);

    // User-initiated re-entry with fresh NORMAL answers resumes the assessment.
    const reentry = await agent
      .post(`${S}/reentry`)
      .set(auth(token))
      .send({ re_evaluate: true, safety_answers: { 'SQ-01': 'S0', 'SQ-03': 'F0' } });
    expect(reentry.status).toBe(200);
    expect(reentry.body.onboarding_state).toBe('ASSESSMENT_IN_PROGRESS');
    expect(reentry.body.next).toBe('/assessment');

    // The resumed assessment retains its coaching answers. Re-entry authorizes resume
    // but does NOT rewrite the stored SQ answers, so the user re-answers the safety set
    // (overwriting the triggering S2) before the final gating submit.
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S0' });
    await agent.put(`${A}/answers/SQ-03`).set(auth(token)).send({ code: 'F0' });
    const finalSubmit = await agent.post(`${A}/submit`).set(auth(token));
    expect(finalSubmit.status).toBe(200);
    expect(finalSubmit.body.assessment_state).toBe('SCORED');
    expect(finalSubmit.body.onboarding_state).toBe('COMPLETED');
    expect(prisma.assessmentResultStore.size).toBe(1);
  });

  it('HIGH_RISK per-answer → assessment SUSPENDED (answers retained) + SAFETY_HOLD; re-entry resumes SUSPENDED→IN_PROGRESS and completes (Safety §6/§9)', async () => {
    const token = await verifiedAccessToken('highrisk@test.dev');
    await ready(token);
    await answerCoaching(token);

    // SQ-01=S1 alone is an intermediate state (SQ-02 shown, no route yet).
    const sq01 = await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S1' });
    expect(sq01.status).toBe(200);
    expect(sq01.body.safety_route).toBeUndefined();
    expect(sq01.body.next_question_id).toBe('SQ-02');

    // SQ-02=D0 → HIGH_RISK: assessment SUSPENDED, onboarding SAFETY_HOLD, resume_available=true.
    const sq02 = await agent.put(`${A}/answers/SQ-02`).set(auth(token)).send({ code: 'D0' });
    expect(sq02.body.safety_route.level).toBe('HIGH_RISK');
    expect(sq02.body.safety_route.assessment_state).toBe('SUSPENDED');
    expect(sq02.body.safety_route.resume_available).toBe(true);
    const view = await agent.get(`${A}`).set(auth(token));
    expect(view.body.assessment_state).toBe('SUSPENDED');
    expect(view.body.safety_route.level).toBe('HIGH_RISK');

    // Re-entry resumes; the suspended assessment returns to IN_PROGRESS.
    const reentry = await agent
      .post(`${S}/reentry`)
      .set(auth(token))
      .send({ re_evaluate: true, safety_answers: { 'SQ-01': 'S0', 'SQ-03': 'F0' } });
    expect(reentry.status).toBe(200);
    expect(reentry.body.assessment_state).toBe('IN_PROGRESS');
    const resumed = await agent.get(`${A}`).set(auth(token));
    expect(resumed.body.assessment_state).toBe('IN_PROGRESS');
    expect(resumed.body.safety_route).toBeUndefined();

    // Complete the safety set on the resumed NORMAL path: re-answer SQ-01 (overwriting
    // the triggering S1) + SQ-03, then submit. The stored SQ-02=D0 stays but is harmless
    // once SQ-01=S0 (no S-rule fires; highest-risk-wins leaves it NORMAL).
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S0' });
    await agent.put(`${A}/answers/SQ-03`).set(auth(token)).send({ code: 'F0' });
    const finalSubmit = await agent.post(`${A}/submit`).set(auth(token));
    expect(finalSubmit.status).toBe(200);
    expect(finalSubmit.body.assessment_state).toBe('SCORED');
    expect(prisma.assessmentResultStore.size).toBe(1);
  });

  it('CRISIS re-entry (S2) keeps SAFETY_HOLD; no auto-resume, no result (Safety §6/§9)', async () => {
    const token = await verifiedAccessToken('crisis-reentry@test.dev');
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S2' }); // CRISIS hold

    const reentry = await agent
      .post(`${S}/reentry`)
      .set(auth(token))
      .send({ re_evaluate: true, safety_answers: { 'SQ-01': 'S2', 'SQ-02': 'D0', 'SQ-03': 'F0' } });
    expect(reentry.status).toBe(200);
    expect(reentry.body.onboarding_state).toBe('SAFETY_HOLD');
    expect(reentry.body.level).toBe('CRISIS');
    expect(reentry.body.safety_route.resume_available).toBe(false);

    // Still held → submit stays suppressed.
    const submit = await agent.post(`${A}/submit`).set(auth(token));
    expect(submit.status).toBe(409);
    expect(prisma.assessmentResultStore.size).toBe(0);
  });

  it('NORMAL path (SQ-01=S0, SQ-03=F0) never enters SAFETY_HOLD and completes (FR-019a NORMAL)', async () => {
    const token = await verifiedAccessToken('normal@test.dev');
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S0' });
    await agent.put(`${A}/answers/SQ-03`).set(auth(token)).send({ code: 'F0' });
    const state = await agent.get(`${ONB}/state`).set(auth(token));
    expect(state.body.onboarding_state).toBe('ASSESSMENT_IN_PROGRESS');
    const submit = await agent.post(`${A}/submit`).set(auth(token));
    expect(submit.status).toBe(200);
    expect(submit.body.assessment_state).toBe('SCORED');
    expect(prisma.safetyEvaluationStore.size).toBe(1); // only the on-submit gating eval
  });
});