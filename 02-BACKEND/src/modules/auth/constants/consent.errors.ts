import { HttpException, HttpStatus } from '@nestjs/common';
import type { VersionSet } from '../dto/consent.dto';

/**
 * Consent error codes (contracts/consent.md, Consent policy §12). Each carries a
 * stable machine-readable code and never echoes submitted values or notice copy.
 */

/**
 * Fail-closed (FR-007): the current notice versions cannot be determined, so
 * consent MUST NOT be recorded and onboarding cannot advance. 503.
 */
export class NoticesUnavailableException extends HttpException {
  constructor() {
    super({ error: { code: 'NOTICES_UNAVAILABLE' } }, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

/**
 * The submitted versions do not match the current NoticeVersionSet (FR-008) — the
 * client must re-present the current notices and re-consent. 409. Carries the
 * current versions so the client can update without an extra round-trip.
 */
export class ReconsentRequiredException extends HttpException {
  constructor(currentVersions: VersionSet) {
    super({ error: { code: 'RECONSENT_REQUIRED', current_versions: currentVersions } }, HttpStatus.CONFLICT);
  }
}

/**
 * One or more required acknowledgments were false/missing (Consent §4) — no
 * advance, no record written. 400.
 */
export class AcknowledgmentsIncompleteException extends HttpException {
  constructor() {
    super({ error: { code: 'ACKNOWLEDGMENTS_INCOMPLETE' } }, HttpStatus.BAD_REQUEST);
  }
}