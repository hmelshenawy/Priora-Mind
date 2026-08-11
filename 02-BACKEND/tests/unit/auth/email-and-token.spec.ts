import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { FakeEmailAdapter } from '../../../src/modules/auth/ports/fake-email.adapter';
import { generateToken, hashToken, sameHash } from '../../../src/modules/auth/tokens/token-hash';
import { InMemoryPrisma } from '../../helpers/in-memory-prisma';

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
    expect(sameHash(hashToken(raw), hash)).toBe(true);
    // The hash is a real Uint8Array (Prisma Bytes-compatible), not a Node Buffer.
    expect(hash).toBeInstanceOf(Uint8Array);
    expect(hash.buffer).toBeInstanceOf(ArrayBuffer);
  });

  it('distinct raw tokens produce distinct hashes', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.raw).not.toBe(b.raw);
    expect(sameHash(a.hash, b.hash)).toBe(false);
  });

  it('hashToken is deterministic — same raw → same hash', () => {
    const raw = 'abc123';
    expect(sameHash(hashToken(raw), hashToken(raw))).toBe(true);
  });

  it('hashToken contains exactly the SHA-256 bytes of the raw token', () => {
    const raw = 'verify-me-please';
    // Independent SHA-256 computed straight from node:crypto.
    const expected = Uint8Array.from(createHash('sha256').update(raw).digest());
    const actual = hashToken(raw);
    // Same 32 bytes, byte-for-byte.
    expect(actual.length).toBe(32);
    expect(sameHash(actual, expected)).toBe(true);
  });

  it('a generated hash works in Prisma create + query operations (Bytes round-trip)', () => {
    const prisma = new InMemoryPrisma();
    const userId = 'user-bytes-rt';
    const raw = 'round-trip-token';
    const hash = hashToken(raw);

    // Create persists the hash as a Prisma Bytes value.
    prisma.verificationToken.create({
      data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + 60_000) },
    });

    // A different raw token hashes to a different value and must NOT match.
    expect(
      prisma.verificationToken.findFirst({
        where: { userId, tokenHash: hashToken('not-the-same-token') },
      }),
    ).toBeNull();

    // The stored row is found by the exact hash (the lookup used by verifyEmail).
    const stored = prisma.verificationToken.findFirst({
      where: { userId, tokenHash: hashToken(raw) },
    });
    expect(stored).not.toBeNull();
    expect(stored!.userId).toBe(userId);
    expect(sameHash(stored!.tokenHash, hash)).toBe(true);
    // The stored hash is still the SHA-256 of the raw token.
    expect(sameHash(stored!.tokenHash, Uint8Array.from(createHash('sha256').update(raw).digest()))).toBe(true);
  });
});