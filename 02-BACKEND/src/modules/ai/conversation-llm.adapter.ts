import { Injectable } from '@nestjs/common';
import type {
  ConversationAiPort,
  FollowUpRewriteRequest,
  FollowUpRewriteResult,
  GroundedAnswerRequest,
  GroundedAnswerResult,
} from './conversation-ai.port';

export type ConversationLlmFailureCode =
  | 'LLM_DISABLED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_TIMEOUT'
  | 'LLM_RATE_LIMITED'
  | 'LLM_INVALID_OUTPUT'
  | 'LLM_UNSAFE_OUTPUT'
  | 'LLM_UNSUPPORTED_CITATION';

export class ConversationLlmError extends Error {
  constructor(readonly code: ConversationLlmFailureCode) {
    super(code);
  }
}

export function normalizeConversationLlmError(error: unknown): ConversationLlmFailureCode {
  if (error instanceof ConversationLlmError) return error.code;
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'LLM_TIMEOUT';
    if (/rate/i.test(error.message)) return 'LLM_RATE_LIMITED';
    if (/disabled|not_configured/i.test(error.message)) return 'LLM_DISABLED';
    if (/invalid|malformed/i.test(error.message)) return 'LLM_INVALID_OUTPUT';
    if (/unsafe/i.test(error.message)) return 'LLM_UNSAFE_OUTPUT';
  }
  return 'LLM_UNAVAILABLE';
}

@Injectable()
export class ConversationLlmAdapter implements ConversationAiPort {
  async generateGroundedAnswer(_request: GroundedAnswerRequest): Promise<GroundedAnswerResult> {
    throw new ConversationLlmError('LLM_DISABLED');
  }

  async rewriteFollowUp(_request: FollowUpRewriteRequest): Promise<FollowUpRewriteResult> {
    throw new ConversationLlmError('LLM_DISABLED');
  }
}
