import type { ConversationSummaryDto } from '@priora/shared-types';

export function selectContinueChatTarget(activeConversations: ConversationSummaryDto[]): ConversationSummaryDto | undefined {
  return activeConversations[0];
}
