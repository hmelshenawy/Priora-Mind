import { defineConfig } from 'vitest/config';

/**
 * Vitest config — e2e (integration) tests.
 * Boots the full NestJS app with supertest against an isolated test database.
 * Longer timeouts accommodate app startup + migrations per suite.
 */
export default defineConfig({
  test: {
    root: './',
    environment: 'node',
    include: ['tests/e2e/**/*.spec.ts', 'tests/e2e/**/*.e2e-spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});