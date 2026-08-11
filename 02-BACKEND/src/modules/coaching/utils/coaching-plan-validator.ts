import type { CoachingLibraryContent } from '../constants/coaching-library';
import type { GroundingBundle, LlmPlanOutput } from '../ports/coaching-llm.port';

export interface PlanValidationResult {
  valid: boolean;
  reasons: string[];
}

const blockedTerms = [/diagnos/i, /medicat/i, /suicide/i, /crisis/i, /emergency/i];

function hasText(v: { en?: string; ar?: string } | null | undefined): boolean {
  return Boolean(v?.en?.trim() && v?.ar?.trim());
}

function libraryKeys(library: CoachingLibraryContent): Set<string> {
  const keys = new Set<string>();
  for (const domain of library.domains) {
    for (const goal of domain.goals) {
      keys.add(goal.libraryKey);
      for (const action of goal.actions) keys.add(action.libraryKey);
    }
  }
  return keys;
}

function focusEvidence(bundle: GroundingBundle): Set<string> {
  return new Set(bundle.focusAreaEvidence.map((area) => area.domain));
}

function duplicateValues(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

export function validateLlmPlanOutput(
  output: LlmPlanOutput,
  bundle: GroundingBundle,
): PlanValidationResult {
  const reasons: string[] = [];
  const keys = libraryKeys(bundle.library);
  const evidence = focusEvidence(bundle);
  if (output.version !== '1.0') reasons.push('UNSUPPORTED_OUTPUT_VERSION');
  if (!hasText(output.title)) reasons.push('TITLE_BILINGUAL_REQUIRED');
  if (!hasText(output.summary)) reasons.push('SUMMARY_BILINGUAL_REQUIRED');
  if (!output.focusAreas.length) reasons.push('FOCUS_AREA_REQUIRED');
  if (output.focusAreas.length > 3) reasons.push('FOCUS_AREA_LIMIT');
  if (duplicateValues(output.focusAreas.map((area) => area.domain))) reasons.push('DUPLICATE_FOCUS_AREA');
  if (!output.goals.length) reasons.push('GOAL_REQUIRED');
  if (output.goals.length > 9) reasons.push('GOAL_LIMIT');
  if (duplicateValues(output.goals.map((goal) => goal.libraryKey))) reasons.push('DUPLICATE_GOAL_LIBRARY_KEY');
  if (!output.actions.length) reasons.push('ACTION_REQUIRED');
  if (output.actions.length > 18) reasons.push('ACTION_LIMIT');
  if (duplicateValues(output.actions.map((action) => action.libraryKey))) reasons.push('DUPLICATE_ACTION_LIBRARY_KEY');
  for (const area of output.focusAreas) {
    if (!hasText(area.reason)) reasons.push('FOCUS_REASON_BILINGUAL_REQUIRED');
    if (!evidence.has(area.domain)) reasons.push('UNSUPPORTED_FOCUS_AREA');
    if (!['priority', 'support', 'lowest_band'].includes(area.source)) reasons.push('UNSUPPORTED_FOCUS_SOURCE');
  }
  for (const goal of output.goals) {
    if (!keys.has(goal.libraryKey)) reasons.push('UNKNOWN_GOAL_LIBRARY_KEY');
    if (!goal.libraryKey.trim()) reasons.push('GOAL_LIBRARY_KEY_REQUIRED');
  }
  for (const action of output.actions) {
    if (!keys.has(action.libraryKey)) reasons.push('UNKNOWN_ACTION_LIBRARY_KEY');
    if (!hasText(action.copy)) reasons.push('ACTION_COPY_BILINGUAL_REQUIRED');
    if (!Number.isInteger(action.position) || action.position < 1) reasons.push('ACTION_POSITION_INVALID');
    if (action.pacingLabel !== null && !hasText(action.pacingLabel)) reasons.push('ACTION_PACING_BILINGUAL_REQUIRED');
  }
  if (bundle.ragContext) {
    const allowed = new Map(bundle.ragContext.chunks.map((chunk) => [chunk.chunk_id, chunk]));
    for (const citation of output.citations ?? []) {
      const chunk = allowed.get(citation.chunk_id);
      if (!chunk) reasons.push('UNKNOWN_RAG_CITATION');
      if (chunk && (chunk.source_id !== citation.source_id || chunk.text_hash !== citation.text_hash)) reasons.push('RAG_CITATION_METADATA_MISMATCH');
    }
  }
  const rendered = JSON.stringify(output);
  if (blockedTerms.some((term) => term.test(rendered))) reasons.push('CONCERNING_OUTPUT');
  if (output.disclaimerReference.version !== bundle.disclaimerVersion) reasons.push('DISCLAIMER_VERSION_MISMATCH');
  if (!bundle.library.domains.length) reasons.push('LIBRARY_EMPTY');
  return { valid: reasons.length === 0, reasons };
}
