import type { ConversationListResponse } from '@priora/shared-types';
import { apiFetch } from '../../lib/api-client';

export const HOME_RECENT_CONVERSATIONS_LIMIT = 5;

export function getRecentConversations(limit = HOME_RECENT_CONVERSATIONS_LIMIT): Promise<ConversationListResponse> {
  const params = new URLSearchParams({ includeArchived: 'false', limit: String(limit) });
  return apiFetch<ConversationListResponse>(`/api/v1/conversations?${params.toString()}`);
}
