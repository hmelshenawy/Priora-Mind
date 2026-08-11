import { defineConfig } from 'vitest/config';

/**
 * Vitest config — unit + contract tests.
 * Pure-function tests (scoring, safety-classifier, redact) run with no DB.
 * Contract tests (NestJS + supertest) boot an isolated app; the DB is handled
 * per-suite in the Foundational/Story phases.
 */
export default defineConfig({
  test: {
    root: './',
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts', 'tests/contract/**/*.spec.ts', 'tests/architecture/**/*.spec.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['tests/**', 'dist/**', 'src/main.ts', '**/*.module.ts'],
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
