import type {
  AssistantSourceDto,
  ConversationMessageDto,
  ConversationSummaryDto,
} from './conversation.dto';

export interface ConversationRowLike {
  id: string;
  title: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
}

export interface AssistantSourceRowLike {
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

export interface ConversationMessageRowLike {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  route: 'SAFETY' | 'SYSTEM_COMMAND' | 'STATIC_RESPONSE' | 'RAG' | null;
  createdAt: Date;
  completedAt: Date | null;
  sources?: AssistantSourceRowLike[];
}

export function presentConversation(row: ConversationRowLike): ConversationSummaryDto {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
  };
}

export function presentAssistantSource(row: AssistantSourceRowLike): AssistantSourceDto {
  return {
    chunkId: row.chunkId,
    sourceId: row.sourceId,
    sourceTitle: row.sourceTitle,
    sourceFile: row.sourceFile ?? null,
    sourceType: row.sourceType,
    chunkIndex: row.chunkIndex,
    score: row.score,
    citationPage: row.citationPage ?? null,
    pageStart: row.pageStart ?? null,
    pageEnd: row.pageEnd ?? null,
    citationHeading: row.citationHeading ?? null,
    citationSection: row.citationSection ?? null,
    textHash: row.textHash,
    displayOrder: row.displayOrder,
  };
}

export function presentConversationMessage(
  row: ConversationMessageRowLike,
): ConversationMessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    status: row.status,
    route: row.route,
    sources: (row.sources ?? []).map(presentAssistantSource),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}
