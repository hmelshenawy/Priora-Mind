import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailPort, VerificationEmailInput } from './email.port';

/**
 * Production email adapter (research D2). Integrates a config-selected
 * transactional email provider over its HTTP API. The specific provider is
 * chosen at deployment via `EMAIL_PROVIDER`/`EMAIL_API_BASE_URL`/`EMAIL_API_KEY`/
 * `EMAIL_FROM` — Auth never depends on a vendor SDK type.
 *
 * Fail-safe: any non-2xx response or network error throws; the caller
 * (AuthService) catches, logs a REDACTED context only, and returns the
 * anti-enumeration response (FR-004 — no delivery-status disclosure). The
 * email body / token / recipient are never logged.
 */
@Injectable()
export class HttpEmailProviderAdapter implements EmailPort {
  private readonly logger = new Logger(HttpEmailProviderAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async sendVerification(input: VerificationEmailInput): Promise<void> {
    const baseUrl = this.config.get<string>('EMAIL_API_BASE_URL');
    const apiKey = this.config.get<string>('EMAIL_API_KEY');
    if (!baseUrl || !apiKey) {
      throw new Error('email_provider_not_configured');
    }

    const link = this.buildLink(input);
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: input.to,
        from: this.config.getOrThrow<string>('EMAIL_FROM'),
        language: input.lang,
        // Provider receives the verification link only; it must not log the token.
        html: `<a href="${link}">${link}</a>`,
      }),
    }).catch(() => {
      throw new Error('email_provider_unreachable');
    });

    if (!res.ok) {
      // Status code is non-sensitive; the token/recipient never are logged.
      this.logger.warn(`email provider rejected verification send: ${res.status}`);
      throw new Error(`email_provider_rejected_${res.status}`);
    }
  }

  private buildLink(input: VerificationEmailInput): string {
    const appUrl = this.config.get<string>('PUBLIC_APP_URL') ?? 'http://localhost:3001';
    const params = new URLSearchParams({ token: input.token, userId: input.userId });
    return `${appUrl.replace(/\/$/, '')}/${input.lang}/verify-email?${params.toString()}`;
  }
}