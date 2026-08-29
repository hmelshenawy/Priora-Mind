import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { ConversationAccessService } from './services/conversation-access.service';
import { ConversationIdempotencyService } from './services/conversation-idempotency.service';
import { ConversationLifecycleService } from './services/conversation-lifecycle.service';
import { ConversationMessageRepository } from './repositories/conversation-message.repository';
import { ConversationMessageService } from './services/conversation-message.service';
import { ConversationRouterService } from './services/conversation-router.service';
import { ConversationRepository } from './repositories/conversation.repository';
import { ConversationSafetyService } from './services/conversation-safety.service';
import { ConversationsController } from './controllers/conversations.controller';
import { ConversationCitationMapper } from './utils/conversation-citation-mapper';
import { ConversationContextService } from './services/conversation-context.service';
import { ConversationFollowUpDetector } from './utils/conversation-follow-up-detector';
import { ConversationFollowUpRewriteService } from './services/conversation-follow-up-rewrite.service';
import { ConversationGroundingService } from './services/conversation-grounding.service';
import { ConversationPromptBuilder } from './utils/conversation-prompt-builder';
import { SafetyModule } from '../safety/safety.module';

@Module({
  imports: [PrismaModule, SafetyModule, AiModule, RetrievalModule],
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
