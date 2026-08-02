import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateConversationInput, ListConversationsQuery } from './conversation.dto';

export interface ConversationRow {
  id: string;
  userId: string;
  title: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
}

type Db = {
  conversation: {
    create(args: { data: Record<string, unknown> }): Promise<ConversationRow>;
    findFirst(args: { where: Record<string, unknown> }): Promise<ConversationRow | null>;
    findMany(args: Record<string, unknown>): Promise<ConversationRow[]>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<ConversationRow>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
};

@Injectable()
export class ConversationRepository {
  private readonly db: Db;

  constructor(prisma: PrismaService) {
    this.db = prisma as unknown as Db;
  }

  create(userId: string, input: CreateConversationInput): Promise<ConversationRow> {
    const now = new Date();
    return this.db.conversation.create({
      data: {
        userId,
        title: input.title ?? null,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        lastMessageAt: null,
      },
    });
  }

  async list(
    userId: string,
    query: ListConversationsQuery,
  ): Promise<{ items: ConversationRow[]; nextCursor: string | null }> {
    const where: Record<string, unknown> = { userId };
    if (!query.includeArchived) where.status = 'ACTIVE';
    const rows = await this.db.conversation.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, query.limit);
    return { items, nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null };
  }

  findOwned(userId: string, conversationId: string): Promise<ConversationRow | null> {
    return this.db.conversation.findFirst({ where: { id: conversationId, userId } });
  }

  async setArchived(
    userId: string,
    conversationId: string,
    archived: boolean,
  ): Promise<ConversationRow | null> {
    const updated = await this.db.conversation.updateMany({
      where: { id: conversationId, userId },
      data: { status: archived ? 'ARCHIVED' : 'ACTIVE', updatedAt: new Date() },
    });
    if (updated.count !== 1) return null;
    return this.findOwned(userId, conversationId);
  }

  async deleteOwned(userId: string, conversationId: string): Promise<boolean> {
    const deleted = await this.db.conversation.deleteMany({
      where: { id: conversationId, userId },
    });
    return deleted.count === 1;
  }

  async touchAfterMessage(userId: string, conversationId: string, at: Date): Promise<void> {
    await this.db.conversation.updateMany({
      where: { id: conversationId, userId },
      data: { updatedAt: at, lastMessageAt: at },
    });
  }
}
