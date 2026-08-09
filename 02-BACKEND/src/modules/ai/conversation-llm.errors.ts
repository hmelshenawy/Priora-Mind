export type ConversationLlmFailureCode =
  | 'LLM_DISABLED'
  | 'LLM_UNAVAILABLE'
  | 'LLM_TIMEOUT'
  | 'LLM_RATE_LIMITED'
  | 'LLM_INVALID_OUTPUT'
  | 'LLM_UNSAFE_OUTPUT'
  | 'LLM_UNSUPPORTED_CITATION';

/**
 * Normalized, redaction-safe classification of the underlying transport
 * failure. Derived only from error class names / well-known socket codes —
 * never from message text, prompts, or response bodies.
 */
export type NetworkErrorCategory =
  | 'abort'
  | 'connection_reset'
  | 'dns'
  | 'refused'
  | 'timeout'
  | 'http_status'
  | 'provider_error_body'
  | 'parse'
  | 'unknown';

/**
 * Redaction-safe diagnostics attached to every provider failure. Contains only
 * transport-level metadata — never prompts, user content, response bodies, API
 * keys, or stack traces.
 */
export interface LlmRequestDiagnostics {
  httpStatus?: number;
  exceptionName?: string;
  causeName?: string;
  networkCategory?: NetworkErrorCategory;
  elapsedMs?: number;
  aborted?: boolean;
}

export class ConversationLlmError extends Error {
  diagnostics?: LlmRequestDiagnostics;

  constructor(readonly code: ConversationLlmFailureCode, diagnostics?: LlmRequestDiagnostics) {
    super(code);
    this.diagnostics = diagnostics;
  }
}

/**
 * Classify a raw transport error into a redaction-safe network category.
 * `aborted` is the authoritative abort signal from the request's own
 * AbortController — when true the category is always `abort` regardless of how
 * the underlying fetch implementation wrapped the rejection (Node's undici
 * sometimes surfaces an abort as `TypeError: fetch failed` whose `cause` is an
 * `AbortError`, so checking `error.name === 'AbortError'` alone is unreliable).
 */
export function categorizeNetworkError(error: unknown, aborted: boolean): NetworkErrorCategory {
  if (aborted) return 'abort';
  const e = error as { name?: string; message?: string; cause?: { name?: string; code?: string } } | undefined;
  if (e?.name === 'AbortError' || e?.cause?.name === 'AbortError') return 'abort';
  if (e?.name === 'SyntaxError') return 'parse';
  const message = String(e?.message ?? '');
  const code = e?.cause?.code ?? '';
  if (/ECONNREFUSED/.test(message) || code === 'ECONNREFUSED') return 'refused';
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message) || code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns';
  if (/ETIMEDOUT/.test(message) || code === 'ETIMEDOUT') return 'timeout';
  if (code === 'UND_ERR_SOCKET' || /terminated|ECONNRESET|EPIPE|socket hang up/i.test(message)) {
    return 'connection_reset';
  }
  // undici wraps any fetch-level network failure in `TypeError: fetch failed`.
  if (e?.name === 'TypeError' && /fetch/i.test(message)) return 'connection_reset';
  return 'unknown';
}

export function normalizeConversationLlmError(error: unknown): ConversationLlmFailureCode {
  if (error instanceof ConversationLlmError) return error.code;
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'LLM_TIMEOUT';
    const cause = (error as { cause?: { name?: string } }).cause;
    if (cause?.name === 'AbortError') return 'LLM_TIMEOUT';
    if (/rate/i.test(error.message)) return 'LLM_RATE_LIMITED';
    if (/disabled|not_configured/i.test(error.message)) return 'LLM_DISABLED';
    if (/invalid|malformed/i.test(error.message)) return 'LLM_INVALID_OUTPUT';
    if (/unsafe/i.test(error.message)) return 'LLM_UNSAFE_OUTPUT';
  }
  return 'LLM_UNAVAILABLE';
}