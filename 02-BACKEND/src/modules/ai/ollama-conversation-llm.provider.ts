import { ConversationLlmError } from './conversation-llm.errors';
import { matchesConversationSchema } from './conversation-json-schema-validator';
import type {
  ConversationLlmProviderClient,
  ConversationLlmProviderRequest,
} from './conversation-llm-provider';
import { parseProviderResponse, type ParsedProviderResponse } from './conversation-llm-response';

export class OllamaConversationLlmProvider implements ConversationLlmProviderClient {
  constructor(
    private readonly model: string,
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly apiKey?: string,
  ) {}

  async complete(request: ConversationLlmProviderRequest): Promise<ParsedProviderResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
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
      this.assertResponseStatus(response);
      const body = await this.readJson(response);
      const parsed = parseProviderResponse(
        'ollama',
        body,
        Date.now() - started,
        this.model,
        cloudModel,
      );
      if (!parsed) throw new ConversationLlmError('LLM_INVALID_OUTPUT');
      if (cloudModel && !matchesConversationSchema(parsed.value, request.schema)) {
        throw new ConversationLlmError('LLM_INVALID_OUTPUT');
      }
      return parsed;
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
      `Return only one JSON object named ${schemaName}; do not use Markdown or prose outside it.`,
      `The response must exactly satisfy this JSON Schema: ${JSON.stringify(schema)}`,
    ].join('\n');
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  private assertResponseStatus(response: Response): void {
    if (response.status === 429) throw new ConversationLlmError('LLM_RATE_LIMITED');
    if (response.status === 401 || response.status === 403 || response.status >= 500) {
      throw new ConversationLlmError('LLM_UNAVAILABLE');
    }
    if (!response.ok) throw new ConversationLlmError('LLM_INVALID_OUTPUT');
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new ConversationLlmError('LLM_INVALID_OUTPUT');
    }
  }
}
