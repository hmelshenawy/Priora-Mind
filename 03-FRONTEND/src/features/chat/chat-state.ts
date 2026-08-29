import type { ConversationMessageDto } from '@priora/shared-types';

export type ChatMessageState =
  | 'pending'
  | 'completed'
  | 'clarification'
  | 'insufficientEvidence'
  | 'safety'
  | 'technicalFailure';

const INSUFFICIENT_HINTS = ['not enough grounded', 'not enough information', 'insufficient evidence'];
const CLARIFICATION_HINTS = ['clarify', 'what do you mean', 'could you tell me more'];

export function mapMessageState(message: ConversationMessageDto): ChatMessageState {
  if (message.status === 'PENDING' || message.status === 'PROCESSING') return 'pending';
  if (message.status === 'FAILED') return 'technicalFailure';
  if (message.route === 'SAFETY') return 'safety';

  const content = message.content.toLowerCase();
  if (INSUFFICIENT_HINTS.some((hint) => content.includes(hint))) return 'insufficientEvidence';
  if (CLARIFICATION_HINTS.some((hint) => content.includes(hint))) return 'clarification';
  return 'completed';
}
