import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication, Logger } from '@nestjs/common';
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
import { EMAIL_PORT } from '../../src/modules/auth/ports/email.port';
import { FakeEmailAdapter } from '../../src/modules/auth/ports/fake-email.adapter';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';
import { NOTICE_VERSION_V1 } from '../../prisma/seed/notice-versions';
import { CURRENT_STATE_QUESTIONS } from '../../src/modules/assessment/assessment-definition';

/**
 * T085 — Redaction audit (FR-030, SC-010, research D7). The deletion/retention
 * flows are the riskiest telemetry surface because they touch every in-scope
 * store at once. This suite verifies, by inspection of the durable audit artifact
 * (DeletionLog rows), the API response surface, AND the emitted log lines, that:
 *
 *  - The DeletionLog row carries ONLY sanitized integer counters + a non-sensitive
 *    confirmation id — never email, answer text, scores, goal free text, safety
 *    levels/reasons, or consent contents/language (Consent §8, FR-030).
 *  - DELETE /me/account returns ONLY { confirmation_id, status, completed }.
 *  - No sensitive sentinel appears in any Logger line emitted during a deletion or
 *    scheduled-retention run (SC-010 "verifiable by inspection of emitted telemetry").
 *
 * Sensitive sentinels are planted in the user's data (email, goal free text, safety
 * answer codes, consent versions) so a leak is detectable by substring search.
 */
