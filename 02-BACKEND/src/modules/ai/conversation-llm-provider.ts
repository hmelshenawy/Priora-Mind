import type { ParsedProviderResponse } from './conversation-llm-response';

export interface ConversationLlmProviderRequest {
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
}

export interface ConversationLlmProviderClient {
  complete(request: ConversationLlmProviderRequest): Promise<ParsedProviderResponse>;
}
