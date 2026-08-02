import { z } from 'zod';
import { CONVERSATION_LIMITS } from './conversation.constants';

export const uuidParamSchema = z.string().uuid();

export const createConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(CONVERSATION_LIMITS.titleMaxLength).optional(),
  })
  .strict();

export const listConversationsQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(CONVERSATION_LIMITS.maxPageSize)
      .default(CONVERSATION_LIMITS.defaultPageSize),
    includeArchived: z
      .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
      .optional()
      .default(false),
  })
  .strict();

export const getConversationQuerySchema = z
  .object({
    messagesCursor: z.string().uuid().optional(),
    messagesLimit: z.coerce
      .number()
      .int()
      .positive()
      .max(CONVERSATION_LIMITS.maxPageSize)
      .default(CONVERSATION_LIMITS.defaultPageSize),
  })
  .strict();

export const patchConversationSchema = z
  .object({
    archived: z.boolean(),
  })
  .strict();

export const sendConversationMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(CONVERSATION_LIMITS.messageMaxLength),
  })
  .strict();

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
export type GetConversationQuery = z.infer<typeof getConversationQuerySchema>;
export type PatchConversationInput = z.infer<typeof patchConversationSchema>;
export type SendConversationMessageInput = z.infer<typeof sendConversationMessageSchema>;

export type ConversationStatusDto = 'ACTIVE' | 'ARCHIVED';
export type ConversationMessageRoleDto = 'user' | 'assistant' | 'system';
export type ConversationMessageRouteDto = 'SAFETY' | 'SYSTEM_COMMAND' | 'STATIC_RESPONSE' | 'RAG';
export type ConversationMessageStatusDto = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ConversationSummaryDto {
  id: string;
  title: string | null;
  status: ConversationStatusDto;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface AssistantSourceDto {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceFile?: string | null;
  sourceType: string;
  chunkIndex: number;
  score: number;
  citationPage?: number | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  citationHeading?: string | null;
  citationSection?: string | null;
  textHash: string;
  displayOrder: number;
}

export interface ConversationMessageDto {
  id: string;
  conversationId: string;
  role: ConversationMessageRoleDto;
  content: string;
  status: ConversationMessageStatusDto;
  route: ConversationMessageRouteDto | null;
  sources: AssistantSourceDto[];
  createdAt: string;
  completedAt: string | null;
}
