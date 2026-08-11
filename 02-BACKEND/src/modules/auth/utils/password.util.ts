import argon2 from 'argon2';

/**
 * Argon2id password hashing (research D3, SAD §13).
 * Pure utility — no framework dependencies, safe to unit-test in isolation.
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed hash → never accept.
    return false;
  }
}