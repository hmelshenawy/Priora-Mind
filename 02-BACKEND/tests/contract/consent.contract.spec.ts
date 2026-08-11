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
import { AuthDeletionService } from '../../src/modules/auth/services/auth-deletion.service';
import { EMAIL_PORT } from '../../src/modules/auth/ports/email.port';
import { FakeEmailAdapter } from '../../src/modules/auth/ports/fake-email.adapter';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';
import { NOTICE_VERSION_V1, NOTICE_VERSION_V2_TERMS } from '../../prisma/seed/notice-versions';

/**
 * T028 — Consent contract tests (contracts/consent.md, FR-005..FR-008, FR-032).
 * Boots the real NestJS auth + consent stack over an in-memory Prisma +
 * FakeEmailAdapter. Verifies notices GET, consent GET/POST, anti-advance on
 * decline, re-consent on version mismatch, idempotent retry, fail-closed when
 * notices are undetermined, EMAIL_VERIFIED gating, and consent deletion (T034).
 */
describe('Consent contract (US2)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let fakeEmail: FakeEmailAdapter;
  let deletion: AuthDeletionService;
  let agent: ReturnType<typeof request.agent>;

  const AUTH = '/api/v1/auth';
  const ONB = '/api/v1/onboarding';
  const email = 'consent@test.dev';
  const password = 'password123';

  async function registerAndCapture() {
    const res = await agent.post(`${AUTH}/register`).send({ email, password });
    const captured = fakeEmail.last!;
    return { res, captured };
  }

  /** Register → verify email → login; returns the access token. */
  async function verifiedAccessToken(): Promise<string> {
    const { captured } = await registerAndCapture();
    await agent.get(`${AUTH}/verify-email`).query({ token: captured.token, userId: captured.userId });
    const login = await agent.post(`${AUTH}/login`).send({ email, password });
    return login.body.accessToken as string;
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  function v1Body() {
    return {
      service_boundary_version: NOTICE_VERSION_V1.serviceBoundaryVersion,
      terms_version: NOTICE_VERSION_V1.termsVersion,
      privacy_notice_version: NOTICE_VERSION_V1.privacyNoticeVersion,
      acknowledgments: { service_boundary: true, terms: true, privacy_notice: true },
      consent_language_code: 'en',
      product_channel_id: 'priora-mind-web',
    };
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
    deletion = module.get(AuthDeletionService);
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

  it('GET /onboarding/notices without an access token returns 401', async () => {
    const res = await agent.get(`${ONB}/notices`);
    expect(res.status).toBe(401);
  });

  it('GET /onboarding/notices for a REGISTERED (not verified) user returns 403 EMAIL_NOT_VERIFIED', async () => {
    const { captured } = await registerAndCapture();
    // login WITHOUT verifying — status stays REGISTERED in the token.
    const login = await agent.post(`${AUTH}/login`).send({ email, password });
    expect(login.body.accessToken).toBeDefined();
    const res = await agent.get(`${ONB}/notices`).set(auth(login.body.accessToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    // user id is stable from the captured verification email's userId
    expect(captured.userId).toBeDefined();
  });

  // ── notices ──────────────────────────────────────────────────────

  it('GET /onboarding/notices returns the active set with bilingual boundary text (FR-005)', async () => {
    const token = await verifiedAccessToken();
    const res = await agent.get(`${ONB}/notices`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.service_boundary_version).toBe('boundary-1.0');
    expect(res.body.terms_version).toBe('terms-1.0');
    expect(res.body.privacy_notice_version).toBe('privacy-1.0');
    expect(res.body.service_boundary_text.en).toContain('not medical');
    expect(res.body.service_boundary_text.ar).toContain('ليست خدمة طبية');
    expect(res.body.required_acknowledgments).toEqual([
      'service_boundary',
      'terms',
      'privacy_notice',
    ]);
  });

  // ── consent status ───────────────────────────────────────────────

  it('GET /onboarding/consent before granting → has_granted=false, requires_reconsent=true', async () => {
    const token = await verifiedAccessToken();
    const res = await agent.get(`${ONB}/consent`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.has_granted).toBe(false);
    expect(res.body.requires_reconsent).toBe(true);
    expect(res.body.recorded_versions).toBeNull();
  });

  // ── record consent ───────────────────────────────────────────────

  it('POST /onboarding/consent with all acknowledgments grants consent and signals IN_PROGRESS (FR-006/FR-007)', async () => {
    const token = await verifiedAccessToken();
    const res = await agent.post(`${ONB}/consent`).set(auth(token)).send(v1Body());
    expect(res.status).toBe(201);
    expect(res.body.consent_record_id).toBeTypeOf('string');
    expect(res.body.onboarding_state).toBe('IN_PROGRESS');
    expect(res.body.next).toBe('/onboarding/profile');
    expect(() => new Date(res.body.granted_at)).not.toThrow();
    expect(prisma.consentStore.size).toBe(1);
  });

  it('POST /onboarding/consent is idempotent: a retry returns the same record (research D6)', async () => {
    const token = await verifiedAccessToken();
    const first = await agent.post(`${ONB}/consent`).set(auth(token)).send(v1Body());
    const second = await agent.post(`${ONB}/consent`).set(auth(token)).send(v1Body());
    expect(second.status).toBe(201);
    expect(second.body.consent_record_id).toBe(first.body.consent_record_id);
    expect(prisma.consentStore.size).toBe(1);
  });

  it('POST /onboarding/consent with an incomplete acknowledgment → 400 ACKNOWLEDGMENTS_INCOMPLETE, no advance (Consent §4)', async () => {
    const token = await verifiedAccessToken();
    const res = await agent
      .post(`${ONB}/consent`)
      .set(auth(token))
      .send({
        ...v1Body(),
        acknowledgments: { service_boundary: true, terms: false, privacy_notice: true },
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ACKNOWLEDGMENTS_INCOMPLETE');
    expect(prisma.consentStore.size).toBe(0);
  });

  it('POST /onboarding/consent with stale versions → 409 RECONSENT_REQUIRED (FR-008)', async () => {
    const token = await verifiedAccessToken();
    const res = await agent
      .post(`${ONB}/consent`)
      .set(auth(token))
      .send({ ...v1Body(), terms_version: 'terms-0.9' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RECONSENT_REQUIRED');
    expect(res.body.error.current_versions.terms_version).toBe('terms-1.0');
    expect(prisma.consentStore.size).toBe(0);
  });

  it('GET /onboarding/consent after granting → has_granted=true, requires_reconsent=false', async () => {
    const token = await verifiedAccessToken();
    await agent.post(`${ONB}/consent`).set(auth(token)).send(v1Body());
    const res = await agent.get(`${ONB}/consent`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.has_granted).toBe(true);
    expect(res.body.requires_reconsent).toBe(false);
    expect(res.body.recorded_versions.terms_version).toBe('terms-1.0');
    expect(res.body.consent_language_code).toBe('en');
  });

  // ── fail-closed + re-consent ─────────────────────────────────────

  it('fail-closed: with no active notice set, GET notices + POST consent return 503 (FR-007)', async () => {
    const token = await verifiedAccessToken();
    prisma.noticeStore.clear();
    const get = await agent.get(`${ONB}/notices`).set(auth(token));
    expect(get.status).toBe(503);
    expect(get.body.error.code).toBe('NOTICES_UNAVAILABLE');
    const post = await agent.post(`${ONB}/consent`).set(auth(token)).send(v1Body());
    expect(post.status).toBe(503);
    expect(post.body.error.code).toBe('NOTICES_UNAVAILABLE');
    expect(prisma.consentStore.size).toBe(0);
  });

  it('re-consent: a terms-version change requires re-consent and writes a new retained record (FR-008)', async () => {
    const token = await verifiedAccessToken();
    await agent.post(`${ONB}/consent`).set(auth(token)).send(v1Body());
    // Publish terms-1.1 and retire v1.
    prisma.noticeVersionSet.update({ where: { id: NOTICE_VERSION_V1.id }, data: { isActive: false } });
    prisma.noticeVersionSet.create({
      data: { ...NOTICE_VERSION_V2_TERMS, publishedAt: new Date('2026-06-01T00:00:00Z') },
    });

    const status = await agent.get(`${ONB}/consent`).set(auth(token));
    expect(status.body.requires_reconsent).toBe(true);
    expect(status.body.current_versions.terms_version).toBe('terms-1.1');

    const res = await agent
      .post(`${ONB}/consent`)
      .set(auth(token))
      .send({
        ...v1Body(),
        terms_version: NOTICE_VERSION_V2_TERMS.termsVersion,
      });
    expect(res.status).toBe(201);
    expect(prisma.consentStore.size).toBe(2); // prior retained for audit, new granted

    const after = await agent.get(`${ONB}/consent`).set(auth(token));
    expect(after.body.requires_reconsent).toBe(false);
    expect(after.body.recorded_versions.terms_version).toBe('terms-1.1');
  });

  // ── consent deletion (T034) ───────────────────────────────────────

  it('deleteConsentForUsers removes a user’s records and is idempotent (Consent §9)', async () => {
    const token = await verifiedAccessToken();
    await agent.post(`${ONB}/consent`).set(auth(token)).send(v1Body());
    expect(prisma.consentStore.size).toBe(1);
    const userId = [...prisma.userStore.values()][0].id;

    const first = await deletion.deleteConsentForUsers([userId]);
    expect(first.deleted).toBe(1);
    expect(first.errors).toBe(0);
    expect(prisma.consentStore.size).toBe(0);

    const second = await deletion.deleteConsentForUsers([userId]);
    expect(second.deleted).toBe(0); // idempotent re-run
  });
});