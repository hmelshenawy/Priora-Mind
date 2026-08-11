export type ConversationLlmProvider = 'disabled' | 'openai' | 'ollama';
export type ConversationLlmUsage = { prompt?: number; completion?: number; total?: number };

export interface ParsedProviderResponse {
  value: unknown;
  usage?: ConversationLlmUsage;
  latencyMs: number;
  modelId: string;
}

export function parseProviderResponse(
  provider: ConversationLlmProvider,
  body: unknown,
  latencyMs: number,
  configuredModel: string,
  allowMarkdownFence = false,
): ParsedProviderResponse | null {
  const data = body as Record<string, unknown>;
  const raw = provider === 'openai' ? openAiText(data) : ollamaText(data);
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(allowMarkdownFence ? unwrapJsonFence(raw) : raw);
  } catch {
    return null;
  }
  return {
    value,
    usage: readUsage(provider, data),
    latencyMs,
    modelId:
      typeof data.model === 'string' && data.model.trim() ? data.model : configuredModel,
  };
}

function unwrapJsonFence(raw: string): string {
  const match = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1] ?? raw;
}

function openAiText(data: Record<string, unknown>): string | null {
  if (typeof data.output_text === 'string') return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray((item as { content?: unknown }).content)
      ? ((item as { content: unknown[] }).content ?? [])
      : [];
    for (const part of content) {
      if (
        (part as { type?: unknown }).type === 'output_text' &&
        typeof (part as { text?: unknown }).text === 'string'
      ) {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

function ollamaText(data: Record<string, unknown>): string | null {
  const message = data.message as { content?: unknown } | undefined;
  return typeof message?.content === 'string' ? message.content : null;
}

function readUsage(
  provider: ConversationLlmProvider,
  data: Record<string, unknown>,
): ConversationLlmUsage | undefined {
  if (provider === 'openai') {
    const usage = data.usage as Record<string, unknown> | undefined;
    if (!usage) return undefined;
    return {
      prompt: number(usage.input_tokens),
      completion: number(usage.output_tokens),
      total: number(usage.total_tokens),
    };
  }
  const prompt = number(data.prompt_eval_count);
  const completion = number(data.eval_count);
  if (prompt === undefined && completion === undefined) return undefined;
  return {
    prompt,
    completion,
    total: prompt !== undefined && completion !== undefined ? prompt + completion : undefined,
  };
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
