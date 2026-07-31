import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Backend ESLint config (flat config, ESLint 9).
 * Non-type-aware recommended rules keep lint fast and avoid requiring every
 * test file to be in the build tsconfig. Prettier formatting is enforced via a
 * separate `format` script; eslint-config-prettier only disables conflicting
 * formatting rules.
 */
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  prettier,
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'prisma/migrations/**',
      'prisma/seed.ts',
    ],
  },
);