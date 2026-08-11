import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConversationAccessService } from './services/conversation-access.service';
import { ConversationIdempotencyService } from './services/conversation-idempotency.service';
import { ConversationLifecycleService } from './services/conversation-lifecycle.service';
import { ConversationMessageRepository } from './repositories/conversation-message.repository';
import { ConversationMessageService } from './services/conversation-message.service';
import { ConversationRouterService } from './services/conversation-router.service';
import { ConversationRepository } from './repositories/conversation.repository';
import { ConversationSafetyService } from './services/conversation-safety.service';
import { ConversationsController } from './controllers/conversations.controller';
import { CONVERSATION_AI_PORT } from '../ai/ports/conversation-ai.port';
import { ConversationLlmAdapter } from '../ai/services/conversation-llm.adapter';
import { ConversationCitationMapper } from './utils/conversation-citation-mapper';
import { ConversationContextService } from './services/conversation-context.service';
import { ConversationFollowUpDetector } from './utils/conversation-follow-up-detector';
import { ConversationFollowUpRewriteService } from './services/conversation-follow-up-rewrite.service';
import { ConversationGroundingService } from './services/conversation-grounding.service';
import { ConversationPromptBuilder } from './utils/conversation-prompt-builder';
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
