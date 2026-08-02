import { Injectable } from '@nestjs/common';
import type {
  ConversationRagChunk,
  ConversationRagClientPort,
  ConversationRagHealthResult,
  ConversationRagSearchRequest,
  ConversationRagSearchResult,
} from './conversation-rag-client.port';

@Injectable()
export class ConversationRagApiClientService implements ConversationRagClientPort {
  private readonly baseUrl = process.env.RAG_BASE_URL ?? '';
  private readonly serviceToken = process.env.RAG_SERVICE_TOKEN ?? '';
  private readonly timeoutMs = Number(process.env.RAG_TIMEOUT_MS ?? '5000');

  async search(
    request: ConversationRagSearchRequest,
    correlationId: string,
  ): Promise<ConversationRagSearchResult> {
    if (!this.baseUrl || !this.serviceToken) return this.searchUnavailable(correlationId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.serviceToken}`,
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (response.status === 401) return { ...this.searchUnavailable(correlationId), errorCode: 'RAG_UNAUTHORIZED' };
      if (!response.ok) return this.searchUnavailable(correlationId);
      const body = (await response.json()) as { results?: unknown };
      if (!Array.isArray(body.results)) return this.searchInvalid(correlationId);
      const chunks = body.results.filter(this.isChunk);
      if (chunks.length !== body.results.length) return this.searchInvalid(correlationId);
      return { status: 'ok', correlationId, chunks };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { status: 'timeout', correlationId, chunks: [], errorCode: 'RAG_TIMEOUT' };
      }
      return this.searchUnavailable(correlationId);
    } finally {
      clearTimeout(timer);
    }
  }

  async health(correlationId: string): Promise<ConversationRagHealthResult> {
    if (!this.baseUrl || !this.serviceToken) return { status: 'unavailable', correlationId, errorCode: 'RAG_UNAVAILABLE' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/health`, {
        headers: { Authorization: `Bearer ${this.serviceToken}`, 'X-Correlation-Id': correlationId },
        signal: controller.signal,
      });
      if (response.status === 401) return { status: 'unauthorized', correlationId, errorCode: 'RAG_UNAUTHORIZED' };
      if (!response.ok) return { status: 'unavailable', correlationId, errorCode: 'RAG_UNAVAILABLE' };
      const body = (await response.json()) as Record<string, unknown>;
      if (body.status !== 'ok') return { status: 'invalid_response', correlationId, errorCode: 'RAG_INVALID_RESPONSE' };
      return {
        status: 'ok',
        correlationId,
        collectionName: typeof body.collection_name === 'string' ? body.collection_name : undefined,
        embeddingModel: typeof body.embedding_model === 'string' ? body.embedding_model : undefined,
        embeddingDimension: typeof body.embedding_dimension === 'number' ? body.embedding_dimension : undefined,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return { status: 'timeout', correlationId, errorCode: 'RAG_TIMEOUT' };
      return { status: 'unavailable', correlationId, errorCode: 'RAG_UNAVAILABLE' };
    } finally {
      clearTimeout(timer);
    }
  }

  private isChunk(value: unknown): value is ConversationRagChunk {
    const chunk = value as ConversationRagChunk;
    return Boolean(
      chunk &&
        typeof chunk.chunk_id === 'string' &&
        typeof chunk.text === 'string' &&
        typeof chunk.score === 'number' &&
        typeof chunk.source_id === 'string' &&
        typeof chunk.source_title === 'string' &&
        (chunk.source_type === 'pdf' || chunk.source_type === 'markdown') &&
        typeof chunk.chunk_index === 'number' &&
        typeof chunk.text_hash === 'string',
    );
  }

  private searchUnavailable(correlationId: string): ConversationRagSearchResult {
    return { status: 'unavailable', correlationId, chunks: [], errorCode: 'RAG_UNAVAILABLE' };
  }

  private searchInvalid(correlationId: string): ConversationRagSearchResult {
    return { status: 'invalid_response', correlationId, chunks: [], errorCode: 'RAG_INVALID_RESPONSE' };
  }
}
