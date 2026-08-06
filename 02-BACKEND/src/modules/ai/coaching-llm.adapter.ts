import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CoachingLlmPort, GroundingBundle, LlmPlanOutput, LlmPlanResult } from '../coaching/ports/coaching-llm.port';
import { ConversationLlmError, normalizeConversationLlmError } from './conversation-llm.errors';
import type { ConversationLlmProviderClient } from './conversation-llm-provider';
import { OllamaConversationLlmProvider } from './ollama-conversation-llm.provider';
import { OpenAiConversationLlmProvider } from './openai-conversation-llm.provider';

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

const bilingual = {
  type: 'object', additionalProperties: false, required: ['en', 'ar'],
  properties: { en: { type: 'string', minLength: 1 }, ar: { type: 'string', minLength: 1 } },
};

export const COACHING_PLAN_SCHEMA: Record<string, unknown> = {
  type: 'object', additionalProperties: false,
  required: ['version', 'title', 'summary', 'focusAreas', 'goals', 'actions', 'disclaimerReference'],
  properties: {
    version: { type: 'string', minLength: 1 }, title: bilingual, summary: bilingual,
    focusAreas: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['domain', 'source', 'reason'], properties: { domain: { type: 'string' }, source: { type: 'string' }, reason: bilingual } } },
    goals: { type: 'array', minItems: 1, maxItems: 9, items: { type: 'object', additionalProperties: false, required: ['libraryKey'], properties: { libraryKey: { type: 'string', minLength: 1 } } } },
    actions: { type: 'array', minItems: 1, maxItems: 18, items: { type: 'object', additionalProperties: false, required: ['libraryKey', 'position', 'pacingLabel', 'copy'], properties: { libraryKey: { type: 'string', minLength: 1 }, position: { type: 'number' }, pacingLabel: bilingual, copy: bilingual } } },
    citations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['chunk_id', 'source_id', 'text_hash'], properties: { chunk_id: { type: 'string' }, source_id: { type: 'string' }, text_hash: { type: 'string' } } } },
    disclaimerReference: { type: 'object', additionalProperties: false, required: ['version'], properties: { version: { type: 'string' } } },
  },
};

function bilingualValue(value: unknown): boolean {
  const item = value as { en?: unknown; ar?: unknown };
  return Boolean(item && typeof item.en === 'string' && item.en.trim() && typeof item.ar === 'string' && item.ar.trim());
}

export function isPlanOutput(value: unknown): value is LlmPlanOutput {
  const output = value as Partial<LlmPlanOutput>;
  return Boolean(output && output.version === '1.0' && bilingualValue(output.title) && bilingualValue(output.summary)
    && Array.isArray(output.focusAreas) && output.focusAreas.length > 0
    && output.focusAreas.every((area) => typeof area?.domain === 'string' && bilingualValue(area.reason))
    && Array.isArray(output.goals) && output.goals.length > 0 && output.goals.every((goal) => typeof goal?.libraryKey === 'string')
    && Array.isArray(output.actions) && output.actions.length > 0
    && output.actions.every((action) => typeof action?.libraryKey === 'string' && Number.isInteger(action.position) && bilingualValue(action.copy) && (action.pacingLabel === null || bilingualValue(action.pacingLabel)))
    && typeof output.disclaimerReference?.version === 'string');
}
