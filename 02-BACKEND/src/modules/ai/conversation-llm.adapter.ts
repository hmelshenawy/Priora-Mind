import { Injectable, Logger } from '@nestjs/common';
import type {
  ConversationAiPort,
  FollowUpRewriteRequest,
  FollowUpRewriteResult,
  GroundedAnswerRequest,
  GroundedAnswerResult,
} from './conversation-ai.port';
import {
  ConversationLlmError,
  normalizeConversationLlmError,
  type ConversationLlmFailureCode,
  type LlmRequestDiagnostics,
} from './conversation-llm.errors';
import type { ConversationLlmProviderClient } from './conversation-llm-provider';
import type { ConversationLlmProvider } from './conversation-llm-response';
import { OllamaConversationLlmProvider } from './ollama-conversation-llm.provider';
import { OpenAiConversationLlmProvider } from './openai-conversation-llm.provider';

export {
  ConversationLlmError,
  normalizeConversationLlmError,
  type ConversationLlmFailureCode,
} from './conversation-llm.errors';

type Stage = 'LLM' | 'FOLLOW_UP_REWRITE';

@Injectable()
export class ConversationLlmAdapter implements ConversationAiPort {
  private readonly logger = new Logger(ConversationLlmAdapter.name);
  private readonly provider = this.readProvider();
  private readonly model = process.env.COACHING_LLM_MODEL?.trim() ?? '';
  private readonly timeoutMs = Number(process.env.COACHING_LLM_TIMEOUT_MS ?? '20000');
  private readonly client = this.createClient();

  async generateGroundedAnswer(request: GroundedAnswerRequest): Promise<GroundedAnswerResult> {
    const result = await this.completeJson(
      'LLM',
      request.correlationId,
      [
        ...request.productInstructions,
        'Return concise JSON matching the required schema.',
        'When supporting evidence is supplied, return non-empty content and at least one citation.',
        'Citations must exactly copy chunk_id, source_id, and text_hash from supplied chunks.',
        'Each citation object must contain exactly chunk_id, source_id, and text_hash with no additional fields.',
      ].join('\n'),
      JSON.stringify({
        turnContext: {
          isContinuingConversation: request.recentHistory.length > 0,
          mustAdvanceBeyondPriorAssistantResponses: request.recentHistory.some(
            (item) => item.role === 'assistant',
          ),
        },
        conversationHistoryChronological: request.recentHistory,
        currentUserMessage: request.currentMessage,
        standaloneRetrievalQuery: request.standaloneRetrievalQuery,
        supportingEvidence: request.chunks.map((chunk) => ({
          chunk_id: chunk.chunk_id,
          source_id: chunk.source_id,
          text_hash: chunk.text_hash,
          text: chunk.text,
        })),
      }),
      'grounded_answer',
      {
        type: 'object',
        additionalProperties: false,
        required: ['content', 'citations'],
        properties: {
          content: { type: 'string', minLength: 1 },
          citations: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['chunk_id', 'source_id', 'text_hash'],
              properties: {
                chunk_id: { type: 'string' },
                source_id: { type: 'string' },
                text_hash: { type: 'string' },
              },
            },
          },
        },
      },
    );
    const value = result.value as Partial<GroundedAnswerResult>;
    if (
      typeof value.content !== 'string' ||
      !value.content.trim() ||
      !Array.isArray(value.citations) ||
      value.citations.length === 0
    ) {
      this.fail('LLM', request.correlationId, 'LLM_INVALID_OUTPUT');
    }
    return { ...value, usage: result.usage, latencyMs: result.latencyMs, modelId: result.modelId } as GroundedAnswerResult;
  }

  async rewriteFollowUp(request: FollowUpRewriteRequest): Promise<FollowUpRewriteResult> {
    const result = await this.completeJson(
      'FOLLOW_UP_REWRITE',
      request.correlationId,
      'Rewrite the current message as one standalone retrieval query using only the supplied conversation history. Return JSON matching the required schema. Do not answer the question.',
      JSON.stringify({ recentHistory: request.recentHistory, currentMessage: request.currentMessage }),
      'follow_up_rewrite',
      {
        type: 'object',
        additionalProperties: false,
        required: ['standaloneRetrievalQuery'],
        properties: { standaloneRetrievalQuery: { type: 'string', minLength: 1 } },
      },
    );
    const value = result.value as Partial<FollowUpRewriteResult>;
    if (typeof value.standaloneRetrievalQuery !== 'string' || !value.standaloneRetrievalQuery.trim()) {
      this.fail('FOLLOW_UP_REWRITE', request.correlationId, 'LLM_INVALID_OUTPUT');
    }
    return {
      standaloneRetrievalQuery: value.standaloneRetrievalQuery,
      usage: result.usage,
      latencyMs: result.latencyMs,
      modelId: result.modelId,
    };
  }

  private async completeJson(
    stage: Stage,
    requestId: string,
    instructions: string,
    input: string,
    schemaName: string,
    schema: Record<string, unknown>,
  ) {
    if (!this.client) this.fail(stage, requestId, 'LLM_DISABLED');
    try {
      return await this.client.complete({ instructions, input, schemaName, schema });
    } catch (error) {
      if (error instanceof ConversationLlmError) {
        this.logFailure(stage, requestId, error.code, error.diagnostics);
        throw error;
      }
      const code = normalizeConversationLlmError(error);
      this.logFailure(stage, requestId, code);
      throw new ConversationLlmError(code);
    }
  }

  private createClient(): ConversationLlmProviderClient | null {
    if (!this.model || !Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) return null;
    if (this.provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) return null;
      return new OpenAiConversationLlmProvider(
        this.model,
        apiKey,
        process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
        this.timeoutMs,
      );
    }
    if (this.provider === 'ollama') {
      return new OllamaConversationLlmProvider(
        this.model,
        process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434',
        this.timeoutMs,
        process.env.OLLAMA_API_KEY?.trim(),
      );
    }
    return null;
  }

  private readProvider(): ConversationLlmProvider {
    const provider = process.env.COACHING_LLM_PROVIDER?.trim().toLowerCase();
    return provider === 'openai' || provider === 'ollama' ? provider : 'disabled';
  }

  private fail(stage: Stage, requestId: string, code: ConversationLlmFailureCode): never {
    this.logFailure(stage, requestId, code);
    throw new ConversationLlmError(code);
  }

  private logFailure(
    stage: Stage,
    requestId: string,
    failureCode: ConversationLlmFailureCode,
    diagnostics?: LlmRequestDiagnostics,
  ): void {
    // Structured, redaction-safe: only transport metadata is emitted. Prompts,
    // user content, response bodies, API keys, and stack traces are never logged.
    this.logger.warn({
      provider: this.provider,
      model: this.model || 'unconfigured',
      processingStage: stage,
      failureCode,
      requestId,
      diagnostics,
    });
  }
}
