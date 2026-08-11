import type { LlmPlanOutput } from '../../coaching/ports/coaching-llm.port';

const bilingual = {
  type: 'object', additionalProperties: false, required: ['en', 'ar'],
  properties: { en: { type: 'string', minLength: 1 }, ar: { type: 'string', minLength: 1 } },
};

export const COACHING_PLAN_SCHEMA: Record<string, unknown> = {
  type: 'object', additionalProperties: false,
  required: ['version', 'title', 'summary', 'focusAreas', 'goals', 'actions', 'disclaimerReference'],
  properties: {
    version: { type: 'string', minLength: 1 }, title: bilingual, summary: bilingual,
    focusAreas: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['domain', 'source', 'reason'], properties: { domain: { type: 'string' }, source: { type: 'string' }, reason: bilingual } } },
    goals: { type: 'array', minItems: 1, maxItems: 9, items: { type: 'object', additionalProperties: false, required: ['libraryKey'], properties: { libraryKey: { type: 'string', minLength: 1 } } } },
    actions: { type: 'array', minItems: 1, maxItems: 18, items: { type: 'object', additionalProperties: false, required: ['libraryKey', 'position', 'pacingLabel', 'copy'], properties: { libraryKey: { type: 'string', minLength: 1 }, position: { type: 'number' }, pacingLabel: bilingual, copy: bilingual } } },
    citations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['chunk_id', 'source_id', 'text_hash'], properties: { chunk_id: { type: 'string' }, source_id: { type: 'string' }, text_hash: { type: 'string' } } } },
    disclaimerReference: { type: 'object', additionalProperties: false, required: ['version'], properties: { version: { type: 'string' } } },
  },
};

function bilingualValue(value: unknown): boolean {
  const item = value as { en?: unknown; ar?: unknown };
  return Boolean(item && typeof item.en === 'string' && item.en.trim() && typeof item.ar === 'string' && item.ar.trim());
}

export function isPlanOutput(value: unknown): value is LlmPlanOutput {
  const output = value as Partial<LlmPlanOutput>;
  return Boolean(output && output.version === '1.0' && bilingualValue(output.title) && bilingualValue(output.summary)
    && Array.isArray(output.focusAreas) && output.focusAreas.length > 0
    && output.focusAreas.every((area) => typeof area?.domain === 'string' && bilingualValue(area.reason))
    && Array.isArray(output.goals) && output.goals.length > 0 && output.goals.every((goal) => typeof goal?.libraryKey === 'string')
    && Array.isArray(output.actions) && output.actions.length > 0
    && output.actions.every((action) => typeof action?.libraryKey === 'string' && Number.isInteger(action.position) && bilingualValue(action.copy) && (action.pacingLabel === null || bilingualValue(action.pacingLabel)))
    && typeof output.disclaimerReference?.version === 'string');
}