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
import { CURRENT_STATE_QUESTIONS } from '../../src/modules/assessment/constants/assessment-definition';
import { SAFETY_COPY } from '../../src/modules/safety/constants/safety-definition';

/**
 * T060 — Safety contract (contracts/safety.md, FR-019..FR-025, Safety Matrix §4/§6/§9/§10).
 * Boots the real Auth + Profile + Assessment + Safety stack over an in-memory Prisma +
 * FakeEmailAdapter. Covers US6: per-answer CRISIS/HIGH_RISK routing + interruption, the
 * `safety_route` payload (approved copy, no invented resources, AR+EN parity), the
 * SAFETY_HOLD page, user-initiated re-entry (resume + repeat-hold), historical
 * immutability, and the fail-closed 503 fallback. Classification is deterministic — no
 * AI, no DB-of-record beyond the append-only SafetyEvaluation (research D8/D9).
 */
describe('Safety contract (US6)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let fakeEmail: FakeEmailAdapter;
  let agent: ReturnType<typeof request.agent>;

  const AUTH = '/api/v1/auth';
  const ONB = '/api/v1/onboarding';
  const A = '/api/v1/assessment';
  const S = '/api/v1/safety';
  const email = 'safety@test.dev';
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

  /** Answer the 16 current-state + AG-01/02/03 coaching set (US4) without the safety
   * questions, leaving the flow at SQ-01. Scores are mid-scale (value 2 → no distress
   * pattern), so the only safety signal is whatever SQ answers the test then supplies. */
  async function answerCoaching(token: string, selected: string[] = ['stress', 'mood']) {
    for (const q of CURRENT_STATE_QUESTIONS) {
      const res = await agent.put(`${A}/answers/${q.id}`).set(auth(token)).send({ value: 2 });
      expect(res.status).toBe(200);
    }
    await agent.put(`${A}/answers/AG-01`).set(auth(token)).send({ domains: selected });
    const ranking: Record<string, number> = {};
    selected.forEach((d, i) => (ranking[d] = i + 1));
    await agent.put(`${A}/answers/AG-02`).set(auth(token)).send({ ranking });
    const goals: Record<string, { text: string }> = {};
    selected.forEach((d) => (goals[d] = { text: `improve ${d}` }));
    await agent.put(`${A}/answers/AG-03`).set(auth(token)).send({ goals });
  }

  function userIdOf(): string {
    return [...prisma.userStore.values()][0].id;
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

  // ── access control ──────────────────────────────────────────────

  it('GET /safety/hold without a token returns 401', async () => {
    const res = await agent.get(`${S}/hold`);
    expect(res.status).toBe(401);
  });

  it('GET /safety/hold for an unverified user returns 403 EMAIL_NOT_VERIFIED', async () => {
    await registerAndCapture();
    const login = await agent.post(`${AUTH}/login`).send({ email, password });
    const res = await agent.get(`${S}/hold`).set(auth(login.body.accessToken));
    expect(res.status).toBe(403);
  });

  // ── per-answer routing (FR-019a, Safety Matrix §4/§6) ────────────

  it('SQ-01=S2 → CRISIS interrupt: safety_route CRISIS, INTERRUPTED, resume_available=false, next_question_id=null; assessment stays IN_PROGRESS, onboarding SAFETY_HOLD (FR-019a/FR-023)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    const res = await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S2' });
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
    expect(res.body.next_question_id).toBe(null); // interrupted
    const route = res.body.safety_route;
    expect(route).toBeDefined();
    expect(route.level).toBe('CRISIS');
    expect(route.assessment_state).toBe('INTERRUPTED');
    expect(route.onboarding_state).toBe('SAFETY_HOLD');
    expect(route.resume_available).toBe(false);
    // No invented resources (FR-024); AR + EN approved copy (FR-037, Constitution X).
    expect(route.resources).toEqual([]);
    expect(route.copy.en).toBe(SAFETY_COPY.CRISIS.en);
    expect(route.copy.ar).toBe(SAFETY_COPY.CRISIS.ar);
    expect(route.actions[0]).toMatchObject({ id: 'emergency_services', type: 'external_fallback' });
    // Assessment is NOT suspended on CRISIS (interrupted in place); onboarding is held.
    const view = await agent.get(`${A}`).set(auth(token));
    expect(view.body.assessment_state).toBe('IN_PROGRESS');
    const state = await agent.get(`${ONB}/state`).set(auth(token));
    expect(state.body.onboarding_state).toBe('SAFETY_HOLD');
  });

  it('SQ-01=S1 alone → no safety_route, next=SQ-02 (intermediate state); SQ-02=D0 → HIGH_RISK: SUSPENDED, resume_available=true (FR-019a/§4)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    const sq01 = await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S1' });
    expect(sq01.status).toBe(200);
    expect(sq01.body.safety_route).toBeUndefined(); // S1 alone is NORMAL
    expect(sq01.body.next_question_id).toBe('SQ-02'); // follow-up shown
    const sq02 = await agent.put(`${A}/answers/SQ-02`).set(auth(token)).send({ code: 'D0' });
    expect(sq02.status).toBe(200);
    expect(sq02.body.next_question_id).toBe(null);
    const route = sq02.body.safety_route;
    expect(route.level).toBe('HIGH_RISK');
    expect(route.assessment_state).toBe('SUSPENDED');
    expect(route.resume_available).toBe(true);
    expect(route.actions[0]).toMatchObject({ id: 'seek_support', type: 'navigate' });
    // Answers retained (SUSPENDED, not deleted) + onboarding held.
    const view = await agent.get(`${A}`).set(auth(token));
    expect(view.body.assessment_state).toBe('SUSPENDED');
    expect(view.body.safety_route).toBeDefined(); // FR-019b enrichment
    expect(view.body.safety_route.level).toBe('HIGH_RISK');
  });

  it('SQ-02 is rejected (400 VALIDATION) when SQ-01=S0 (not triggered, Safety §3)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S0' });
    const res = await agent.put(`${A}/answers/SQ-02`).set(auth(token)).send({ code: 'D0' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('SQ-03=F2 with SQ-01=S0 → DISTRESS, no interrupt: no safety_route, no persisted evaluation; next_question_id=null (FR-019a/§5)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S0' });
    const sq03 = await agent.put(`${A}/answers/SQ-03`).set(auth(token)).send({ code: 'F2' });
    expect(sq03.status).toBe(200);
    expect(sq03.body.safety_route).toBeUndefined(); // DISTRESS does not interrupt
    expect(sq03.body.next_question_id).toBe(null); // all required answered (SQ-02 skipped)
    // NORMAL/DISTRESS per-answer evaluations are NOT persisted (only HIGH_RISK/CRISIS).
    expect(prisma.safetyEvaluationStore.size).toBe(0);
    const state = await agent.get(`${ONB}/state`).set(auth(token));
    expect(state.body.onboarding_state).toBe('ASSESSMENT_IN_PROGRESS'); // not held
  });

  it('SQ-03=F2 never downgrades CRISIS: SQ-01=S2 + SQ-02=D0 + SQ-03=F2 → CRISIS (highest-risk-wins, Safety §5)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S2' }); // CRISIS interrupt
    // SQ-03 is now blocked by SAFETY_HOLD (no further saves) — classify via re-entry body
    // (with the required SQ-02 follow-up) to prove F2 cannot downgrade the CRISIS.
    const res = await agent
      .post(`${S}/reentry`)
      .set(auth(token))
      .send({ re_evaluate: true, safety_answers: { 'SQ-01': 'S2', 'SQ-02': 'D0', 'SQ-03': 'F2' } });
    expect(res.status).toBe(200);
    expect(res.body.level).toBe('CRISIS'); // not DISTRESS
    expect(res.body.safety_route.level).toBe('CRISIS');
  });

  // ── SAFETY_HOLD page (FR-019b, Safety Matrix §9) ────────────────

  it('GET /safety/hold returns the current level + approved copy + immutable historical list + can_initiate_reentry (FR-019b/§9)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S2' }); // CRISIS
    const res = await agent.get(`${S}/hold`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.level).toBe('CRISIS');
    expect(res.body.copy.en).toBe(SAFETY_COPY.CRISIS.en);
    expect(res.body.copy.ar).toBe(SAFETY_COPY.CRISIS.ar);
    expect(res.body.historical).toHaveLength(1);
    expect(res.body.historical[0]).toMatchObject({
      level: 'CRISIS',
      trigger_context: 'per_answer',
      definition_version: 'safety-1.0',
    });
    expect(res.body.historical[0].evaluated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.can_initiate_reentry).toBe(true);
  });

  // ── re-entry (FR-019b context, Safety Matrix §9) ────────────────

  it('POST /safety/reentry NORMAL (S0,F0) from SAFETY_HOLD → resumes: ASSESSMENT_IN_PROGRESS, IN_PROGRESS, next /assessment, level NORMAL; history grows + stays immutable (§9)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S2' }); // CRISIS hold
    expect(prisma.safetyEvaluationStore.size).toBe(1);
    const res = await agent
      .post(`${S}/reentry`)
      .set(auth(token))
      .send({ re_evaluate: true, safety_answers: { 'SQ-01': 'S0', 'SQ-03': 'F0' } });
    expect(res.status).toBe(200);
    expect(res.body.onboarding_state).toBe('ASSESSMENT_IN_PROGRESS');
    expect(res.body.assessment_state).toBe('IN_PROGRESS');
    expect(res.body.next).toBe('/assessment');
    expect(res.body.level).toBe('NORMAL');
    expect(res.body.safety_evaluation_id).toBeDefined();
    // Append-only: 2 evaluations now; the prior CRISIS row is NOT relabeled.
    expect(prisma.safetyEvaluationStore.size).toBe(2);
    const hold = await agent.get(`${S}/hold`).set(auth(token));
    expect(hold.body.historical).toHaveLength(2);
    expect(hold.body.historical[1].level).toBe('CRISIS'); // original preserved
    expect(hold.body.historical[0].level).toBe('NORMAL'); // new current
  });

  it('POST /safety/reentry HIGH_RISK (S1,D0) from SAFETY_HOLD → repeats hold: SAFETY_HOLD persists, safety_route HIGH_RISK, level HIGH_RISK (§9)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S2' }); // CRISIS hold
    const res = await agent
      .post(`${S}/reentry`)
      .set(auth(token))
      .send({ re_evaluate: true, safety_answers: { 'SQ-01': 'S1', 'SQ-02': 'D0', 'SQ-03': 'F0' } });
    expect(res.status).toBe(200);
    expect(res.body.onboarding_state).toBe('SAFETY_HOLD');
    expect(res.body.level).toBe('HIGH_RISK');
    expect(res.body.safety_route.level).toBe('HIGH_RISK');
    expect(res.body.safety_route.resume_available).toBe(true);
  });

  it('POST /safety/reentry SQ-02 required when SQ-01∈{S1,S2,SX}: missing SQ-02 → 503 fail-closed (FR-025/§10)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S2' }); // CRISIS hold
    const res = await agent
      .post(`${S}/reentry`)
      .set(auth(token))
      .send({ re_evaluate: true, safety_answers: { 'SQ-01': 'S1', 'SQ-03': 'F0' } }); // SQ-02 missing
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SAFETY_UNAVAILABLE');
    expect(res.body.error.copy.en).toBe(SAFETY_COPY.UNAVAILABLE.en);
    expect(res.body.error.copy.ar).toBe(SAFETY_COPY.UNAVAILABLE.ar);
    // SAFETY_HOLD persists — do not resume on failure (FR-025).
    const state = await agent.get(`${ONB}/state`).set(auth(token));
    expect(state.body.onboarding_state).toBe('SAFETY_HOLD');
  });

  it('POST /safety/reentry with invalid SQ code → 503 SAFETY_UNAVAILABLE (fail closed, FR-025)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S2' });
    const res = await agent
      .post(`${S}/reentry`)
      .set(auth(token))
      .send({ re_evaluate: true, safety_answers: { 'SQ-01': 'ZZ', 'SQ-03': 'F0' } });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SAFETY_UNAVAILABLE');
  });

  it('POST /safety/reentry without re_evaluate=true → 503 SAFETY_UNAVAILABLE (fail closed, FR-025)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S2' });
    const res = await agent
      .post(`${S}/reentry`)
      .set(auth(token))
      .send({ safety_answers: { 'SQ-01': 'S0', 'SQ-03': 'F0' } }); // no re_evaluate
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SAFETY_UNAVAILABLE');
  });

  // ── submit suppression (FR-019b) ─────────────────────────────────

  it('POST /assessment/submit while SAFETY_HOLD → 409 SAFETY_HOLD enriched with safety_route, no result (FR-019b)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S2' }); // CRISIS hold
    const res = await agent.post(`${A}/submit`).set(auth(token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SAFETY_HOLD');
    expect(res.body.error.safety_route.level).toBe('CRISIS');
    expect(res.body).not.toHaveProperty('result');
    expect(prisma.assessmentResultStore.size).toBe(0);
  });

  it('GET /assessment/result while SAFETY_HOLD → 409 SAFETY_HOLD (suppressed, FR-019b)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S2' });
    const res = await agent.get(`${A}/result`).set(auth(token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SAFETY_HOLD');
    expect(res.body).not.toHaveProperty('domain_scores');
  });

  it('restart is blocked while SAFETY_HOLD — re-entry is the only exit (Safety §9/§10)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S2' });
    const res = await agent.post(`${A}/restart`).set(auth(token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SAFETY_HOLD');
  });

  // ── historical immutability + retention hook (FR-031, Safety §9) ─

  it('deleteSafetyForUsers removes all SafetyEvaluation rows for the user (SafetyDeletionPort, FR-031)', async () => {
    const token = await verifiedAccessToken();
    await ready(token);
    await answerCoaching(token);
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S2' });
    expect(prisma.safetyEvaluationStore.size).toBe(1);
    // Import lazily to avoid hoisting the module graph; the deletion port is exported
    // by SafetyModule and resolved from the compiled module.
    const { SafetyDeletionService } = await import('../../src/modules/safety/services/safety-deletion.service');
    const deletion = app.get(SafetyDeletionService);
    const counters = await deletion.deleteSafetyForUsers([userIdOf()]);
    expect(prisma.safetyEvaluationStore.size).toBe(0);
    expect(counters.deleted).toBe(1);
  });
});