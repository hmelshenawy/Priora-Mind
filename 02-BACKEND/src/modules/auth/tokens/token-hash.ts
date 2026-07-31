import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque single-use token generation + hashing (research D2).
 *
 * The raw token (32 random bytes, hex-encoded) is returned to the caller so it
 * can be placed in the verification link / refresh cookie. ONLY the SHA-256 hash
 * is persisted (VerificationToken.tokenHash / RefreshToken.tokenHash). The raw
 * value is never stored and never logged.
 *
 * Hashes are returned as a real `Uint8Array<ArrayBuffer>` (via `Uint8Array.from(...)`)
 * so they are directly assignable to Prisma `Bytes` fields, which expect
 * `Uint8Array<ArrayBuffer>` — not Node's `Buffer<ArrayBufferLike>` that
 * `createHash(...).digest()` returns. The conversion copies the SHA-256 digest
 * into a fresh ArrayBuffer-backed byte array without altering the bytes, so the
 * persisted + queryable representation is unchanged (Postgres `bytea` stores the
 * same bytes whether passed as Buffer or Uint8Array).
 *
 * Pure node:crypto — no framework deps, unit-testable in isolation.
 */
export interface GeneratedToken {
  raw: string;
  hash: Uint8Array<ArrayBuffer>;
}

export function generateToken(): GeneratedToken {
  const raw = randomBytes(32).toString('hex');
  return { raw, hash: hashToken(raw) };
}

/** SHA-256 hash of a raw token; used to look up a stored row from an incoming raw
 *  value. Returns a `Uint8Array<ArrayBuffer>` directly assignable to Prisma `Bytes`. */
export function hashToken(raw: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(createHash('sha256').update(raw).digest());
}

/** Constant-time-ish equality for stored token hashes. Manual byte loop (no reliance
 *  on Buffer/Uint8Array `.equals`, which is engine/lib-dependent and absent on plain
 *  Uint8Array in current Node) so the comparison works for both Buffer and Uint8Array. */
export function sameHash(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}