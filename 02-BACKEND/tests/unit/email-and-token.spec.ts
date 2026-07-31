import { describe, it, expect } from 'vitest';
import { FakeEmailAdapter } from '../../src/modules/auth/ports/fake-email.adapter';
import { generateToken, hashToken, sameHash } from '../../src/modules/auth/tokens/token-hash';

/**
 * T018 — FakeEmailAdapter capture + verification-token hashing (research D2).
 * Pure, no DB, no network.
 */
describe('FakeEmailAdapter', () => {
  it('captures sent verification messages in order', async () => {
    const adapter = new FakeEmailAdapter();
    await adapter.sendVerification({ to: 'a@b.test', token: 't1', userId: 'u1', lang: 'en' });
    await adapter.sendVerification({ to: 'c@d.test', token: 't2', userId: 'u2', lang: 'ar' });

    expect(adapter.count).toBe(2);
    expect(adapter.messages[0]).toEqual({ to: 'a@b.test', token: 't1', userId: 'u1', lang: 'en' });
    expect(adapter.messages[1]).toEqual({ to: 'c@d.test', token: 't2', userId: 'u2', lang: 'ar' });
    expect(adapter.last?.token).toBe('t2');
  });

  it('reset clears captured messages', async () => {
    const adapter = new FakeEmailAdapter();
    await adapter.sendVerification({ to: 'a@b.test', token: 't', userId: 'u', lang: 'en' });
    adapter.reset();
    expect(adapter.count).toBe(0);
    expect(adapter.last).toBeUndefined();
  });
});

describe('verification token hashing', () => {
  it('generateToken returns a 64-char hex raw token and a 32-byte sha256 hash', () => {
    const { raw, hash } = generateToken();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hash.length).toBe(32); // sha256 = 32 bytes
    expect(hashToken(raw).equals(hash)).toBe(true);
  });

  it('distinct raw tokens produce distinct hashes', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.raw).not.toBe(b.raw);
    expect(sameHash(a.hash, b.hash)).toBe(false);
  });

  it('hashToken is deterministic — same raw → same hash', () => {
    const raw = 'abc123';
    expect(hashToken(raw).equals(hashToken(raw))).toBe(true);
  });
});