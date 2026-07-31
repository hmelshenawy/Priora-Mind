import { Injectable } from '@nestjs/common';
import type { EmailPort, VerificationEmailInput } from './email.port';

/**
 * In-memory email adapter for development and automated tests (research D2).
 * Captures every sent message so tests can assert recipient + language + that a
 * token was delivered, without touching the network. Never throws on "send"
 * — production failure paths are exercised via a separate throwing stub.
 */
@Injectable()
export class FakeEmailAdapter implements EmailPort {
  private readonly captured: VerificationEmailInput[] = [];

  async sendVerification(input: VerificationEmailInput): Promise<void> {
    this.captured.push(input);
  }

  /** All messages captured since the last reset, in send order. */
  get messages(): readonly VerificationEmailInput[] {
    return this.captured;
  }

  get last(): VerificationEmailInput | undefined {
    return this.captured.at(-1);
  }

  /** Number of messages captured (convenience for assertions). */
  get count(): number {
    return this.captured.length;
  }

  reset(): void {
    this.captured.length = 0;
  }
}