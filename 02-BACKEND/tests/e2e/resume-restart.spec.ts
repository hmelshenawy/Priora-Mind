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
import {
  CURRENT_STATE_QUESTIONS,
  REQUIRED_COACHING_IDS,
} from '../../src/modules/assessment/assessment-definition';

/**
 * T075 — US8 resume / restart / safe-restart (FR-014, FR-014b, FR-034, SC-007).
 *
 * Boots the real Auth + Profile + Assessment stack over an in-memory Prisma (the
 * project's integration-test fixture; no external DB). Verifies the three US8
 * acceptance scenarios through the real service + controller code paths:
 *
 *  1. Resume: an interrupted user lands on the last saved answer — GET /assessment
 *     returns the next unanswered required question + the saved answers, so the
 *     wizard resumes at the correct unfinished step (FR-014/FR-033).
 *  2. Restart clears: POST /assessment/restart clears answers and re-anchors the
 *     assessment to the current definition WITHOUT creating a duplicate
 *     Assessment row; a subsequent submit yields exactly one result (FR-034).
 *  3. Corrupt progress → safe restart: when the active assessment's definition
 *     version no longer matches the current definition (retired definition + saved
 *     answers = inconsistent progress), the system offers a safe restart and
 *     NEVER presents a partial result as complete — GET /assessment surfaces
 *     `requires_safe_restart`, no stale answers, no next question; GET /assessment/
 *     result is 404; POST /assessment/submit fails closed (409). After restart
 *     re-anchors the definition version, a full submit produces a single result on
 *     the current definition (FR-014b, SC-007).
 */
