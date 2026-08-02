-- Spec 004: conversation lifecycle, message persistence, and assistant source snapshots.

CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "ConversationMessageRole" AS ENUM ('user', 'assistant', 'system');
CREATE TYPE "ConversationMessageRoute" AS ENUM ('SAFETY', 'SYSTEM_COMMAND', 'STATIC_RESPONSE', 'RAG');
CREATE TYPE "ConversationMessageStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT,
  "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt" TIMESTAMP(3),
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "ConversationMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "route" "ConversationMessageRoute",
  "status" "ConversationMessageStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT,
  "respondsToMessageId" TEXT,
  "processingStage" TEXT,
  "reason" TEXT,
  "failureCode" TEXT,
  "failureDetail" TEXT,
  "standaloneRetrievalQuery" TEXT,
  "provider" TEXT,
  "modelId" TEXT,
  "tokenUsage" JSONB,
  "latencyMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantMessageSource" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "chunkId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceTitle" TEXT NOT NULL,
  "sourceFile" TEXT,
  "sourceType" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "citationPage" INTEGER,
  "pageStart" INTEGER,
  "pageEnd" INTEGER,
  "citationHeading" TEXT,
  "citationSection" TEXT,
  "textHash" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantMessageSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Conversation_userId_status_updatedAt_idx" ON "Conversation"("userId", "status", "updatedAt");
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");
CREATE UNIQUE INDEX "ConversationMessage_userId_conversationId_idempotencyKey_key" ON "ConversationMessage"("userId", "conversationId", "idempotencyKey");
CREATE UNIQUE INDEX "ConversationMessage_respondsToMessageId_key" ON "ConversationMessage"("respondsToMessageId");
CREATE INDEX "ConversationMessage_conversationId_createdAt_id_idx" ON "ConversationMessage"("conversationId", "createdAt", "id");
CREATE INDEX "ConversationMessage_userId_conversationId_idx" ON "ConversationMessage"("userId", "conversationId");
CREATE UNIQUE INDEX "AssistantMessageSource_messageId_chunkId_key" ON "AssistantMessageSource"("messageId", "chunkId");
CREATE INDEX "AssistantMessageSource_messageId_displayOrder_idx" ON "AssistantMessageSource"("messageId", "displayOrder");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_respondsToMessageId_fkey" FOREIGN KEY ("respondsToMessageId") REFERENCES "ConversationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantMessageSource" ADD CONSTRAINT "AssistantMessageSource_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ConversationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
