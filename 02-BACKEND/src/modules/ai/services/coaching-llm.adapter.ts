import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CoachingLlmPort, GroundingBundle, LlmPlanResult } from '../../coaching/ports/coaching-llm.port';
import { COACHING_PLAN_SCHEMA, isPlanOutput } from '../dto/coaching-plan.schema';
import { ConversationLlmError, normalizeConversationLlmError } from '../utils/conversation-llm.errors';
import type { ConversationLlmProviderClient } from '../ports/conversation-llm-provider';
import { OllamaConversationLlmProvider } from '../providers/ollama-conversation-llm.provider';
import { OpenAiConversationLlmProvider } from '../providers/openai-conversation-llm.provider';

@Injectable()
export class CoachingLlmAdapter implements CoachingLlmPort {
  constructor(private readonly config: ConfigService) {}

  async generatePlan(bundle: GroundingBundle): Promise<LlmPlanResult> {
    const model = this.config.get<string>('COACHING_LLM_MODEL')?.trim() ?? '';
    const client = this.createClient(model);
    if (!client) throw new ConversationLlmError('LLM_DISABLED');
    let result;
    try {
      result = await client.complete({
        instructions: bundle.instructions.join('\n'),
        input: JSON.stringify({
          assessment: bundle.assessment,
          focusAreaEvidence: bundle.focusAreaEvidence,
          coachingLibrary: bundle.library,
          disclaimerVersion: bundle.disclaimerVersion,
          supportingEvidence: bundle.ragContext?.chunks ?? [],
        }),
        schemaName: 'coaching_plan',
        schema: COACHING_PLAN_SCHEMA,
      });
    } catch (error) {
      throw error instanceof ConversationLlmError
        ? error
        : new ConversationLlmError(normalizeConversationLlmError(error));
    }
    if (!isPlanOutput(result.value)) throw new ConversationLlmError('LLM_INVALID_OUTPUT');
    return {
      output: result.value,
      usage: {
        prompt: result.usage?.prompt ?? 0,
        completion: result.usage?.completion ?? 0,
        total: result.usage?.total ?? 0,
      },
      latencyMs: result.latencyMs,
      modelId: result.modelId,
    };
  }

  private createClient(model: string): ConversationLlmProviderClient | null {
    const provider = this.config.get<string>('COACHING_LLM_PROVIDER')?.trim().toLowerCase();
    const timeoutMs = Number(this.config.get<string>('COACHING_LLM_TIMEOUT_MS') ?? 20_000);
    if (!model || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return null;
    if (provider === 'ollama') {
      return new OllamaConversationLlmProvider(
        model,
        this.config.get<string>('OLLAMA_BASE_URL')?.trim() || 'http://127.0.0.1:11434',
        timeoutMs,
        this.config.get<string>('OLLAMA_API_KEY')?.trim(),
      );
    }
    if (provider === 'openai') {
      const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
      if (!apiKey) return null;
      return new OpenAiConversationLlmProvider(
        model,
        apiKey,
        this.config.get<string>('OPENAI_BASE_URL')?.trim() || 'https://api.openai.com/v1',
        timeoutMs,
      );
    }
    return null;
  }
}
