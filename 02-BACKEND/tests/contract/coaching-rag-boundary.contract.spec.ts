import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RagApiClientService } from '../../src/modules/coaching/rag/rag-client.service';

describe('coaching RAG boundary contract', () => {
  function withRagEnv<T>(fn: () => T): T {
    const previousUrl = process.env.RAG_BASE_URL;
    const previousToken = process.env.RAG_SERVICE_TOKEN;
    const previousTimeout = process.env.RAG_TIMEOUT_MS;
    process.env.RAG_BASE_URL = 'http://rag.internal';
    process.env.RAG_SERVICE_TOKEN = 'token';
    process.env.RAG_TIMEOUT_MS = '1000';
    try {
      return fn();
    } finally {
      if (previousUrl === undefined) delete process.env.RAG_BASE_URL;
      else process.env.RAG_BASE_URL = previousUrl;
      if (previousToken === undefined) delete process.env.RAG_SERVICE_TOKEN;
      else process.env.RAG_SERVICE_TOKEN = previousToken;
      if (previousTimeout === undefined) delete process.env.RAG_TIMEOUT_MS;
      else process.env.RAG_TIMEOUT_MS = previousTimeout;
    }
  }

  it('uses a NestJS RAG API client abstraction for Feature 002 retrieval context', () => {
    const client = withRagEnv(() => new RagApiClientService());
    expect(client).toHaveProperty('retrieve');
  });

  it('constructs structured retrieval payloads without raw answers or free text', async () => {
    const calls: unknown[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ status: 'insufficient_grounding', chunks: [], error_code: 'INSUFFICIENT_GROUNDING' }), { status: 200 });
    }) as typeof fetch;
    try {
      await withRagEnv(() => new RagApiClientService()).retrieve({
        generation_attempt_id: 'attempt-1',
        assessment_result_id: 'result-1',
        assessment_definition_version: '1.0',
        focus_areas: ['stress'],
        support_domain: 'sleep',
        strongest_domain: 'relationships',
        priority_codes: ['stress'],
        language: 'mixed',
        safety_exclusions: ['crisis', 'high_risk', 'medical', 'medication'],
        top_k: 6,
        score_threshold: 0.7,
        max_context_chars: 4000,
      }, 'corr-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(calls[0]).not.toHaveProperty('raw_answers');
    expect(calls[0]).not.toHaveProperty('free_text');
    expect(calls[0]).not.toHaveProperty('safety_answers');
  });

  it('maps RAG unavailable responses to fail-closed unavailable result', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;
    try {
      const result = await withRagEnv(() => new RagApiClientService()).retrieve({
        generation_attempt_id: 'attempt-1',
        assessment_result_id: 'result-1',
        assessment_definition_version: '1.0',
        focus_areas: ['stress'],
        support_domain: null,
        strongest_domain: null,
        priority_codes: [],
        language: 'mixed',
        safety_exclusions: ['crisis'],
        top_k: 6,
        score_threshold: 0.7,
        max_context_chars: 4000,
      }, 'corr-1');
      expect(result).toMatchObject({ status: 'unavailable', error_code: 'RAG_UNAVAILABLE' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not add Qdrant as a backend dependency', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    expect(packageJson.dependencies).not.toHaveProperty('qdrant-client');
    expect(packageJson.devDependencies).not.toHaveProperty('qdrant-client');
  });
});
