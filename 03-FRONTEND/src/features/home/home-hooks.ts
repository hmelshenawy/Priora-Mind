'use client';

import { useQuery } from '@tanstack/react-query';
import { getRecentConversations } from './home.api';

export const recentConversationsKey = (limit: number) => ['chat', 'conversations', 'recent', { limit }] as const;

export function useRecentConversationsQuery(limit: number) {
  return useQuery({
    queryKey: recentConversationsKey(limit),
    queryFn: () => getRecentConversations(limit),
    retry: false,
  });
}
