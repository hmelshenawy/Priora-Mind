import { Module } from '@nestjs/common';
import { COACHING_LLM_PORT } from '../coaching/ports/coaching-llm.port';
import { CoachingLlmAdapter } from './coaching-llm.adapter';

@Module({
  providers: [CoachingLlmAdapter, { provide: COACHING_LLM_PORT, useExisting: CoachingLlmAdapter }],
  exports: [COACHING_LLM_PORT],
})
export class AiModule {}
