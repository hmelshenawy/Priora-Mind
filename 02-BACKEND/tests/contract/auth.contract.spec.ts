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
import { EMAIL_PORT } from '../../src/modules/auth/ports/email.port';
import { FakeEmailAdapter } from '../../src/modules/auth/ports/fake-email.adapter';
import { hashToken } from '../../src/modules/auth/tokens/token-hash';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';

/**
 * T017 — Auth contract tests (contracts/auth.md, FR-001/FR-002/FR-004).
 * Boots the real NestJS auth stack over an in-memory Prisma + FakeEmailAdapter.
 */
describe('Auth contract (US1)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let fakeEmail: FakeEmailAdapter;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    prisma = new InMemoryPrisma();
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
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    prisma.reset();
    fakeEmail.reset();
  });

  const API = '/api/v1/auth';
  const email = 'user@test.dev';
  const password = 'password123';

  async function registerAndCapture() {
    const res = await agent.post(`${API}/register`).send({ email, password });
    const captured = fakeEmail.last!;
    return { res, captured };
  }

  async function registerVerifiedUser() {
    const { captured } = await registerAndCapture();
    await agent.get(`${API}/verify-email`).query({ token: captured.token, userId: captured.userId });
    return captured;
  }

  // ── register ───────────────────────────────────────────────────

  it('POST /auth/register creates a REGISTERED account and emails a hashed-token link (FR-001/FR-002)', async () => {
    const { res, captured } = await registerAndCapture();

    expect(res.status).toBe(201);
    expect(res.body.message).toBeTypeOf('string');
    expect(captured.to).toBe(email);
    expect(captured.lang).toBe('en');

    const user = prisma.userAccount.findFirst({ where: { email } });
    expect(user?.status).toBe('REGISTERED');

    const stored = prisma.verificationToken.findFirst({
      where: { userId: captured.userId, tokenHash: hashToken(captured.token) },
    });
    expect(stored).not.toBeNull();
    // The hash is NOT the raw token.
    expect(stored!.tokenHash.equals(Buffer.from(captured.token))).toBe(false);
    expect(stored!.consumedAt).toBeNull();
  });

  it('register is anti-enumeration: duplicate email returns the SAME 201 body (FR-004)', async () => {
    const first = await agent.post(`${API}/register`).send({ email, password });
    const second = await agent.post(`${API}/register`).send({ email, password });

    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(fakeEmail.count).toBe(1); // no second email / no new account
    const users = [...prisma.userStore.values()].filter((u) => u.email === email);
    expect(users.length).toBe(1);
  });

  it('register rejects an invalid email with 400 VALIDATION and no value echo', async () => {
    const res = await agent.post(`${API}/register`).send({ email: 'not-an-email', password });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(JSON.stringify(res.body)).not.toContain(password);
  });

  it('register rejects a short password with 400 VALIDATION and no password echo', async () => {
    const res = await agent.post(`${API}/register`).send({ email: 'x@test.dev', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(JSON.stringify(res.body)).not.toContain('short');
  });

  // ── resend-verification ─────────────────────────────────────────

  it('POST /auth/resend-verification returns the anti-enumeration 200 and rotates the token (one unconsumed)', async () => {
    await registerAndCapture();
    const before = prisma.tokenStore.size;
    const res = await agent.post(`${API}/resend-verification`).send({ email });
    expect(res.status).toBe(200);
    // Rotation deletes the prior unconsumed token and inserts a new one.
    const unconsumed = [...prisma.tokenStore.values()].filter((t) => t.consumedAt === null);
    expect(unconsumed.length).toBe(1);
    expect(prisma.tokenStore.size).toBe(before); // net same count (1 deleted, 1 added)
    expect(fakeEmail.count).toBe(2);
  });

  it('resend-verification for an unknown email returns the SAME 200 (anti-enumeration)', async () => {
    const res = await agent.post(`${API}/resend-verification`).send({ email: 'nope@test.dev' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBeTypeOf('string');
    expect(fakeEmail.count).toBe(0);
  });

  // ── verify-email ────────────────────────────────────────────────

  it('GET /auth/verify-email with a valid token verifies the user and redirects (FR-002)', async () => {
    const { captured } = await registerAndCapture();
    const res = await agent.get(`${API}/verify-email`).query({ token: captured.token, userId: captured.userId });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('verified');
    expect(res.body.redirect).toBe('/onboarding/boundary');

    const user = prisma.userAccount.findFirst({ where: { email } });
    expect(user?.status).toBe('EMAIL_VERIFIED');
    const token = prisma.verificationToken.findFirst({
      where: { userId: captured.userId, tokenHash: hashToken(captured.token) },
    });
    expect(token?.consumedAt).not.toBeNull();
  });

  it('re-verifying a consumed token returns 410 TOKEN_EXPIRED_OR_USED (idempotent)', async () => {
    const { captured } = await registerAndCapture();
    await agent.get(`${API}/verify-email`).query({ token: captured.token, userId: captured.userId });
    const res = await agent.get(`${API}/verify-email`).query({ token: captured.token, userId: captured.userId });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED_OR_USED');
  });

  it('verify-email with an invalid token returns 400 TOKEN_INVALID', async () => {
    const { captured } = await registerAndCapture();
    const res = await agent.get(`${API}/verify-email`).query({ token: 'deadbeef'.repeat(8), userId: captured.userId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  // ── login ───────────────────────────────────────────────────────

  it('POST /auth/login with valid credentials returns accessToken + profile + refresh cookie', async () => {
    await registerVerifiedUser();
    const res = await agent.post(`${API}/login`).send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.profile.onboarding_state).toBe('NOT_STARTED');
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookie).toContain('HttpOnly');
  });

  it('login with a wrong password returns 401 INVALID_CREDENTIALS (FR-004)', async () => {
    await registerVerifiedUser();
    const res = await agent.post(`${API}/login`).send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('login for an unknown email returns the SAME 401 shape as a wrong password (anti-enumeration)', async () => {
    const unknown = await agent.post(`${API}/login`).send({ email: 'ghost@test.dev', password });
    await registerVerifiedUser();
    const wrong = await agent.post(`${API}/login`).send({ email, password: 'wrong-password' });
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  // ── refresh ─────────────────────────────────────────────────────

  it('POST /auth/refresh rotates the refresh token and returns a new accessToken', async () => {
    await registerVerifiedUser();
    await agent.post(`${API}/login`).send({ email, password });
    const rowsBefore = [...prisma.refreshStore.values()];
    const activeBefore = rowsBefore.filter((r) => r.revokedAt === null);
    expect(activeBefore.length).toBe(1);

    const res = await agent.post(`${API}/refresh`);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');

    const activeAfter = [...prisma.refreshStore.values()].filter((r) => r.revokedAt === null);
    expect(activeAfter.length).toBe(1); // old revoked, new active
    expect(rowsBefore[0].revokedAt).not.toBeNull(); // prior row revoked
  });

  it('refresh without a cookie returns 401', async () => {
    await registerVerifiedUser();
    const res = request(app.getHttpServer()).post(`${API}/refresh`);
    const out = await res;
    expect(out.status).toBe(401);
  });

  // ── logout ───────────────────────────────────────────────────────

  it('POST /auth/logout with a valid access token returns 204 and revokes the refresh token', async () => {
    await registerVerifiedUser();
    const login = await agent.post(`${API}/login`).send({ email, password });
    const accessToken = login.body.accessToken;
    const activeBefore = [...prisma.refreshStore.values()].filter((r) => r.revokedAt === null);
    expect(activeBefore.length).toBe(1);

    const res = await agent
      .post(`${API}/logout`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(204);
    expect(activeBefore[0].revokedAt).not.toBeNull();
  });

  it('logout without an access token returns 401 (backend-enforced)', async () => {
    await registerVerifiedUser();
    const res = await agent.post(`${API}/logout`);
    expect(res.status).toBe(401);
  });
});