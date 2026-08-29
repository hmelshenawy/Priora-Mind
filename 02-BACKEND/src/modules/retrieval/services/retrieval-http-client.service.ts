import { Injectable } from '@nestjs/common';
import type { RetrievedChunk, RetrievalSearchRequest, RetrievalSearchResult } from '../dto/retrieval.dto';
import type { RetrievalClientPort } from '../ports/retrieval-client.port';

@Injectable()
export class RetrievalHttpClientService implements RetrievalClientPort {
  private readonly baseUrl = process.env.RAG_BASE_URL ?? '';
  private readonly serviceToken = process.env.RAG_SERVICE_TOKEN ?? '';
  private readonly timeoutMs = Number(process.env.RAG_TIMEOUT_MS ?? '5000');

  async search(request: RetrievalSearchRequest, correlationId: string): Promise<RetrievalSearchResult> {

    const startedAt = Date.now();

    console.log('RAG start', {
    correlationId,
    timeoutMs: this.timeoutMs,
    baseUrl: this.baseUrl,
  });

    if (!this.baseUrl || !this.serviceToken) return this.unavailable(correlationId);
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
      console.log('RAG response received', {
    correlationId,
    elapsedMs: Date.now() - startedAt,
    status: response.status,
    });
      if (response.status === 401) return { ...this.unavailable(correlationId), errorCode: 'RAG_UNAUTHORIZED' };
      if (!response.ok) return this.unavailable(correlationId);
      const body = (await response.json()) as { results?: unknown };

      console.log('RAG body parsed', {
  correlationId,
  elapsedMs: Date.now() - startedAt,
});

      if (!Array.isArray(body.results)) return this.invalid(correlationId);
      const chunks = body.results.filter(this.isChunk);
      if (chunks.length !== body.results.length) return this.invalid(correlationId);
      return { status: 'ok', correlationId, chunks };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { status: 'timeout', correlationId, chunks: [], errorCode: 'RAG_TIMEOUT' };
      }
      return this.unavailable(correlationId);
    } finally {
      clearTimeout(timer);
    }
  }

  private isChunk(value: unknown): value is RetrievedChunk {
    const chunk = value as RetrievedChunk;
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

  private unavailable(correlationId: string): RetrievalSearchResult {
    return { status: 'unavailable', correlationId, chunks: [], errorCode: 'RAG_UNAVAILABLE' };
  }

  private invalid(correlationId: string): RetrievalSearchResult {
    return { status: 'invalid_response', correlationId, chunks: [], errorCode: 'RAG_INVALID_RESPONSE' };
  }
}
