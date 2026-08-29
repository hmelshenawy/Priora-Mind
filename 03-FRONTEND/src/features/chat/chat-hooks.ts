'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationDetailResponse, ConversationListResponse } from '@priora/shared-types';
import { conversationApi } from './chat.api';

export const conversationListKey = (includeArchived: boolean) => ['chat', 'conversations', { includeArchived }] as const;
export const conversationDetailKey = (conversationId?: string) => ['chat', 'conversation', conversationId] as const;

export function useConversationListQuery(includeArchived: boolean) {
  return useQuery({
    queryKey: conversationListKey(includeArchived),
    queryFn: () => conversationApi.list(includeArchived),
    retry: false,
  });
}

export function useConversationDetailQuery(conversationId?: string) {
  return useQuery({
    queryKey: conversationDetailKey(conversationId),
    queryFn: () => conversationApi.retrieve(conversationId ?? ''),
    enabled: Boolean(conversationId),
    retry: false,
  });
}

export function useCreateConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => conversationApi.create(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] }),
  });
}

export function useSendMessageMutation(conversationId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ content, idempotencyKey }: { content: string; idempotencyKey: string }) => conversationApi.send(conversationId ?? '', content, idempotencyKey),
    onSuccess: (data) => {
      queryClient.setQueryData<ConversationDetailResponse>(conversationDetailKey(conversationId), (current) => current ? { ...current, messages: [...current.messages, data.userMessage, data.assistantMessage] } : current);
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
  });
}

export function useSetArchivedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, archived }: { conversationId: string; archived: boolean }) => conversationApi.setArchived(conversationId, archived),
    onSuccess: (data, variables) => {
      queryClient.setQueryData<ConversationListResponse>(conversationListKey(false), (current) => current ? { ...current, items: current.items.filter((item) => item.id !== variables.conversationId) } : current);
      queryClient.setQueryData<ConversationListResponse>(conversationListKey(true), (current) => current ? { ...current, items: current.items.map((item) => item.id === variables.conversationId ? data.conversation : item) } : current);
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
  });
}

export function useDeleteConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => conversationApi.remove(conversationId),
    onSuccess: (_data, conversationId) => {
      queryClient.setQueryData<ConversationListResponse>(conversationListKey(false), (current) => current ? { ...current, items: current.items.filter((item) => item.id !== conversationId) } : current);
      queryClient.setQueryData<ConversationListResponse>(conversationListKey(true), (current) => current ? { ...current, items: current.items.filter((item) => item.id !== conversationId) } : current);
      void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
  });
}
