import { ConfigService } from '@nestjs/config';

export interface AiConfig {
  provider: string;
  model: string;
  timeoutMs: number;
}

export function readAiConfig(config: ConfigService): AiConfig {
  return {
    provider: config.get<string>('COACHING_LLM_PROVIDER') ?? 'disabled',
    model: config.get<string>('COACHING_LLM_MODEL') ?? 'unconfigured',
    timeoutMs: Number(config.get<string>('COACHING_LLM_TIMEOUT_MS') ?? 20_000),
  };
}
