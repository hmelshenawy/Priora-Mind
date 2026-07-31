/**
 * Test environment bootstrap (imported at the top of any test that boots the
 * NestJS app). Sets the fail-closed env vars ConfigModule requires, with values
 * safe for in-memory contract tests. Uses `??=` so a real `.env` or explicit
 * process.env override still wins.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/priora_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0000000000000000';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0000000000000000';
process.env.JWT_ACCESS_TTL_SECONDS ??= '900';
process.env.JWT_REFRESH_TTL_SECONDS ??= '2592000';
process.env.EMAIL_PROVIDER ??= 'fake';
process.env.EMAIL_FROM ??= 'noreply@priora.test';
process.env.PUBLIC_APP_URL ??= 'http://localhost:3001';
process.env.CORS_ORIGIN ??= 'http://localhost:3001';