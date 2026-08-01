import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanUnavailableException } from '../coaching/coaching.errors';
import type { CoachingLlmPort, GroundingBundle, LlmPlanResult } from '../coaching/ports/coaching-llm.port';
import { readAiConfig } from './ai.config';

@Injectable()
export class CoachingLlmAdapter implements CoachingLlmPort {
  constructor(private readonly config: ConfigService) {}

  async generatePlan(_bundle: GroundingBundle): Promise<LlmPlanResult> {
    const ai = readAiConfig(this.config);
    throw new PlanUnavailableException({ provider: ai.provider, modelId: ai.model });
  }
}
