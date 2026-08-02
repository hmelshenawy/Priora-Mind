export const conversationFixture = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  title: 'Stress tools',
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-08-02T12:00:00.000Z'),
  updatedAt: new Date('2026-08-02T12:05:00.000Z'),
  lastMessageAt: new Date('2026-08-02T12:05:00.000Z'),
};

export const assistantSourceFixture = {
  chunkId: 'chunk_abc',
  sourceId: 'cbt-coaching-v1',
  sourceTitle: 'Approved CBT Coaching Source',
  sourceFile: 'approved-cbt.pdf',
  sourceType: 'pdf',
  chunkIndex: 12,
  score: 0.84,
  citationPage: 4,
  pageStart: 4,
  pageEnd: 5,
  citationHeading: 'Grounding skills',
  citationSection: 'paced-breathing',
  textHash: 'sha256:fixture',
  displayOrder: 1,
};

export const assistantMessageFixture = {
  id: '33333333-3333-4333-8333-333333333333',
  conversationId: conversationFixture.id,
  role: 'assistant' as const,
  content: 'A short grounded answer.',
  status: 'COMPLETED' as const,
  route: 'RAG' as const,
  createdAt: new Date('2026-08-02T12:05:02.000Z'),
  completedAt: new Date('2026-08-02T12:05:02.000Z'),
  sources: [assistantSourceFixture],
};
