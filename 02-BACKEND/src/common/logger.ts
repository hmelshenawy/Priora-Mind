import { redactSensitive } from './redact';

/**
 * Structured JSON logger with built-in redaction (research D7, FR-030).
 * Context passed to any log call is scrubbed via the central denylist before
 * serialization, so sensitive fields (answers, scores, safety, tokens, PII)
 * never reach stdout/traces. For the strictest boundaries (retention job),
 * callers should pre-filter with `toSafeLogContext` before logging.
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogRecord {
  level: LogLevel;
  message: string;
  context: string;
  ctx?: Record<string, unknown>;
  ts: string;
}

export class AppLogger {
  constructor(private readonly context = 'App') {}

  info(message: string, ctx?: Record<string, unknown>): void {
    this.emit('info', message, ctx);
  }

  warn(message: string, ctx?: Record<string, unknown>): void {
    this.emit('warn', message, ctx);
  }

  error(message: string, ctx?: Record<string, unknown>): void {
    this.emit('error', message, ctx);
  }

  debug(message: string, ctx?: Record<string, unknown>): void {
    this.emit('debug', message, ctx);
  }

  private emit(level: LogLevel, message: string, ctx?: Record<string, unknown>): void {
    const record: LogRecord = {
      level,
      message,
      context: this.context,
      ...(ctx ? { ctx: redactSensitive(ctx) as Record<string, unknown> } : {}),
      ts: new Date().toISOString(),
    };
    process.stdout.write(JSON.stringify(record) + '\n');
  }
}