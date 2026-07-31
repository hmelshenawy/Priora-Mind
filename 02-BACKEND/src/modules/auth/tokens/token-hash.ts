import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque single-use token generation + hashing (research D2).
 *
 * The raw token (32 random bytes, hex-encoded) is returned to the caller so it
 * can be placed in the verification link / refresh cookie. ONLY the SHA-256 hash
 * is persisted (VerificationToken.tokenHash / RefreshToken.tokenHash). The raw
 * value is never stored and never logged.
 *
 * Pure node:crypto — no framework deps, unit-testable in isolation.
 */
export interface GeneratedToken {
  raw: string;
  hash: Buffer;
}

export function generateToken(): GeneratedToken {
  const raw = randomBytes(32).toString('hex');
  return { raw, hash: hashToken(raw) };
}

/** SHA-256 hash of a raw token; used to look up a stored row from an incoming raw value. */
export function hashToken(raw: string): Buffer {
  return createHash('sha256').update(raw).digest();
}

/** Constant-time-ish equality for stored token hashes (Buffer.equals). */
export function sameHash(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && a.equals(b);
}