describe('US8 resume / restart / safe-restart (e2e)', () => {
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

  // ── 1. resume from the last saved answer ──────────────────────────

  it('resume: GET /assessment returns the next unanswered required question + saved answers (FR-014/FR-033)', async () => {
    const token = await verifiedAccessToken('resume1@test.dev');
    await ready(token);

    // Answer only the first three current-state questions, then stop (interrupted).
    const answeredIds = CURRENT_STATE_QUESTIONS.slice(0, 3).map((q) => q.id);
    for (const id of answeredIds) {
      await agent.put(`${A}/answers/${id}`).set(auth(token)).send({ value: 2 });
    }

    const res = await agent.get(`${A}`).set(auth(token));
    expect(res.status).toBe(200);
    // The next unanswered required question is the 4th current-state question.
    expect(res.body.next_question_id).toBe(CURRENT_STATE_QUESTIONS[3].id);
    // The three saved answers are returned so the wizard can rehydrate drafts.
    const savedIds = res.body.answered.map((a: { question_id: string }) => a.question_id);
    expect(savedIds).toEqual(answeredIds);
    // No safe-restart on a healthy resume.
    expect(res.body.requires_safe_restart).toBeUndefined();
    // Exactly one Assessment row for this user (no duplicates from resuming).
    expect(prisma.assessmentStore.size).toBe(1);
  });

  it('resume: continuing answers advances next_question_id to the next missing required question', async () => {
    const token = await verifiedAccessToken('resume2@test.dev');
    await ready(token);

    // Answer all 16 current-state questions but stop before the goal questions.
    for (const q of CURRENT_STATE_QUESTIONS) {
      await agent.put(`${A}/answers/${q.id}`).set(auth(token)).send({ value: 2 });
    }
    const mid = await agent.get(`${A}`).set(auth(token));
    // Next required unanswered is AG-01 (first goal question after current-state).
    expect(mid.body.next_question_id).toBe('AG-01');

    // Answer AG-01 + AG-02 + AG-03 (interrupted again), then resume.
    await agent.put(`${A}/answers/AG-01`).set(auth(token)).send({ domains: ['stress', 'mood'] });
    await agent
      .put(`${A}/answers/AG-02`)
      .set(auth(token))
      .send({ ranking: { stress: 1, mood: 2 } });
    await agent
      .put(`${A}/answers/AG-03`)
      .set(auth(token))
      .send({ goals: { stress: { text: 'a' }, mood: { text: 'b' } } });

    const resumed = await agent.get(`${A}`).set(auth(token));
    // SQ-01 is the next required unanswered (SQ-02 is gated on SQ-01; SQ-03 last).
    expect(resumed.body.next_question_id).toBe('SQ-01');
  });

  // ── 2. restart clears (no duplicate assessment) ───────────────────

  it('restart clears answers and re-anchors the definition WITHOUT creating a duplicate assessment (FR-034)', async () => {
    const token = await verifiedAccessToken('restart1@test.dev');
    await ready(token);
    // Partial answers (interrupted), then the user chooses to start over.
    for (const q of CURRENT_STATE_QUESTIONS.slice(0, 5)) {
      await agent.put(`${A}/answers/${q.id}`).set(auth(token)).send({ value: 2 });
    }
    expect(prisma.assessmentAnswerStore.size).toBe(5);

    const restart = await agent.post(`${A}/restart`).set(auth(token));
    expect(restart.status).toBe(204);
    // No duplicate Assessment row — restart reuses the single active assessment.
    expect(prisma.assessmentStore.size).toBe(1);
    // Answers cleared.
    expect(prisma.assessmentAnswerStore.size).toBe(0);
    // The assessment is back to IN_PROGRESS on the current definition.
    const row = [...prisma.assessmentStore.values()][0];
    expect(row.state).toBe('IN_PROGRESS');
    expect(row.definitionVersion).toBe('assessment-1.0');
  });

  it('restart then full submit yields exactly one result on the current definition (FR-034)', async () => {
    const token = await verifiedAccessToken('restart2@test.dev');
    await ready(token);
    for (const q of CURRENT_STATE_QUESTIONS.slice(0, 4)) {
      await agent.put(`${A}/answers/${q.id}`).set(auth(token)).send({ value: 2 });
    }
    await agent.post(`${A}/restart`).set(auth(token));

    // No stale answers remain after restart.
    const after = await agent.get(`${A}`).set(auth(token));
    expect(after.body.answered).toEqual([]);
    expect(after.body.requires_safe_restart).toBeUndefined();

    await answerAll(token);
    const submit = await agent.post(`${A}/submit`).set(auth(token));
    expect(submit.status).toBe(200);
    expect(prisma.assessmentResultStore.size).toBe(1);
    expect(prisma.assessmentStore.size).toBe(1);
    expect(submit.body.result.definition_version).toBe('assessment-1.0');
  });

  // ── 3. corrupt progress → safe restart, no partial result as complete ─

  it('corrupt progress: stale definition + saved answers → requires_safe_restart, no stale answers surfaced (FR-014b, SC-007)', async () => {
    const token = await verifiedAccessToken('corrupt1@test.dev');
    await ready(token);
    // Save some answers (state → IN_PROGRESS).
    for (const q of CURRENT_STATE_QUESTIONS.slice(0, 4)) {
      await agent.put(`${A}/answers/${q.id}`).set(auth(token)).send({ value: 2 });
    }
    const healthy = await agent.get(`${A}`).set(auth(token));
    const assessmentId = healthy.body.assessment_id as string;
    expect(healthy.body.requires_safe_restart).toBeUndefined();

    // Simulate a retired definition version: the active assessment was collected
    // against an older definition that is no longer current (inconsistent progress).
    const row = prisma.assessmentStore.get(assessmentId)!;
    expect(row).toBeDefined();
    row.definitionVersion = 'assessment-0.9-stale';

    const corrupt = await agent.get(`${A}`).set(auth(token));
    expect(corrupt.status).toBe(200);
    // The system offers a safe restart — it does NOT silently resume stale answers.
    expect(corrupt.body.requires_safe_restart).toBe(true);
    // No stale answers are surfaced as a resumable view, and no next question.
    expect(corrupt.body.answered).toEqual([]);
    expect(corrupt.body.next_question_id).toBeNull();
    // The (stale) definition version is reported for diagnostics; no result exists.
    expect(corrupt.body.definition_version).toBe('assessment-0.9-stale');
  });

  it('corrupt progress: no partial result is presented as complete — result is 404, submit fails closed (FR-014b, SC-007)', async () => {
    const token = await verifiedAccessToken('corrupt2@test.dev');
    await ready(token);
    for (const q of CURRENT_STATE_QUESTIONS.slice(0, 6)) {
      await agent.put(`${A}/answers/${q.id}`).set(auth(token)).send({ value: 2 });
    }
    // Corrupt the definition version on the IN_PROGRESS assessment.
    const row = [...prisma.assessmentStore.values()][0];
    row.definitionVersion = 'assessment-0.9-stale';

    // No result exists yet — GET result is 404, never a partial/complete result.
    const result = await agent.get(`${A}/result`).set(auth(token));
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe('RESULT_NOT_FOUND');

    // Submit fails closed: stale answers are NEVER scored into a "complete" result.
    const submit = await agent.post(`${A}/submit`).set(auth(token));
    expect(submit.status).toBe(409);
    expect(submit.body.error.code).toBe('ASSESSMENT_CORRUPT');
    expect(submit.body.error.requires_safe_restart).toBe(true);
    // No result row was created — onboarding did not complete.
    expect(prisma.assessmentResultStore.size).toBe(0);
    const onboarding = [...prisma.onboardingStateStore.values()][0];
    expect(onboarding.state).not.toBe('COMPLETED');
  });

  it('corrupt progress: safe restart re-anchors the definition, then a full submit produces a single result (FR-034, SC-007)', async () => {
    const token = await verifiedAccessToken('corrupt3@test.dev');
    await ready(token);
    for (const q of CURRENT_STATE_QUESTIONS.slice(0, 4)) {
      await agent.put(`${A}/answers/${q.id}`).set(auth(token)).send({ value: 2 });
    }
    const row = [...prisma.assessmentStore.values()][0];
    row.definitionVersion = 'assessment-0.9-stale';

    // The user accepts the safe restart (allowed: IN_PROGRESS, not SCORED).
    const restart = await agent.post(`${A}/restart`).set(auth(token));
    expect(restart.status).toBe(204);
    const reanchored = [...prisma.assessmentStore.values()][0];
    expect(reanchored.definitionVersion).toBe('assessment-1.0');
    expect(reanchored.state).toBe('IN_PROGRESS');
    expect(prisma.assessmentAnswerStore.size).toBe(0);
    expect(prisma.assessmentStore.size).toBe(1); // no duplicate

    // The view no longer flags safe-restart; the user resumes a fresh assessment.
    const fresh = await agent.get(`${A}`).set(auth(token));
    expect(fresh.body.requires_safe_restart).toBeUndefined();
    expect(fresh.body.definition_version).toBe('assessment-1.0');

    await answerAll(token);
    const submit = await agent.post(`${A}/submit`).set(auth(token));
    expect(submit.status).toBe(200);
    expect(prisma.assessmentResultStore.size).toBe(1);
    expect(submit.body.result.definition_version).toBe('assessment-1.0');
    expect(REQUIRED_COACHING_IDS.length).toBeGreaterThan(0); // sanity anchor
  });
});