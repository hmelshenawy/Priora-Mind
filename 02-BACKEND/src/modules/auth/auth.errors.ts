import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Auth error codes (contracts/auth.md). Each carries a stable machine-readable
 * code and no identifying or sensitive detail (FR-004 / FR-030).
 */

/** Unknown email and wrong password are indistinguishable (FR-004). */
export class InvalidCredentialsException extends HttpException {
  constructor() {
    super({ error: { code: 'INVALID_CREDENTIALS' } }, HttpStatus.UNAUTHORIZED);
  }
}

/** The token never matched a row for this user (wrong / rotated-away link). */
export class TokenInvalidException extends HttpException {
  constructor() {
    super({ error: { code: 'TOKEN_INVALID' } }, HttpStatus.BAD_REQUEST);
  }
}

/** The token was already used or has expired (re-verification is idempotent → 410). */
export class TokenExpiredOrUsedException extends HttpException {
  constructor() {
    super({ error: { code: 'TOKEN_EXPIRED_OR_USED' } }, HttpStatus.GONE);
  }
}