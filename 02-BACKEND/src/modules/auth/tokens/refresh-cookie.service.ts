import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';

/**
 * Refresh-token cookie helper (research D3, SAD §13).
 * The refresh token lives ONLY in an HttpOnly, Secure, SameSite=strict cookie
 * scoped to the auth path — never in localStorage or JS-readable storage.
 * The access token is kept in memory on the client (wired in frontend task T015).
 */
export const REFRESH_COOKIE_NAME = 'priora_refresh';

@Injectable()
export class RefreshCookieService {
  constructor(private readonly config: ConfigService) {}

  set(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE_NAME, token, this.options());
  }

  clear(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, this.options());
  }

  private options(): CookieOptions {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const maxAge = Number(this.config.getOrThrow<number>('JWT_REFRESH_TTL_SECONDS')) * 1000;
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge,
    };
  }
}