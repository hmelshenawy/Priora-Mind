const SAFE_FAILURE_CODES = new Set([
  'RAG_UNAVAILABLE',
  'RAG_TIMEOUT',
  'RAG_INVALID_RESPONSE',
  'LLM_DISABLED',
  'LLM_UNAVAILABLE',
  'LLM_TIMEOUT',
  'LLM_RATE_LIMITED',
  'LLM_INVALID_OUTPUT',
  'LLM_UNSAFE_OUTPUT',
  'LLM_UNSUPPORTED_CITATION',
  'FOLLOW_UP_REWRITE_FAILED',
  'FOLLOW_UP_REWRITE_UNAVAILABLE',
  'FOLLOW_UP_REWRITE_INVALID_OUTPUT',
  'ORCHESTRATION_FAILED',
]);

export function normalizeFailureCode(code: string | null | undefined, fallback: string): string {
  if (!code) return fallback;
  return SAFE_FAILURE_CODES.has(code) ? code : fallback;
}

export function safeFailureDetail(stage: string): string {
  return `${stage.toLowerCase()}_failed`;
}
