import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtTokenService, type JwtPayload } from '../tokens/jwt-token.service';
import { RefreshCookieService } from '../tokens/refresh-cookie.service';
import { generateToken, hashToken } from '../tokens/token-hash';
import { EMAIL_PORT, type EmailPort } from '../ports/email.port';
import { hashPassword, verifyPassword } from '../utils/password.util';
import {
  RESEND_ACK_MESSAGE,
  REGISTER_ACK_MESSAGE,
  type LoginInput,
  type LoginResponse,
  type RegisterInput,
  type ResendVerificationInput,
  type VerifyEmailQuery,
  type VerifyEmailResponse,
} from '../dto/auth.dto';
import {
  InvalidCredentialsException,
  TokenExpiredOrUsedException,
  TokenInvalidException,
} from '../constants/auth.errors';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h — single-use, short-lived.

/**
 * Auth domain service (FR-001..FR-004, contracts/auth.md, research D2/D3).
 *
 * Invariants:
 *  - Anti-enumeration: register/resend return an identical acknowledgment
 *    whether or not the account exists; no delivery status is disclosed.
 *  - Verification + refresh tokens are stored ONLY as SHA-256 hashes; the raw
 *    value appears solely in the emailed link / HttpOnly cookie.
 *  - Login failures (unknown email vs wrong password) are indistinguishable.
 *  - Refresh rotation revokes the prior row; logout revokes the active row.
 *  - Nothing sensitive is logged; errors carry a tag/name only.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PORT) private readonly email: EmailPort,
    private readonly tokens: JwtTokenService,
    private readonly cookies: RefreshCookieService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterInput): Promise<{ message: string }> {
    const email = normalizeEmail(input.email);
    const lang = input.consent_language_code ?? 'en';
    try {
      const existing = await this.prisma.userAccount.findFirst({
        where: { email, deletedAt: null },
      });
      if (!existing) {
        await this.createUnverifiedAccount(email, input.password, lang);
      }
    } catch (err) {
      // Fail without enumeration: log a tag only, return the same acknowledgment.
      this.logger.error(`register_error: ${errName(err)}`);
    }
    return { message: REGISTER_ACK_MESSAGE };
  }

  async resendVerification(input: ResendVerificationInput): Promise<{ message: string }> {
    const email = normalizeEmail(input.email);
    try {
      const user = await this.prisma.userAccount.findFirst({
        where: { email, deletedAt: null },
      });
      if (user && user.status === 'REGISTERED') {
        await this.rotateAndSendVerification(user.id, email, 'en');
      }
    } catch (err) {
      this.logger.error(`resend_error: ${errName(err)}`);
    }
    return { message: RESEND_ACK_MESSAGE };
  }

  async verifyEmail(query: VerifyEmailQuery): Promise<VerifyEmailResponse> {
    const hash = hashToken(query.token);
    const token = await this.prisma.verificationToken.findFirst({
      where: { userId: query.userId, tokenHash: hash },
    });
    if (!token) throw new TokenInvalidException();
    const now = new Date();
    if (token.consumedAt || token.expiresAt.getTime() < now.getTime()) {
      throw new TokenExpiredOrUsedException();
    }
    await this.prisma.$transaction([
      this.prisma.verificationToken.update({
        where: { id: token.id },
        data: { consumedAt: now },
      }),
      this.prisma.userAccount.update({
        where: { id: query.userId },
        data: { status: 'EMAIL_VERIFIED', lastActivityAt: now },
      }),
    ]);
    return { status: 'verified', redirect: '/onboarding/boundary' };
  }

  async login(input: LoginInput, res: Response): Promise<LoginResponse> {
    const email = normalizeEmail(input.email);
    const user = await this.prisma.userAccount.findFirst({
      where: { email, deletedAt: null },
    });
    if (!user) throw new InvalidCredentialsException();
    const ok = await verifyPassword(user.passwordHash, input.password);
    if (!ok) throw new InvalidCredentialsException();
    const accessToken = await this.issueAccessAndRefresh(user, res);
    await this.prisma.userAccount.update({
      where: { id: user.id },
      data: { lastActivityAt: new Date() },
    });
    // US1 placeholder: US3 replaces this with the real OnboardingState/Preferences lookup.
    return { accessToken, profile: { onboarding_state: 'NOT_STARTED', language_code: null } };
  }

  async refresh(rawRefresh: string | undefined, res: Response): Promise<{ accessToken: string }> {
    if (!rawRefresh) throw new InvalidCredentialsException();
    let payload: JwtPayload;
    try {
      payload = this.tokens.verifyRefreshToken(rawRefresh);
    } catch {
      throw new InvalidCredentialsException();
    }
    const row = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hashToken(rawRefresh) },
    });
    if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
      throw new InvalidCredentialsException();
    }
    const user = await this.prisma.userAccount.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new InvalidCredentialsException();
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    const accessToken = await this.issueAccessAndRefresh(user, res);
    return { accessToken };
  }

  async logout(userId: string, rawRefresh: string | undefined, res: Response): Promise<void> {
    if (rawRefresh) {
      const row = await this.prisma.refreshToken.findFirst({
        where: { tokenHash: hashToken(rawRefresh), userId },
      });
      if (row && !row.revokedAt) {
        await this.prisma.refreshToken.update({
          where: { id: row.id },
          data: { revokedAt: new Date() },
        });
      }
    }
    this.cookies.clear(res);
  }

  // ─────────────────────────── helpers ───────────────────────────

  private async createUnverifiedAccount(
    email: string,
    password: string,
    lang: 'ar' | 'en',
  ): Promise<void> {
    const passwordHash = await hashPassword(password);
    const user = await this.prisma.userAccount.create({
      data: { email, passwordHash, status: 'REGISTERED' },
    });
    await this.rotateAndSendVerification(user.id, email, lang);
  }

  private async rotateAndSendVerification(
    userId: string,
    email: string,
    lang: 'ar' | 'en',
  ): Promise<void> {
    // One unconsumed token per user at a time: clear prior unconsumed rows first.
    await this.prisma.verificationToken.deleteMany({
      where: { userId, consumedAt: null },
    });
    const { raw, hash } = generateToken();
    await this.prisma.verificationToken.create({
      data: {
        userId,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });
    try {
      await this.email.sendVerification({ to: email, token: raw, userId, lang });
    } catch (err) {
      // Delivery failure does not advance the user and does not leak to the caller.
      this.logger.error(`verification_email_error: ${errName(err)}`);
    }
  }

  private async issueAccessAndRefresh(
    user: { id: string; email: string; status: string },
    res: Response,
  ): Promise<string> {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      status: user.status,
    };
    const accessToken = this.tokens.issueAccessToken(payload);
    const refreshJwt = this.tokens.issueRefreshToken(payload);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshJwt),
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
      },
    });
    this.cookies.set(res, refreshJwt);
    return accessToken;
  }

  private refreshTtlMs(): number {
    return Number(this.config.getOrThrow<number>('JWT_REFRESH_TTL_SECONDS')) * 1000;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown';
}