import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/** Decoded JWT payload shared by access + refresh tokens. */
export interface JwtPayload {
  sub: string;
  email: string;
  status: string;
  iat?: number;
  exp?: number;
}

/**
 * Token primitives (research D3, SAD §13).
 *
 * Issues and verifies short-lived access tokens and rotating refresh tokens.
 * Stateless verification (no DB lookup) so the framework works before the
 * UserAccount/RefreshToken models land in US1. US1's AuthService persists and
 * rotates refresh-token hashes via `RefreshToken` and pairs these primitives
 * with the DB; the refresh-token *hash* is what gets stored, never the token.
 */
@Injectable()
export class JwtTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  issueAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return this.jwt.sign(payload, {
      secret: this.accessSecret(),
      expiresIn: `${this.ttlSeconds('JWT_ACCESS_TTL_SECONDS')}s`,
    });
  }

  issueRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return this.jwt.sign(payload, {
      secret: this.refreshSecret(),
      expiresIn: `${this.ttlSeconds('JWT_REFRESH_TTL_SECONDS')}s`,
    });
  }

  verifyAccessToken(token: string): JwtPayload {
    return this.jwt.verify(token, { secret: this.accessSecret() }) as JwtPayload;
  }

  verifyRefreshToken(token: string): JwtPayload {
    return this.jwt.verify(token, { secret: this.refreshSecret() }) as JwtPayload;
  }

  private accessSecret(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  private refreshSecret(): string {
    return this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  private ttlSeconds(key: string): number {
    return Number(this.config.getOrThrow<number>(key));
  }
}