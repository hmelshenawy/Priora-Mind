import {
  categorizeNetworkError,
  ConversationLlmError,
  type LlmRequestDiagnostics,
  type NetworkErrorCategory,
} from '../utils/conversation-llm.errors';
import { matchesConversationSchema } from '../utils/conversation-json-schema-validator';
import type {
  ConversationLlmProviderClient,
  ConversationLlmProviderRequest,
} from '../ports/conversation-llm-provider';
import { parseProviderResponse, type ParsedProviderResponse } from '../utils/conversation-llm-response';

export class OllamaConversationLlmProvider implements ConversationLlmProviderClient {
  constructor(
    private readonly model: string,
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly apiKey?: string,
  ) {}

  async complete(request: ConversationLlmProviderRequest): Promise<ParsedProviderResponse> {
    // Fresh controller + timer per request — never reused across calls.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
    let httpStatus: number | undefined;

    // Builds redaction-safe diagnostics from transport metadata only.
    const diag = (error: unknown, category: NetworkErrorCategory): LlmRequestDiagnostics => ({
      httpStatus,
      exceptionName: error instanceof Error && !(error instanceof ConversationLlmError) ? error.name : undefined,
      causeName: (error as { cause?: { name?: string } })?.cause?.name,
      networkCategory: category,
      elapsedMs: Date.now() - started,
      aborted: controller.signal.aborted,
    });

    try {
      const cloudModel = this.model.endsWith(':cloud');
      const response = await fetch(this.chatUrl(), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: this.model,
          stream: false,
          think: false,
          format: cloudModel ? 'json' : request.schema,
          messages: [
            {
              role: 'system',
              content: cloudModel
                ? this.cloudInstructions(request.instructions, request.schemaName, request.schema)
                : request.instructions,
            },
            { role: 'user', content: request.input },
          ],
        }),
        signal: controller.signal,
      });
      httpStatus = response.status;
      if (response.status === 429) throw new ConversationLlmError('LLM_RATE_LIMITED', diag(undefined, 'http_status'));
      if (response.status === 401 || response.status === 403 || response.status >= 500) {
        throw new ConversationLlmError('LLM_UNAVAILABLE', diag(undefined, 'http_status'));
      }
      if (!response.ok) throw new ConversationLlmError('LLM_INVALID_OUTPUT', diag(undefined, 'http_status'));

      // Read the body as text first so a mid-stream reset (network) is not
      // conflated with a JSON parse failure (invalid output).
      let text: string;
      try {
        text = await response.text();
      } catch (error) {
        // Re-throw raw — classified as transport below.
        throw error;
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch (error) {
        throw new ConversationLlmError('LLM_INVALID_OUTPUT', diag(error, 'parse'));
      }

      // Ollama can return HTTP 200 with a provider-level error object (e.g. an
      // upstream cloud failure). That is a transport/availability failure, not
      // model output, so it must not be treated as parseable content.
      if (isProviderErrorBody(body)) {
        throw new ConversationLlmError('LLM_UNAVAILABLE', diag(undefined, 'provider_error_body'));
      }

      const parsed = parseProviderResponse(
        'ollama',
        body,
        Date.now() - started,
        this.model,
        cloudModel,
      );
      if (!parsed) throw new ConversationLlmError('LLM_INVALID_OUTPUT', diag(undefined, 'parse'));
      if (cloudModel && !matchesConversationSchema(parsed.value, request.schema)) {
        throw new ConversationLlmError('LLM_INVALID_OUTPUT', diag(undefined, 'parse'));
      }
      return parsed;
    } catch (error) {
      if (error instanceof ConversationLlmError) throw error;
      // Raw transport error from fetch() or response.text(). An abort is a
      // timeout whether it came from our own AbortController timer or from the
      // transport itself (e.g. undici's own timeout). Our signal is still the
      // authoritative source: when it fired it is always a timeout regardless of
      // how fetch wrapped the rejection (undici sometimes surfaces an abort as
      // `TypeError: fetch failed` whose `cause` is an `AbortError`).
      const aborted = controller.signal.aborted;
      const category = categorizeNetworkError(error, aborted);
      throw new ConversationLlmError(
        category === 'abort' ? 'LLM_TIMEOUT' : 'LLM_UNAVAILABLE',
        diag(error, category),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private chatUrl(): string {
    const base = this.baseUrl.replace(/\/$/, '');
    return base.endsWith('/api') ? `${base}/chat` : `${base}/api/chat`;
  }

  private cloudInstructions(
    instructions: string,
    schemaName: string,
    schema: Record<string, unknown>,
  ): string {
    return [
      instructions,
      `Return only the root JSON object for schema ${schemaName}; do not wrap it in a property named ${schemaName}.`,
      'Do not use Markdown or prose outside the root JSON object.',
      `The response must exactly satisfy this JSON Schema: ${JSON.stringify(schema)}`,
    ].join('\n');
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    return headers;
  }
}

function isProviderErrorBody(body: unknown): boolean {
  const error = (body as Record<string, unknown> | null)?.error;
  return typeof error === 'string' && error.trim().length > 0;
}