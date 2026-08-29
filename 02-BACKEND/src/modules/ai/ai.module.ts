import { Module } from '@nestjs/common';
import { COACHING_LLM_PORT } from './ports/coaching-llm.port';
import { CONVERSATION_AI_PORT } from './ports/conversation-ai.port';
import { CoachingLlmAdapter } from './services/coaching-llm.adapter';
import { ConversationLlmAdapter } from './services/conversation-llm.adapter';

@Module({
  providers: [
    CoachingLlmAdapter,
    ConversationLlmAdapter,
    { provide: COACHING_LLM_PORT, useExisting: CoachingLlmAdapter },
    { provide: CONVERSATION_AI_PORT, useExisting: ConversationLlmAdapter },
  ],
  exports: [COACHING_LLM_PORT, CONVERSATION_AI_PORT],
})
export class AiModule {}
