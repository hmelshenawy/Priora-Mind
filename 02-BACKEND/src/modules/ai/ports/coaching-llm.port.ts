export const COACHING_LLM_PORT = Symbol('COACHING_LLM_PORT');

export interface AiBilingualText {
  en: string;
  ar: string;
}
export interface AiCoachingLibraryContent {
  domains: Array<{
    domain: string;
    focusAreaReasons: Record<string, AiBilingualText>;
    goals: Array<{
      libraryKey: string;
      copy: AiBilingualText;
      actions: Array<{ libraryKey: string; copy: AiBilingualText; pacingLabel?: AiBilingualText }>;
    }>;
  }>;
  pacingLabels: Record<string, AiBilingualText>;
  titleTemplates: AiBilingualText[];
  summaryTemplates: AiBilingualText[];
}

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
  library: AiCoachingLibraryContent;
  disclaimerVersion: string;
  disclaimer: AiBilingualText;
  promptVersion: string;
  instructions: string[];
  ragContext?: {
    retrieval_status: 'ok' | 'insufficient_grounding' | 'unavailable';
    chunks: Array<{
      chunk_id: string;
      text: string;
      source_id: string;
      source_title: string;
      source_type: 'pdf' | 'markdown';
      citation_page?: number | null;
      citation_heading?: string | null;
      citation_section?: string | null;
      text_hash: string;
    }>;
    allowed_chunk_ids: string[];
    correlation_id: string;
  };
}

export interface LlmPlanOutput {
  version: string;
  title: AiBilingualText;
  summary: AiBilingualText;
  focusAreas: Array<{
    domain: string;
    source: 'priority' | 'support' | 'lowest_band';
    reason: AiBilingualText;
  }>;
  goals: Array<{ libraryKey: string }>;
  actions: Array<{
    libraryKey: string;
    position: number;
    pacingLabel: AiBilingualText | null;
    copy: AiBilingualText;
  }>;
  citations?: Array<{ chunk_id: string; source_id: string; text_hash: string }>;
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
