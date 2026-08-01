import type { BilingualText, CoachingLibraryContent } from '../coaching-library';

export const COACHING_LLM_PORT = Symbol('COACHING_LLM_PORT');

export interface GroundingBundle {
  assessment: {
    resultId: string;
    assessmentId: string;
    definitionVersion: string;
    domainScores: Record<string, unknown>;
    strongestDomain: string;
    supportDomain: string;
    selectedPriorities: { domains: string[]; ranking: Record<string, number> };
  };
  focusAreaEvidence: Array<{ domain: string; source: 'priority' | 'support' | 'lowest_band' }>;
  profile: Record<string, unknown>;
  libraryVersion: string;
  library: CoachingLibraryContent;
  disclaimerVersion: string;
  disclaimer: BilingualText;
  promptVersion: string;
  instructions: string[];
}

export interface LlmPlanOutput {
  version: string;
  title: BilingualText;
  summary: BilingualText;
  focusAreas: Array<{
    domain: string;
    source: 'priority' | 'support' | 'lowest_band';
    reason: BilingualText;
  }>;
  goals: Array<{ libraryKey: string }>;
  actions: Array<{
    libraryKey: string;
    position: number;
    pacingLabel: BilingualText | null;
    copy: BilingualText;
  }>;
  disclaimerReference: { version: string };
}

export interface LlmPlanResult {
  output: LlmPlanOutput;
  usage: { prompt: number; completion: number; total: number };
  latencyMs: number;
  modelId: string;
}

export interface CoachingLlmPort {
  generatePlan(bundle: GroundingBundle): Promise<LlmPlanResult>;
}
