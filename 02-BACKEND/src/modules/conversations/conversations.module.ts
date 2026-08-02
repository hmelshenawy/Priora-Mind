import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConversationAccessService } from './conversation-access.service';
import { ConversationIdempotencyService } from './conversation-idempotency.service';
import { ConversationLifecycleService } from './conversation-lifecycle.service';
import { ConversationMessageRepository } from './conversation-message.repository';
import { ConversationMessageService } from './conversation-message.service';
import { ConversationRouterService } from './conversation-router.service';
import { ConversationRepository } from './conversation.repository';
import { ConversationSafetyService } from './conversation-safety.service';
import { ConversationsController } from './conversations.controller';
import { CONVERSATION_AI_PORT } from '../ai/conversation-ai.port';
import { ConversationLlmAdapter } from '../ai/conversation-llm.adapter';
import { ConversationCitationMapper } from './conversation-citation-mapper';
import { ConversationContextService } from './conversation-context.service';
import { ConversationFollowUpDetector } from './conversation-follow-up-detector';
import { ConversationFollowUpRewriteService } from './conversation-follow-up-rewrite.service';
import { ConversationGroundingService } from './conversation-grounding.service';
import { ConversationPromptBuilder } from './conversation-prompt-builder';
import { CONVERSATION_RAG_CLIENT_PORT } from './rag/conversation-rag-client.port';
import { ConversationRagApiClientService } from './rag/conversation-rag-client.service';

@Module({
  imports: [PrismaModule],
  controllers: [ConversationsController],
  providers: [
    ConversationAccessService,
    ConversationRepository,
    ConversationMessageRepository,
    ConversationLifecycleService,
    ConversationIdempotencyService,
    ConversationRouterService,
    ConversationSafetyService,
    ConversationFollowUpDetector,
    ConversationContextService,
    ConversationFollowUpRewriteService,
    ConversationGroundingService,
    ConversationPromptBuilder,
    ConversationCitationMapper,
    ConversationRagApiClientService,
    ConversationLlmAdapter,
    { provide: CONVERSATION_RAG_CLIENT_PORT, useExisting: ConversationRagApiClientService },
    { provide: CONVERSATION_AI_PORT, useExisting: ConversationLlmAdapter },
    ConversationMessageService,
  ],
  exports: [
    ConversationRepository,
    ConversationMessageRepository,
    ConversationLifecycleService,
    ConversationMessageService,
  ],
})
export class ConversationsModule {}
