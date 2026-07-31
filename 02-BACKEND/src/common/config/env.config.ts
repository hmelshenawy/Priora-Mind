import { z } from 'zod';

/**
 * Environment configuration (research D2/D3, plan.md Technical Context).
 *
 * The backend boots only if every required variable is present and well-formed.
 * This is the fail-closed posture for configuration: a missing JWT secret or
 * database URL MUST stop startup rather than silently defaulting to an insecure
 * value. Sensitive values (secrets, the DATABASE_URL password, EMAIL_API_KEY)
 * are never logged by this module.
 *
 * Validation is also where the EmailPort adapter is selected ("fake" for dev/test,
 * "http" for the production transactional provider) — consumed by the Auth module
 * in User Story 1.
 */

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),

  EMAIL_PROVIDER: z.enum(['fake', 'http']).default('fake'),
  EMAIL_FROM: z.string().email(),
  EMAIL_API_BASE_URL: z.string().url().optional().or(z.literal('')),
  EMAIL_API_KEY: z.string().optional().or(z.literal('')),

  CORS_ORIGIN: z.string().default('http://localhost:3001'),

  // Public app URL used to build verification email links (research D2).
  PUBLIC_APP_URL: z.string().url().default('http://localhost:3001'),

  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().or(z.literal('')),
  OTEL_SERVICE_NAME: z.string().default('priora-mind-backend'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validate and parse the process environment. Throws on any error — the caller
 * (ConfigModule.forRoot) propagates the throw and the process exits non-zero.
 * No secret values appear in the thrown message (only field paths + messages).
 */
export function validateEnv(raw: NodeJS.ProcessEnv): EnvConfig {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}