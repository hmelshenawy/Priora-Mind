import { CONVERSATION_FALLBACKS } from './conversation.constants';

export function buildInsufficientEvidenceResponse(): string {
  return CONVERSATION_FALLBACKS.insufficientEvidence;
}
