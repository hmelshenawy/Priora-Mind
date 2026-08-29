/* Live verification: drives the real ConversationLlmAdapter against Ollama Cloud
 * for BOTH the FOLLOW_UP_REWRITE and the LLM (grounded answer) stages, several
 * times with fresh correlation IDs. This mirrors "several new-idempotency-key
 * follow-ups" end-to-end at the AI-transport level (rewrite -> grounded RAG
 * answer -> final assistant message) without touching auth/DB.
 *
 * Logs ONLY redaction-safe metadata (no prompts, user content, response bodies,
 * API keys, or stack traces). Run: npx ts-node scripts/live-verify-followup.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { ConversationLlmAdapter } from '../src/modules/ai/conversation-llm.adapter';
import type { ConversationRagChunk } from '../src/modules/conversations/rag/conversation-rag-client.port';

// Load .env into process.env (minimal parser, no external dep).
const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const adapter = new ConversationLlmAdapter();

const cases: { correlationId: string; currentMessage: string; chunk: ConversationRagChunk }[] = [
  {
    correlationId: 'live-fur-001',
    currentMessage: 'How do I stop anxiety before meetings?',
    chunk: {
      chunk_id: 'chunk-live-1', score: 0.91, source_id: 'source-live-1', source_title: 'Grounding',
      source_type: 'markdown', chunk_index: 0, text_hash: 'hash-live-1',
      text: 'Before meetings, try a brief grounding exercise: name five objects in the room, then take three slow breaths to lower activation.',
    },
  },
  {
    correlationId: 'live-fur-002',
    currentMessage: 'What can I do about sleep problems lately?',
    chunk: {
      chunk_id: 'chunk-live-2', score: 0.88, source_id: 'source-live-2', source_title: 'Sleep hygiene',
      source_type: 'markdown', chunk_index: 0, text_hash: 'hash-live-2',
      text: 'Keep a consistent wake time, limit caffeine after midday, and wind down screen use an hour before bed.',
    },
  },
  {
    correlationId: 'live-fur-003',
    currentMessage: 'Help me manage stress around deadlines.',
    chunk: {
      chunk_id: 'chunk-live-3', score: 0.9, source_id: 'source-live-3', source_title: 'Stress management',
      source_type: 'markdown', chunk_index: 0, text_hash: 'hash-live-3',
      text: 'Break deadlines into small next steps and schedule each on a calendar; practice box breathing when tension rises.',
    },
  },
];

const recentHistory = [
  { role: 'user' as const, content: 'I have been feeling anxious at work' },
  { role: 'assistant' as const, content: 'Tell me more about what triggers the anxiety.' },
];

(async () => {
  let rewriteOk = 0;
  let groundedOk = 0;
  let fail = 0;
  for (const c of cases) {
    // Stage 1: FOLLOW_UP_REWRITE through real Ollama Cloud JSON mode.
    let standalone = '';
    try {
      const res = await adapter.rewriteFollowUp({
        correlationId: c.correlationId,
        recentHistory,
        currentMessage: c.currentMessage,
      });
      rewriteOk++;
      standalone = res.standaloneRetrievalQuery;
      console.log(JSON.stringify({
        stage: 'FOLLOW_UP_REWRITE', status: 'ok', correlationId: c.correlationId,
        latencyMs: res.latencyMs, modelId: res.modelId, queryLength: standalone.length,
      }));
    } catch (error: unknown) {
      fail++;
      const e = error as { code?: string; diagnostics?: Record<string, unknown> };
      console.log(JSON.stringify({ stage: 'FOLLOW_UP_REWRITE', status: 'fail', correlationId: c.correlationId, code: e.code, diagnostics: e.diagnostics }));
      continue;
    }

    // Stage 2: LLM grounded answer (RAG continues -> final assistant message).
    try {
      const res = await adapter.generateGroundedAnswer({
        correlationId: c.correlationId,
        productInstructions: ['Answer as a supportive coaching assistant using only supplied evidence.'],
        recentHistory,
        currentMessage: c.currentMessage,
        standaloneRetrievalQuery: standalone,
        chunks: [c.chunk],
      });
      groundedOk++;
      const citationIds = res.citations.map((cit) => cit.chunk_id);
      const citationsValid = citationIds.every((id) => id === c.chunk.chunk_id);
      console.log(JSON.stringify({
        stage: 'LLM_GROUNDED_ANSWER', status: 'ok', correlationId: c.correlationId,
        latencyMs: res.latencyMs, modelId: res.modelId,
        contentLength: res.content.length, citationCount: res.citations.length, citationsValid,
      }));
    } catch (error: unknown) {
      fail++;
      const e = error as { code?: string; diagnostics?: Record<string, unknown> };
      console.log(JSON.stringify({ stage: 'LLM_GROUNDED_ANSWER', status: 'fail', correlationId: c.correlationId, code: e.code, diagnostics: e.diagnostics }));
    }
  }
  console.log(JSON.stringify({ summary: { rewriteOk, groundedOk, fail, total: cases.length } }));
  process.exit(fail === 0 ? 0 : 1);
})();