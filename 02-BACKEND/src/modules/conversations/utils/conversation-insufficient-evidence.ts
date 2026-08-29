import { CONVERSATION_FALLBACKS } from '../constants/conversation.constants';

export function buildInsufficientEvidenceResponse(): string {
  return CONVERSATION_FALLBACKS.insufficientEvidence;
}
