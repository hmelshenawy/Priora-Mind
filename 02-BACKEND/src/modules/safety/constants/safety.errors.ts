import { HttpException, HttpStatus } from '@nestjs/common';
import { SAFETY_COPY, type BilingualEntry } from './safety-definition';

/**
 * Safety error codes (contracts/safety.md). Safety fails CLOSED (FR-025, Safety
 * Matrix §10): any evaluation error blocks the result/completion and surfaces the
 * approved unavailable copy. Never echoes safety answers, reasons, or copy content
 * beyond the approved deterministic fallback (FR-030/FR-037, Safety Matrix §10).
 */

/** Safety evaluation could not be completed (fail-closed, FR-025, Safety §10).
 * 503 — the assessment cannot continue and no result/completion is permitted. The
 * payload carries the approved UNAVAILABLE copy (EN + AR) so the client can render
 * the deterministic fallback without inventing content. */
export class SafetyUnavailableException extends HttpException {
  constructor() {
    super(
      { error: { code: 'SAFETY_UNAVAILABLE', copy: SafetyUnavailableException.copy } },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  static get copy(): BilingualEntry {
    return { en: SAFETY_COPY.UNAVAILABLE.en, ar: SAFETY_COPY.UNAVAILABLE.ar };
  }
}

/** Reduce an unknown error to a coarse name for the log line (no message/stack that
 * could carry safety answers — FR-030, Safety Matrix §10). Shared by the safety
 * services (Constitution VIII split). */
export function errName(e: unknown): string {
  if (e instanceof Error) return e.constructor.name;
  return 'unknown';
}