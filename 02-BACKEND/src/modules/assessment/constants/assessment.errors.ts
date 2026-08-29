import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Assessment error codes (contracts/assessment.md). Each carries a stable
 * machine-readable code and never echoes submitted answer values (FR-037,
 * research D7).
 */

/** The active assessment does not exist for this user (FR-013). 404. */
export class AssessmentNotFoundException extends HttpException {
  constructor() {
    super({ error: { code: 'ASSESSMENT_NOT_FOUND' } }, HttpStatus.NOT_FOUND);
  }
}

/** Unknown question id (not in the active definition). 404. */
export class QuestionNotFoundException extends HttpException {
  constructor() {
    super({ error: { code: 'QUESTION_NOT_FOUND' } }, HttpStatus.NOT_FOUND);
  }
}

/** Required questions are missing on submit (FR-014a). 409 INCOMPLETE. */
export class IncompleteAssessmentException extends HttpException {
  constructor(readonly missing: string[]) {
    super({ error: { code: 'INCOMPLETE', missing } }, HttpStatus.CONFLICT);
  }
}

/** Restart is not permitted after the assessment is scored (no retake, FR-018a). 409. */
export class RestartNotAllowedException extends HttpException {
  constructor() {
    super({ error: { code: 'RESTART_NOT_ALLOWED' } }, HttpStatus.CONFLICT);
  }
}

/** A result has not been produced yet (GET /assessment/result before SCORED). 404. */
export class ResultNotFoundException extends HttpException {
  constructor() {
    super({ error: { code: 'RESULT_NOT_FOUND' } }, HttpStatus.NOT_FOUND);
  }
}

/**
 * US8 (FR-034, SC-007): saved progress is inconsistent with the current
 * assessment definition — the active assessment's `definitionVersion` no longer
 * matches the current definition and the user has saved answers (IN_PROGRESS).
 * 409 — fail-closed: the user MUST restart safely; NO partial result is
 * presented as complete. Submit refuses to score stale answers; the user is
 * steered to GET /assessment (`requires_safe_restart`) → POST /assessment/restart,
 * which re-anchors the assessment to the current definition. Never echoes
 * assessment answers (FR-037).
 */
export class AssessmentCorruptException extends HttpException {
  constructor() {
    super(
      { error: { code: 'ASSESSMENT_CORRUPT', requires_safe_restart: true } },
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * Result suppression while `OnboardingState = SAFETY_HOLD` (FR-019b, Assessment
 * §9). 409 — the normal result MUST NOT be presented and onboarding MUST NOT
 * complete while in SAFETY_HOLD. US5 ships the suppression guard; US6 sets
 * SAFETY_HOLD (via the deterministic safety classifier) and optionally enriches
 * the payload with the approved `safety_route` (HIGH_RISK/CRISIS copy + action,
 * contracts/assessment.md). Never echoes assessment answers (FR-037).
 */
export class SafetyHoldException extends HttpException {
  constructor(safetyRoute?: unknown) {
    super(
      safetyRoute ? { error: { code: 'SAFETY_HOLD', safety_route: safetyRoute } } : { error: { code: 'SAFETY_HOLD' } },
      HttpStatus.CONFLICT,
    );
  }
}