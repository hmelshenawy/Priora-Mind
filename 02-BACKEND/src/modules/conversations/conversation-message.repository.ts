import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ConversationMessageRow {
  id: string;
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  route: 'SAFETY' | 'SYSTEM_COMMAND' | 'STATIC_RESPONSE' | 'RAG' | null;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  idempotencyKey: string | null;
  respondsToMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  sources?: AssistantMessageSourceRow[];
}

export interface AssistantMessageSourceRow {
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

type Db = {
  conversationMessage: {
    create(args: {
      data: Record<string, unknown>;
      include?: Record<string, unknown>;
    }): Promise<ConversationMessageRow>;
    findFirst(args: {
      where: Record<string, unknown>;
      include?: Record<string, unknown>;
    }): Promise<ConversationMessageRow | null>;
    findMany(args: Record<string, unknown>): Promise<ConversationMessageRow[]>;
  };
};

@Injectable()
export class ConversationMessageRepository {
  private readonly db: Db;

  constructor(prisma: PrismaService) {
    this.db = prisma as unknown as Db;
  }

  findUserMessageByIdempotency(userId: string, conversationId: string, idempotencyKey: string) {
    return this.db.conversationMessage.findFirst({
      where: { userId, conversationId, idempotencyKey, role: 'user' },
      include: { sources: true },
    });
  }

  findAssistantForUserMessage(userId: string, conversationId: string, userMessageId: string) {
    return this.db.conversationMessage.findFirst({
      where: { userId, conversationId, respondsToMessageId: userMessageId, role: 'assistant' },
      include: { sources: true },
    });
  }

  createUserMessage(
    userId: string,
    conversationId: string,
    content: string,
    idempotencyKey: string,
    now = new Date(),
  ) {
    return this.db.conversationMessage.create({
      data: {
        conversationId,
        userId,
        role: 'user',
        content,
        route: null,
        status: 'COMPLETED',
        idempotencyKey,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });
  }

  createAssistantMessage(
    userId: string,
    conversationId: string,
    respondsToMessageId: string,
    content: string,
    route: 'SAFETY' | 'SYSTEM_COMMAND' | 'STATIC_RESPONSE' | 'RAG' = 'STATIC_RESPONSE',
    status: 'COMPLETED' | 'FAILED' = 'COMPLETED',
    processingStage: string | null = null,
    failureCode: string | null = null,
    failureDetail: string | null = null,
    now = new Date(),
    options: {
      reason?: string | null;
      standaloneRetrievalQuery?: string | null;
      provider?: string | null;
      modelId?: string | null;
      tokenUsage?: Record<string, unknown> | null;
      latencyMs?: number | null;
      sources?: AssistantMessageSourceRow[];
    } = {},
  ) {
    return this.db.conversationMessage.create({
      data: {
        conversationId,
        userId,
        role: 'assistant',
        content,
        route,
        status,
        idempotencyKey: null,
        respondsToMessageId,
        processingStage,
        reason: options.reason ?? null,
        failureCode,
        failureDetail,
        standaloneRetrievalQuery: options.standaloneRetrievalQuery ?? null,
        provider: options.provider ?? null,
        modelId: options.modelId ?? null,
        tokenUsage: options.tokenUsage ?? null,
        latencyMs: options.latencyMs ?? null,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
        ...(options.sources?.length
          ? {
              sources: {
                create: options.sources.map((source) => ({
                  chunkId: source.chunkId,
                  sourceId: source.sourceId,
                  sourceTitle: source.sourceTitle,
                  sourceFile: source.sourceFile ?? null,
                  sourceType: source.sourceType,
                  chunkIndex: source.chunkIndex,
                  score: source.score,
                  citationPage: source.citationPage ?? null,
                  pageStart: source.pageStart ?? null,
                  pageEnd: source.pageEnd ?? null,
                  citationHeading: source.citationHeading ?? null,
                  citationSection: source.citationSection ?? null,
                  textHash: source.textHash,
                  displayOrder: source.displayOrder,
                })),
              },
            }
          : {}),
      },
      include: { sources: true },
    });
  }

  createAssistantFailure(
    userId: string,
    conversationId: string,
    respondsToMessageId: string,
    content: string,
    route: 'SAFETY' | 'SYSTEM_COMMAND' | 'STATIC_RESPONSE' | 'RAG',
    processingStage: string,
    failureCode: string,
    failureDetail: string,
    now = new Date(),
  ) {
    return this.createAssistantMessage(
      userId,
      conversationId,
      respondsToMessageId,
      content,
      route,
      'FAILED',
      processingStage,
      failureCode,
      failureDetail,
      now,
    );
  }

  findRecentCompletedMessages(userId: string, conversationId: string, limit: number) {
    return this.db.conversationMessage.findMany({
      where: { userId, conversationId, status: 'COMPLETED', role: { in: ['user', 'assistant'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { role: true, content: true, createdAt: true, id: true },
    }) as unknown as Promise<Array<{ role: 'user' | 'assistant'; content: string }>>;
  }

  async listByConversation(conversationId: string, cursor: string | undefined, limit: number) {
    const rows = await this.db.conversationMessage.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { sources: true },
    });
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
  }
}
