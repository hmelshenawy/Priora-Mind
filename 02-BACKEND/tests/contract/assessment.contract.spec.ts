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
import { AssessmentDeletionService } from '../../src/modules/assessment/services/assessment-deletion.service';
import { EMAIL_PORT } from '../../src/modules/auth/ports/email.port';
import { FakeEmailAdapter } from '../../src/modules/auth/ports/fake-email.adapter';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';
import { NOTICE_VERSION_V1 } from '../../prisma/seed/notice-versions';
import { CURRENT_STATE_QUESTIONS } from '../../src/modules/assessment/constants/assessment-definition';

/**
 * T044 — Assessment contract (contracts/assessment.md, FR-013..FR-016, FR-018a).
 * Boots the real Auth + Profile + Assessment stack over an in-memory Prisma +
 * FakeEmailAdapter. Covers the US4 NORMAL path: definition, save/revise, restart,
 * required-question completeness, idempotent submit (one result), and the raw
 * result read. Safety routing (SQ questions / SAFETY_HOLD) and the non-diagnostic
 * presenter land in US5/US6.
 */
describe('Assessment contract (US4)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let fakeEmail: FakeEmailAdapter;
  let deletion: AssessmentDeletionService;
  let agent: ReturnType<typeof request.agent>;

  const AUTH = '/api/v1/auth';
  const ONB = '/api/v1/onboarding';
  const A = '/api/v1/assessment';
  const email = 'assessment@test.dev';
  const password = 'password123';

  async function registerAndCapture() {
    await agent.post(`${AUTH}/register`).send({ email, password });
    return fakeEmail.last!;
  }
  async function verifiedAccessToken(): Promise<string> {
    const captured = await registerAndCapture();
    await agent.get(`${AUTH}/verify-email`).query({ token: captured.token, userId: captured.userId });
    const login = await agent.post(`${AUTH}/login`).send({ email, password });
    return login.body.accessToken as string;
  }
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function grantConsent(token: string) {
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

  /** Consent + profile so the journey is at ASSESSMENT_PENDING (realistic entry). */
  async function ready(token: string) {
    await grantConsent(token);
    await agent.put(`${ONB}/profile`).set(auth(token)).send({ language_code: 'en', timezone: 'UTC' });
  }

  async function answerAll(token: string, selected: string[] = ['stress', 'mood']) {
    for (const q of CURRENT_STATE_QUESTIONS) {
      const res = await agent.put(`${A}/answers/${q.id}`).set(auth(token)).send({ value: 2 });
      expect(res.status).toBe(200);
    }
    const ag01 = await agent.put(`${A}/answers/AG-01`).set(auth(token)).send({ domains: selected });
    expect(ag01.status).toBe(200);
    const ranking: Record<string, number> = {};
    selected.forEach((d, i) => (ranking[d] = i + 1));
    const ag02 = await agent.put(`${A}/answers/AG-02`).set(auth(token)).send({ ranking });
    expect(ag02.status).toBe(200);
    const goals: Record<string, { text: string }> = {};
    selected.forEach((d) => (goals[d] = { text: `improve ${d}` }));
    const ag03 = await agent.put(`${A}/answers/AG-03`).set(auth(token)).send({ goals });
    expect(ag03.status).toBe(200);
    // US6: the three unscored safety questions close the flow (END-of-flow ordering).
    // SQ-01=S0 → SQ-02 is not triggered (shownWhen {S1,S2,SX}), so only SQ-01 + SQ-03
    // are answered. This keeps the contract on the NORMAL path (no SAFETY_HOLD).
    const sq01 = await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S0' });
    expect(sq01.status).toBe(200);
    expect(sq01.body.next_question_id).toBe('SQ-03'); // SQ-02 skipped, SQ-03 next
    const sq03 = await agent.put(`${A}/answers/SQ-03`).set(auth(token)).send({ code: 'F0' });
    expect(sq03.status).toBe(200);
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
    deletion = module.get(AssessmentDeletionService);
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

  it('GET /assessment without a token returns 401', async () => {
    const res = await agent.get(`${A}`);
    expect(res.status).toBe(401);
  });

  it('GET /assessment for an unverified user returns 403 EMAIL_NOT_VERIFIED', async () => {
    const captured = await registerAndCapture();
    const login = await agent.post(`${AUTH}/login`).send({ email, password });
    const res = await agent.get(`${A}`).set(auth(login.body.accessToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(captured.userId).toBeDefined();
  });

  it('GET /assessment before consent → 403 ONBOARDING_STEP_BLOCKED (FR-006)', async () => {
    const token = await verifiedAccessToken();
    const res = await agent.get(`${A}`).set(auth(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ONBOARDING_STEP_BLOCKED');
  });

  // ── definition ───────────────────────────────────────────────────

  it('GET /assessment/definition returns 16 current-state questions + AG goals + the three safety questions + bands', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    const res = await agent.get(`${A}/definition`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(16);
    expect(res.body.questions[0]).toMatchObject({ id: 'AS-01', domain: 'stress', polarity: 'P', required: true });
    expect(res.body.goal_questions.map((g: { id: string }) => g.id)).toEqual([
      'AG-01', 'AG-02', 'AG-03', 'AG-04', 'AG-05',
    ]);
    // US6: the three unscored safety questions (SQ-02 shown only when SQ-01 ∈ {S1,S2,SX}).
    expect(res.body.safety_questions.map((q: { id: string }) => q.id)).toEqual([
      'SQ-01', 'SQ-02', 'SQ-03',
    ]);
    expect(res.body.safety_questions[1]).toMatchObject({ id: 'SQ-02', shown_when: ['S1', 'S2', 'SX'] });
    expect(res.body.band_thresholds).toHaveLength(4);
  });

  // ── assessment view + save ───────────────────────────────────────

  it('GET /assessment creates the active assessment (NOT_STARTED) and points at the first required question (FR-013)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    const res = await agent.get(`${A}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.assessment_state).toBe('NOT_STARTED');
    expect(res.body.next_question_id).toBe('AS-01');
    expect(res.body.answered).toEqual([]);
    expect(res.body.definition_version).toBeDefined();
  });

  it('PUT /assessment/answers/AS-01 saves + advances to IN_PROGRESS + moves next_question_id (FR-014)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    const res = await agent.put(`${A}/answers/AS-01`).set(auth(token)).send({ value: 3 });
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
    expect(res.body.assessment_state).toBe('IN_PROGRESS');
    expect(res.body.next_question_id).toBe('AS-02');
    // onboarding advanced to ASSESSMENT_IN_PROGRESS
    const state = await agent.get(`${ONB}/state`).set(auth(token));
    expect(state.body.onboarding_state).toBe('ASSESSMENT_IN_PROGRESS');
    expect(state.body.assessment_state).toBe('IN_PROGRESS');
  });

  it('PUT /assessment/answers/AS-01 revises the existing answer (idempotent upsert, FR-014b)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await agent.put(`${A}/answers/AS-01`).set(auth(token)).send({ value: 3 });
    const res = await agent.put(`${A}/answers/AS-01`).set(auth(token)).send({ value: 1 });
    expect(res.status).toBe(200);
    expect(res.body.assessment_state).toBe('IN_PROGRESS');
    const view = await agent.get(`${A}`).set(auth(token));
    const a = view.body.answered.find((x: { question_id: string }) => x.question_id === 'AS-01');
    expect(a.value).toEqual({ value: 1 });
  });

  it('PUT /assessment/answers/AS-01 with an out-of-range value → 400 VALIDATION', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    const res = await agent.put(`${A}/answers/AS-01`).set(auth(token)).send({ value: 9 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('PUT /assessment/answers/unknown → 404 QUESTION_NOT_FOUND', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    const res = await agent.put(`${A}/answers/ZZ-99`).set(auth(token)).send({ value: 0 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('QUESTION_NOT_FOUND');
  });

  // ── cross-question consistency (Assessment §6) ───────────────────

  it('PUT AG-02 before AG-01 → 400 VALIDATION (cross-question order)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    const res = await agent
      .put(`${A}/answers/AG-02`)
      .set(auth(token))
      .send({ ranking: { stress: 1 } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('PUT AG-02 ranking not covering the AG-01 selection → 400 VALIDATION', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await agent.put(`${A}/answers/AG-01`).set(auth(token)).send({ domains: ['stress', 'mood'] });
    const res = await agent
      .put(`${A}/answers/AG-02`)
      .set(auth(token))
      .send({ ranking: { stress: 1, sleep: 2 } }); // sleep not selected
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  // ── restart ──────────────────────────────────────────────────────

  it('POST /assessment/restart clears saved answers (FR-014b)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await agent.put(`${A}/answers/AS-01`).set(auth(token)).send({ value: 2 });
    const res = await agent.post(`${A}/restart`).set(auth(token));
    expect(res.status).toBe(204);
    const view = await agent.get(`${A}`).set(auth(token));
    expect(view.body.answered).toEqual([]);
  });

  // ── submit: completeness + idempotency ───────────────────────────

  it('POST /assessment/submit with missing required questions → 409 INCOMPLETE with missing[] (FR-014a)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await agent.put(`${A}/answers/AS-01`).set(auth(token)).send({ value: 2 });
    const res = await agent.post(`${A}/submit`).set(auth(token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INCOMPLETE');
    expect(Array.isArray(res.body.error.missing)).toBe(true);
    expect(res.body.error.missing).toContain('AS-02');
    expect(res.body.error.missing).toContain('AG-01');
  });

  it('POST /assessment/submit after completing all required → 200 SCORED + COMPLETED + non-diagnostic insight, one result (FR-015/FR-016/FR-018/SC-002)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerAll(token);
    const res = await agent.post(`${A}/submit`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.assessment_state).toBe('SCORED');
    expect(res.body.onboarding_state).toBe('COMPLETED');
    expect(res.body.next).toBe('/assessment/result');
    expect(res.body.result_id).toBeDefined();
    // US5: the submit response carries the non-diagnostic insight inline.
    expect(res.body.result).toBeDefined();
    expect(res.body.result.domain_scores).toHaveLength(8);
    expect(res.body.result.non_diagnostic_statement.en).toMatch(/not a medical diagnosis/i);
    expect(res.body.result).not.toHaveProperty('overall_score');
    // exactly one result; onboarding COMPLETED routes to the dashboard (US9).
    expect(prisma.assessmentResultStore.size).toBe(1);
    const state = await agent.get(`${ONB}/state`).set(auth(token));
    expect(state.body.onboarding_state).toBe('COMPLETED');
    expect(state.body.assessment_state).toBe('SCORED');
    expect(state.body.next_route).toBe('/dashboard');
  });

  it('Duplicate POST /assessment/submit returns the existing insight (idempotent, FR-015)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerAll(token);
    const first = await agent.post(`${A}/submit`).set(auth(token));
    const second = await agent.post(`${A}/submit`).set(auth(token));
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.result_id).toBe(first.body.result_id);
    expect(second.body.onboarding_state).toBe('COMPLETED');
    expect(second.body.result).toBeDefined();
    expect(prisma.assessmentResultStore.size).toBe(1); // still one
  });

  // ── result ───────────────────────────────────────────────────────

  it('GET /assessment/result before submit → 404 RESULT_NOT_FOUND', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    const res = await agent.get(`${A}/result`).set(auth(token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESULT_NOT_FOUND');
  });

  it('GET /assessment/result after submit → non-diagnostic insight: 8 scores + bands + strongest/support + priorities + statement + transition; NO overall_score (FR-016/FR-017/FR-018/SC-002)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerAll(token);
    await agent.post(`${A}/submit`).set(auth(token));
    const res = await agent.get(`${A}/result`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.domain_scores).toHaveLength(8);
    expect(res.body.domain_scores[0]).toMatchObject({
      domain: expect.any(String),
      score: expect.any(Number),
      band: { label_en: expect.any(String), label_ar: expect.any(String) },
    });
    expect(res.body.strongest_domain).toEqual(expect.any(String));
    expect(res.body.support_domain).toEqual(expect.any(String));
    expect(res.body.selected_priorities.domains).toEqual(['stress', 'mood']);
    // Non-diagnostic framing (FR-017, SC-002 EN+AR parity).
    expect(res.body.non_diagnostic_statement.en).toMatch(/not a medical diagnosis/i);
    expect(res.body.non_diagnostic_statement.ar).toMatch(/ليست تشخيص/);
    expect(res.body.transition_point.en).toMatch(/future release/i);
    expect(res.body.transition_point.ar).toMatch(/إصدار لاحق/);
    // NO overall score (FR-016)
    expect(res.body).not.toHaveProperty('overall_score');
  });

  it('GET /assessment/result while SAFETY_HOLD → 409 SAFETY_HOLD, no insight (suppressed, FR-019b)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerAll(token);
    await agent.post(`${A}/submit`).set(auth(token)); // COMPLETED + result
    // US6 owns the classifier that sets SAFETY_HOLD; here we force the state to
    // test the US5 suppression guard directly (data-model §9, FR-019b).
    const userId = [...prisma.userStore.values()][0].id;
    const onb = [...prisma.onboardingStateStore.values()].find((r) => r.userId === userId)!;
    await prisma.onboardingState.update({ where: { id: onb.id }, data: { state: 'SAFETY_HOLD' } });
    const res = await agent.get(`${A}/result`).set(auth(token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SAFETY_HOLD');
    expect(res.body).not.toHaveProperty('domain_scores'); // no insight presented
  });

  it('POST /assessment/submit while SAFETY_HOLD → 409 SAFETY_HOLD, no result created (FR-019b)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerAll(token);
    const userId = [...prisma.userStore.values()][0].id;
    const onb = [...prisma.onboardingStateStore.values()].find((r) => r.userId === userId)!;
    await prisma.onboardingState.update({ where: { id: onb.id }, data: { state: 'SAFETY_HOLD' } });
    const res = await agent.post(`${A}/submit`).set(auth(token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SAFETY_HOLD');
    expect(res.body).not.toHaveProperty('result');
    expect(prisma.assessmentResultStore.size).toBe(0); // never scored/completed
  });

  it('POST /assessment/restart after SCORED → 409 RESTART_NOT_ALLOWED (no retake, FR-018a)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerAll(token);
    await agent.post(`${A}/submit`).set(auth(token));
    const res = await agent.post(`${A}/restart`).set(auth(token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESTART_NOT_ALLOWED');
  });

  // ── deletion (T052) ─────────────────────────────────────────────

  it('deleteAssessmentForUsers removes assessment + answers + result and is idempotent', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerAll(token);
    await agent.post(`${A}/submit`).set(auth(token));
    const userId = [...prisma.userStore.values()][0].id;
    expect(prisma.assessmentStore.size).toBe(1);
    expect(prisma.assessmentAnswerStore.size).toBeGreaterThan(0);
    expect(prisma.assessmentResultStore.size).toBe(1);

    const first = await deletion.deleteAssessmentForUsers([userId]);
    expect(first.deleted).toBe(1);
    expect(first.errors).toBe(0);
    expect(prisma.assessmentStore.size).toBe(0);
    expect(prisma.assessmentAnswerStore.size).toBe(0);
    expect(prisma.assessmentResultStore.size).toBe(0);

    const second = await deletion.deleteAssessmentForUsers([userId]);
    expect(second.deleted).toBe(0); // idempotent
  });

  it('deleteExpired removes only incomplete assessments (completed results retained, Consent §8)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerAll(token);
    await agent.post(`${A}/submit`).set(auth(token)); // SCORED + result

    // A second user with an incomplete (IN_PROGRESS) assessment, stale.
    const email2 = 'incomplete@test.dev';
    await agent.post(`${AUTH}/register`).send({ email: email2, password });
    const captured = fakeEmail.last!;
    await agent.get(`${AUTH}/verify-email`).query({ token: captured.token, userId: captured.userId });
    const login2 = await agent.post(`${AUTH}/login`).send({ email: email2, password });
    const t2 = login2.body.accessToken as string;
    await grantConsent(t2);
    await agent.put(`${ONB}/profile`).set(auth(t2)).send({ language_code: 'en', timezone: 'UTC' });
    await agent.put(`${A}/answers/AS-01`).set(auth(t2)).send({ value: 2 }); // IN_PROGRESS

    const cutoff = new Date('2099-01-01T00:00:00Z'); // everything is "before" this
    const res = await deletion.deleteExpired({ incompleteBefore: cutoff });
    // The SCORED assessment is retained; the IN_PROGRESS one is deleted.
    expect(prisma.assessmentResultStore.size).toBe(1); // completed result retained
    expect(res.deleted).toBe(1); // only the incomplete assessment removed
  });
});