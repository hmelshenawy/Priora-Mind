import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

/**
 * OpenTelemetry bootstrap (research D7, FR-030).
 *
 * Sensitive data is kept out of spans by contract — call sites MUST NOT place
 * answers, scores, safety answers/levels, consent contents, or tokens on span
 * attributes; the central redaction layer (redact.ts) governs logging. This
 * skeleton starts auto-instrumentation when an OTLP endpoint is configured.
 *
 * NOTE: a redacting span processor + OTLP exporter package is wired in the
 * Polish phase (task T085, redaction audit). Until then, spans are collected
 * in-process and not exported, so no sensitive data leaves the process.
 */
let started: NodeSDK | undefined;

export function startTelemetry(serviceName: string): NodeSDK | undefined {
  if (started) return started;
  started = new NodeSDK({
    serviceName,
    instrumentations: [getNodeAutoInstrumentations()],
  });
  started.start();
  return started;
}

export async function shutdownTelemetry(): Promise<void> {
  if (started) {
    await started.shutdown();
    started = undefined;
  }
}