import { describe, it, expect } from 'vitest';
import { redactSensitive, toSafeLogContext, isSensitiveKey } from '../../src/common/redact';

/**
 * Redaction layer fixtures (research D7, FR-030, SC-010).
 * Asserts that any payload carrying sensitive fields is sanitized before it
 * could reach logs/traces/analytics/error reports.
 */
describe('redaction layer', () => {
  it('scrubs sensitive keys at any depth, preserves safe context', () => {
    const payload = {
      user_id: 'u-123',
      email: 'a@b.com',
      password: 'hunter2',
      answers: [{ question_id: 'AS-01', value: 3 }],
      assessment: {
        state: 'IN_PROGRESS',
        domain_scores: { mood: { score: 12 } },
        free_text: 'I feel alone',
      },
      safety: { level: 'HIGH_RISK', reasons: ['SQ-01=S1'] },
      consent: { service_boundary_version: 'v1' },
    };

    const redacted = redactSensitive(payload) as Record<string, unknown>;

    expect(redacted.user_id).toBe('u-123');
    expect(redacted.email).toBe('[REDACTED]');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.answers).toBe('[REDACTED]');
    expect((redacted.assessment as Record<string, unknown>).state).toBe('IN_PROGRESS');
    expect((redacted.assessment as Record<string, unknown>).domain_scores).toBe('[REDACTED]');
    expect((redacted.assessment as Record<string, unknown>).free_text).toBe('[REDACTED]');
    expect((redacted.safety as Record<string, unknown>).level).toBe('[REDACTED]');
    expect((redacted.safety as Record<string, unknown>).reasons).toBe('[REDACTED]');
    expect(redacted.consent).toBe('[REDACTED]');
  });

  it('does not mutate the original input', () => {
    const payload = { password: 'secret', ok: 1 };
    redactSensitive(payload);
    expect(payload.password).toBe('secret');
    expect(payload.ok).toBe(1);
  });

  it('toSafeLogContext keeps only allowlisted fields', () => {
    const ctx = {
      user_id: 'u-1',
      route: '/assessment',
      email: 'a@b.com',
      answers: ['x'],
      deleted_count: 5,
      safety_level: 'CRISIS', // intentionally NOT safe by default (research D7)
    };
    const safe = toSafeLogContext(ctx);
    expect(safe).toEqual({ user_id: 'u-1', route: '/assessment', deleted_count: 5 });
    expect(safe).not.toHaveProperty('email');
    expect(safe).not.toHaveProperty('answers');
    expect(safe).not.toHaveProperty('safety_level');
  });

  it('isSensitiveKey is case-insensitive', () => {
    expect(isSensitiveKey('PasswordHash')).toBe(true);
    expect(isSensitiveKey('DOMAIN_SCORES')).toBe(true);
    expect(isSensitiveKey('user_id')).toBe(false);
  });
});