import { Injectable } from '@nestjs/common';

export const RAG_CLIENT_PORT = Symbol('RAG_CLIENT_PORT');

export interface RagRetrievalChunk {
  chunk_id: string;
  text: string;
  score: number;
  source_id: string;
  source_title: string;
  source_type: 'pdf' | 'markdown';
  citation_page?: number | null;
  citation_heading?: string | null;
  citation_section?: string | null;
  text_hash: string;
}

export interface RagRetrievalResult {
  status: 'ok' | 'insufficient_grounding' | 'unavailable';
  correlation_id: string;
  collection_name?: string;
  embedding_model?: string;
  embedding_dimension?: number;
  chunks: RagRetrievalChunk[];
  error_code?: string;
}

export interface RagRetrievalRequest {
  generation_attempt_id: string;
  assessment_result_id: string;
  assessment_definition_version: string;
  focus_areas: string[];
  support_domain: string | null;
  strongest_domain: string | null;
  priority_codes: string[];
  language: 'ar' | 'en' | 'mixed';
  safety_exclusions: string[];
  top_k: number;
  score_threshold: number;
  max_context_chars: number;
}

export interface RagClientPort {
  retrieve(request: RagRetrievalRequest, correlationId: string): Promise<RagRetrievalResult>;
}

@Injectable()
export class RagApiClientService implements RagClientPort {
  private readonly baseUrl = process.env.RAG_BASE_URL ?? '';
  private readonly serviceToken = process.env.RAG_SERVICE_TOKEN ?? '';
  private readonly timeoutMs = Number(process.env.RAG_TIMEOUT_MS ?? '5000');

  async retrieve(request: RagRetrievalRequest, correlationId: string): Promise<RagRetrievalResult> {
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
        body: JSON.stringify({
          question: `Coaching guidance for ${request.focus_areas.join(', ')}. Support area: ${request.support_domain ?? 'none'}.`,
          limit: request.top_k,
          score_threshold: request.score_threshold,
        }),
        signal: controller.signal,
      });
      if (!response.ok) return this.unavailable(correlationId);
      const body = (await response.json()) as { results?: RagRetrievalChunk[] };
      if (!Array.isArray(body.results) || body.results.length === 0) {
        return { status: 'insufficient_grounding', correlation_id: correlationId, chunks: [], error_code: 'INSUFFICIENT_GROUNDING' };
      }
      return { status: 'ok', correlation_id: correlationId, chunks: body.results };
    } catch {
      return this.unavailable(correlationId);
    } finally {
      clearTimeout(timer);
    }
  }

  private unavailable(correlationId: string): RagRetrievalResult {
    return { status: 'unavailable', correlation_id: correlationId, chunks: [], error_code: 'RAG_UNAVAILABLE' };
  }
}
