/**
 * Central redaction layer (research D7, FR-030, SC-010, Consent §11, Safety §10).
 *
 * Applied ONLY at logging / observability / error-reporting boundaries — never
 * at call sites — so a forgotten logger cannot leak sensitive data. Two modes:
 *
 *  - `redactSensitive(value)` — denylist scrub: deep-clones and replaces any key
 *    in the sensitive set with `[REDACTED]`. Use for general structured logging
 *    where non-sensitive context should be preserved.
 *
 *  - `toSafeLogContext(ctx)` — allowlist pick: returns ONLY the explicitly safe
 *    contextual fields. Use at the most sensitive boundaries (e.g. the retention
 *    job emits only `{ window, category, deleted_count, error_count, run_ms }`).
 *
 * `safety_level` is intentionally NOT in the safe set — it is emitted only if the
 * safety reviewer explicitly approves it (research D7; default: not emitted).
 */

const SENSITIVE_KEYS = new Set<string>([
  // Credentials & tokens
  'password',
  'passwordhash',
  'password_hash',
  'secret',
  'token',
  'tokenhash',
  'token_hash',
  'refreshtoken',
  'verificationtoken',
  'accesstoken',
  'authorization',
  // Assessment payload
  'answer',
  'answers',
  'value',
  'text',
  'freetext',
  'free_text',
  'goaltext',
  'goal_text',
  // Scoring & results
  'score',
  'scores',
  'domainscores',
  'domain_scores',
  'overallscore',
  'overall_score',
  'result',
  'results',
  // Safety
  'classification',
  'level',
  'reasons',
  'safetyroute',
  'safety_route',
  'safetyanswers',
  'safety_answers',
  // Consent & copy
  'consent',
  'consentrecord',
  'consent_record',
  'copy',
  'resource',
  'resources',
  // PII
  'email',
]);

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 8;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

/** Deep-clone `value`, replacing any sensitive key's value with `[REDACTED]`. */
export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? REDACTED : redactSensitive(v, depth + 1);
  }
  return out;
}

const SAFE_CONTEXT_KEYS = new Set<string>([
  'user_id',
  'userid',
  'module',
  'route',
  'request_id',
  'requestid',
  'method',
  'url',
  'status_code',
  'duration_ms',
  'onboarding_state',
  'assessment_state',
  'service',
  'version',
  'window',
  'category',
  'deleted_count',
  'error_count',
  'run_ms',
  'confirmation_id',
]);

/** Return only the explicitly-safe contextual fields (strict allowlist). */
export function toSafeLogContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (SAFE_CONTEXT_KEYS.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}