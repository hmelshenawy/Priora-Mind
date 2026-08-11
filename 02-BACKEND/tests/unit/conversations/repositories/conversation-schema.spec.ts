import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(__dirname, '../../../../prisma/schema.prisma'), 'utf8');

describe('conversation Prisma schema foundation', () => {
  it('defines conversation, message, and source models with cascade relations', () => {
    expect(schema).toContain('model Conversation {');
    expect(schema).toContain('model ConversationMessage {');
    expect(schema).toContain('model AssistantMessageSource {');
    expect(schema).toContain('onDelete: Cascade');
  });

  it('defines indexes and uniqueness required for ownership, pagination, and idempotency', () => {
    expect(schema).toContain('@@index([userId, status, updatedAt])');
    expect(schema).toContain('@@index([conversationId, createdAt, id])');
    expect(schema).toContain('@@unique([userId, conversationId, idempotencyKey])');
    expect(schema).toContain('respondsToMessageId      String?                    @unique');
    expect(schema).toContain('@@unique([messageId, chunkId])');
  });
});
