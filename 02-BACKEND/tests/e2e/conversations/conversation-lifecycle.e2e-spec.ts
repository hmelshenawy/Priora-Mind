import { describe, expect, it, vi } from 'vitest';
import { ConversationAccessService } from '../../../src/modules/conversations/services/conversation-access.service';
import { ConversationLifecycleService } from '../../../src/modules/conversations/services/conversation-lifecycle.service';
import type { ConversationRepository } from '../../../src/modules/conversations/repositories/conversation.repository';
import type { ConversationMessageRepository } from '../../../src/modules/conversations/repositories/conversation-message.repository';

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'user-1',
  title: 'Stress tools',
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-08-02T12:00:00Z'),
  updatedAt: new Date('2026-08-02T12:00:00Z'),
  lastMessageAt: null,
};

function makeService() {
  const access = new ConversationAccessService({
    onboardingState: { findFirst: async () => ({ state: 'COMPLETED' }) },
  } as never);
  const conversations = {
    create: vi.fn().mockResolvedValue(row),
    list: vi.fn().mockResolvedValue({ items: [row], nextCursor: null }),
    findOwned: vi.fn().mockResolvedValue(row),
    setArchived: vi.fn().mockResolvedValue({ ...row, status: 'ARCHIVED' }),
    deleteOwned: vi.fn().mockResolvedValue(true),
  } as unknown as ConversationRepository;
  const messages = {
    listByConversation: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  } as unknown as ConversationMessageRepository;
  return {
    service: new ConversationLifecycleService(access, conversations, messages),
    conversations,
  };
}

describe('conversation lifecycle', () => {
  it('creates, lists, retrieves, archives, unarchives, and deletes owner-scoped conversations', async () => {
    const { service, conversations } = makeService();
    await expect(service.create('user-1', { title: 'Stress tools' })).resolves.toMatchObject({
      conversation: { id: row.id, title: 'Stress tools', status: 'ACTIVE' },
    });
    await expect(
      service.list('user-1', { limit: 25, includeArchived: false }),
    ).resolves.toMatchObject({
      items: [{ id: row.id }],
    });
    await expect(service.get('user-1', row.id, undefined, 25)).resolves.toMatchObject({
      conversation: { id: row.id },
      messages: [],
    });
    await expect(service.patch('user-1', row.id, { archived: true })).resolves.toMatchObject({
      conversation: { status: 'ARCHIVED' },
    });
    await expect(service.delete('user-1', row.id)).resolves.toBeUndefined();
    expect(conversations.findOwned).toHaveBeenCalledWith('user-1', row.id);
  });

  it('returns CONVERSATION_NOT_FOUND for missing or foreign conversations', async () => {
    const { service, conversations } = makeService();
    vi.mocked(conversations.findOwned).mockResolvedValueOnce(null);
    await expect(service.get('user-2', row.id, undefined, 25)).rejects.toMatchObject({
      response: { error: { code: 'CONVERSATION_NOT_FOUND' } },
    });
  });
});
