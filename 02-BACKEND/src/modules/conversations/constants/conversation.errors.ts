import { HttpException, HttpStatus } from '@nestjs/common';

export type ConversationErrorCode =
  | 'CONVERSATION_NOT_FOUND'
  | 'CONVERSATION_ARCHIVED'
  | 'ONBOARDING_REQUIRED'
  | 'SAFETY_HOLD'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RAG_UNAVAILABLE'
  | 'RAG_TIMEOUT'
  | 'RAG_INVALID_RESPONSE'
  | 'LLM_DISABLED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_TIMEOUT'
  | 'LLM_RATE_LIMITED'
  | 'LLM_INVALID_OUTPUT'
  | 'LLM_UNSAFE_OUTPUT'
  | 'LLM_UNSUPPORTED_CITATION'
  | 'SAFETY_UNAVAILABLE'
  | 'CITATION_VALIDATION_FAILED';

export class ConversationHttpException extends HttpException {
  constructor(code: ConversationErrorCode, status: HttpStatus) {
    super({ error: { code } }, status);
  }
}

export class ConversationNotFoundException extends ConversationHttpException {
  constructor() {
    super('CONVERSATION_NOT_FOUND', HttpStatus.NOT_FOUND);
  }
}

export class ConversationArchivedException extends ConversationHttpException {
  constructor() {
    super('CONVERSATION_ARCHIVED', HttpStatus.CONFLICT);
  }
}

export class ConversationOnboardingRequiredException extends ConversationHttpException {
  constructor() {
    super('ONBOARDING_REQUIRED', HttpStatus.FORBIDDEN);
  }
}

export class ConversationSafetyHoldException extends ConversationHttpException {
  constructor() {
    super('SAFETY_HOLD', HttpStatus.CONFLICT);
  }
}

export class ConversationIdempotencyConflictException extends ConversationHttpException {
  constructor() {
    super('IDEMPOTENCY_CONFLICT', HttpStatus.CONFLICT);
  }
}