describe('Redaction audit — deletion/retention telemetry (e2e)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let fakeEmail: FakeEmailAdapter;
  let retention: RetentionService;
  let agent: ReturnType<typeof request.agent>;

  const AUTH = '/api/v1/auth';
  const ONB = '/api/v1/onboarding';
  const A = '/api/v1/assessment';

  // Sensitive sentinels planted in the user's data. A leak into DeletionLog rows,
  // the HTTP response, or any Logger line fails the test.
  const SENSITIVE_EMAIL = 'leak-user@test.dev';
  const SENSITIVE_GOAL = 'REDACT_GOAL_SENTINEL';
  const SENSITIVE_SAFETY_CODE = 'F2'; // a DISTRESS-classifying safety answer code (SQ-03)
  const SENSITIVE_SAFETY_LEVEL = 'DISTRESS'; // a risk-classification label (FR-030)
  const SENSITIVE_CONSENT_VERSION = NOTICE_VERSION_V1.termsVersion;

  const SENTINELS = [
    SENSITIVE_EMAIL,
    SENSITIVE_GOAL,
    SENSITIVE_SAFETY_CODE,
    SENSITIVE_SAFETY_LEVEL,
    SENSITIVE_CONSENT_VERSION,
  ];

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
    // Plant the sensitive sentinel in the goal free-text answer.
    await agent
      .put(`${A}/answers/AG-03`)
      .set(auth(token))
      .send({ goals: { stress: { text: SENSITIVE_GOAL } } });
    // SQ-01=S0 (no HIGH_RISK/CRISIS) + SQ-03=F2 → DISTRESS (non-interrupting, so
    // submit returns 200) while still producing a sensitive risk-classification
    // label + reasons that must never leak to logs/DeletionLog (FR-030).
    await agent.put(`${A}/answers/SQ-01`).set(auth(token)).send({ code: 'S0' });
    await agent.put(`${A}/answers/SQ-03`).set(auth(token)).send({ code: SENSITIVE_SAFETY_CODE });
    const submit = await agent.post(`${A}/submit`).set(auth(token));
    expect(submit.status).toBe(200);
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

  /** Capture every Logger line emitted while `fn` runs and return them concatenated
   * as a single string for substring sentinel search (SC-010). */
  async function captureLogs(fn: () => Promise<unknown>): Promise<string> {
    const captured: string[] = [];
    const spies = ['log', 'warn', 'error', 'debug', 'verbose', 'fatal'].map((m) =>
      vi.spyOn(Logger.prototype, m as keyof Logger).mockImplementation((...args: unknown[]) => {
        captured.push(args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' '));
        return undefined as unknown as void;
      }),
    );
    try {
      await fn();
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    return captured.join('\n');
  }

  // ── DeletionLog is sanitized counters only ──────────────────────────

  it('account-deletion DeletionLog row carries only sanitized counters — no email/answers/scores/safety/consent (FR-030, Consent §8)', async () => {
    const token = await verifiedAccessToken(SENSITIVE_EMAIL);
    await fullyOnboard(token);
    expect(prisma.consentStore.size).toBe(1);
    expect(prisma.assessmentResultStore.size).toBe(1);

    const res = await agent.delete('/api/v1/me/account').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);

    const logs = [...prisma.deletionLogStore.values()];
    expect(logs.length).toBe(1);
    const row = logs[0];
    expect(row.runKind).toBe('account_deletion');

    // The persisted row serialized to JSON must not contain any sensitive sentinel.
    const rowJson = JSON.stringify(row);
    for (const s of SENTINELS) {
      expect(rowJson).not.toContain(s);
    }
    // categoryCounts is a counters object — integer values, category keys, nothing else.
    const counts = row.categoryCounts as Record<string, { deleted: number; errors: number }>;
    expect(counts).toBeDefined();
    for (const v of Object.values(counts)) {
      expect(Number.isInteger(v.deleted)).toBe(true);
      expect(Number.isInteger(v.errors)).toBe(true);
    }
    // The confirmation id is derived from the userId + timestamp, never the email.
    expect(row.confirmationId).toContain('account:');
    expect(row.confirmationId).not.toContain(SENSITIVE_EMAIL);
  });

  it('scheduled-retention DeletionLog row carries only sanitized counters (FR-030)', async () => {
    // Seed an unverified account older than the 7d cutoff so the scheduled run has work.
    const token = await verifiedAccessToken(SENSITIVE_EMAIL);
    await fullyOnboard(token);
    // Age the account past every cutoff so scheduled retention deletes it.
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    for (const u of prisma.userStore.values()) u.lastActivityAt = old;
    for (const o of prisma.onboardingStateStore.values()) o.lastActivityAt = old;
    for (const a of prisma.assessmentStore.values()) a.lastActivityAt = old;

    await retention.runScheduledRetention(new Date());

    const logs = [...prisma.deletionLogStore.values()].filter((r) => r.runKind === 'scheduled_retention');
    expect(logs.length).toBe(1);
    const rowJson = JSON.stringify(logs[0]);
    for (const s of SENTINELS) {
      expect(rowJson).not.toContain(s);
    }
    // The scheduled confirmation id is `scheduled_retention:<date>` — no email.
    expect(logs[0].confirmationId).not.toContain(SENSITIVE_EMAIL);
  });

  // ── HTTP response surface is sanitized ──────────────────────────────

  it('DELETE /me/account returns only confirmation_id, status, completed — no sensitive fields (FR-030)', async () => {
    const token = await verifiedAccessToken(SENSITIVE_EMAIL);
    await fullyOnboard(token);

    const res = await agent.delete('/api/v1/me/account').set(auth(token));
    expect(res.status).toBe(200);
    const keys = Object.keys(res.body).sort();
    expect(keys).toEqual(['completed', 'confirmation_id', 'status']);
    const bodyJson = JSON.stringify(res.body);
    for (const s of SENTINELS) {
      expect(bodyJson).not.toContain(s);
    }
  });

  // ── Emitted telemetry is sanitized (SC-010) ─────────────────────────

  it('no sensitive sentinel appears in Logger lines emitted during account deletion (SC-010)', async () => {
    const token = await verifiedAccessToken(SENSITIVE_EMAIL);
    await fullyOnboard(token);

    const out = await captureLogs(() => agent.delete('/api/v1/me/account').set(auth(token)));
    for (const s of SENTINELS) {
      expect(out).not.toContain(s);
    }
  });

  it('no sensitive sentinel appears in Logger lines emitted during scheduled retention (SC-010)', async () => {
    const token = await verifiedAccessToken(SENSITIVE_EMAIL);
    await fullyOnboard(token);
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    for (const u of prisma.userStore.values()) u.lastActivityAt = old;
    for (const o of prisma.onboardingStateStore.values()) o.lastActivityAt = old;
    for (const a of prisma.assessmentStore.values()) a.lastActivityAt = old;

    const out = await captureLogs(() => retention.runScheduledRetention(new Date()));
    for (const s of SENTINELS) {
      expect(out).not.toContain(s);
    }
  });
});

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}