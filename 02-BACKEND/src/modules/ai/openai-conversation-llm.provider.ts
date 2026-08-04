import { ConversationLlmError } from './conversation-llm.errors';
import type {
  ConversationLlmProviderClient,
  ConversationLlmProviderRequest,
} from './conversation-llm-provider';
import { parseProviderResponse, type ParsedProviderResponse } from './conversation-llm-response';

export class OpenAiConversationLlmProvider implements ConversationLlmProviderClient {
  constructor(
    private readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async complete(request: ConversationLlmProviderRequest): Promise<ParsedProviderResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/responses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          instructions: request.instructions,
          input: request.input,
          text: {
            format: {
              type: 'json_schema',
              name: request.schemaName,
              strict: true,
              schema: request.schema,
            },
          },
        }),
        signal: controller.signal,
      });
      this.assertResponseStatus(response);
      const body = await this.readJson(response);
      const parsed = parseProviderResponse('openai', body, Date.now() - started, this.model);
      if (!parsed) throw new ConversationLlmError('LLM_INVALID_OUTPUT');
      return parsed;
    } finally {
      clearTimeout(timer);
    }
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
