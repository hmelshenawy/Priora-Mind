import { Injectable, Optional } from '@nestjs/common';
import { COACHING_DISCLAIMER_V1, approvedDisclaimerContentAvailable, coachingDisclaimerIntegrity } from '../constants/coaching-disclaimer';
import { COACHING_LIBRARY_V1, approvedLibraryContentAvailable, coachingLibraryIntegrity, type CoachingLibraryContent } from '../constants/coaching-library';
import type { ScoredResultDto } from '../../assessment/assessment.public';
import type { GroundingBundle } from '../../ai/ai.public';
import { RetrievalService } from '../../retrieval/retrieval.public';
import { COACHING_PLAN_PROMPT_TEMPLATE } from '../constants/coaching-plan.prompt';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlanUnavailableException } from '../constants/coaching.errors';

type Db = Record<string, { [method: string]: (...args: unknown[]) => unknown }>;

type FocusAreaEvidence = GroundingBundle['focusAreaEvidence'][number];

function scoreValue(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof (value as { score?: unknown }).score === 'number') return (value as { score: number }).score;
  return null;
}

export function buildFocusAreaEvidence(result: ScoredResultDto): GroundingBundle['focusAreaEvidence'] {
  const selected: FocusAreaEvidence[] = [];
  const add = (domain: string | null | undefined, source: FocusAreaEvidence['source']) => {
    if (!domain || selected.some((area) => area.domain === domain) || selected.length >= 3) return;
    selected.push({ domain, source });
  };
  for (const domain of result.selectedPriorities.domains) add(domain, 'priority');
  add(result.supportDomain, 'support');
  const lowest = Object.entries(result.domainScores)
    .map(([domain, value]) => ({ domain, score: scoreValue(value) }))
    .filter((entry): entry is { domain: string; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score)[0];
  add(lowest?.domain, 'lowest_band');
  return selected;
}

@Injectable()
export class CoachingGroundingService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly retrieval?: RetrievalService,
  ) {}

  get db(): Db {
    return this.prisma as unknown as Db;
  }

  async assemble(result: ScoredResultDto, profile: Record<string, unknown> = {}): Promise<GroundingBundle> {
    const libraryRow = await this.db.coachingActionLibrary.findUnique({ where: { version: COACHING_LIBRARY_V1.version } }) as { content: unknown; integrity: string } | null;
    if (!libraryRow) throw new PlanUnavailableException({ reason: 'LIBRARY_MISSING' });
    const library = libraryRow.content as CoachingLibraryContent;
    if (libraryRow.integrity !== COACHING_LIBRARY_V1.integrity) throw new PlanUnavailableException({ reason: 'LIBRARY_INTEGRITY_MISMATCH' });
    if (coachingLibraryIntegrity(COACHING_LIBRARY_V1.version, library) !== COACHING_LIBRARY_V1.integrity) {
      throw new PlanUnavailableException({ reason: 'LIBRARY_CONTENT_MISMATCH' });
    }

    const disclaimerRow = await this.db.coachingDisclaimer.findUnique({ where: { version: COACHING_DISCLAIMER_V1.version } }) as { copyEn: string; copyAr: string; integrity: string } | null;
    if (!disclaimerRow) throw new PlanUnavailableException({ reason: 'DISCLAIMER_MISSING' });
    const disclaimer = { en: disclaimerRow.copyEn, ar: disclaimerRow.copyAr };
    if (disclaimerRow.integrity !== COACHING_DISCLAIMER_V1.integrity) throw new PlanUnavailableException({ reason: 'DISCLAIMER_INTEGRITY_MISMATCH' });
    if (coachingDisclaimerIntegrity(COACHING_DISCLAIMER_V1.version, disclaimer) !== COACHING_DISCLAIMER_V1.integrity) {
      throw new PlanUnavailableException({ reason: 'DISCLAIMER_CONTENT_MISMATCH' });
    }
    if (!approvedLibraryContentAvailable() || !approvedDisclaimerContentAvailable()) {
      throw new PlanUnavailableException({ reason: 'CONTENT_GATE_UNRESOLVED' });
    }
    const focusAreaEvidence = buildFocusAreaEvidence(result);
    const bundle: GroundingBundle = {
      assessment: {
        resultId: result.resultId,
        assessmentId: result.assessmentId,
        definitionVersion: result.definitionVersion,
        domainScores: result.domainScores,
        strongestDomain: result.strongestDomain,
        supportDomain: result.supportDomain,
        selectedPriorities: result.selectedPriorities,
      },
      focusAreaEvidence,
      profile,
      libraryVersion: COACHING_LIBRARY_V1.version,
      library,
      disclaimerVersion: COACHING_DISCLAIMER_V1.version,
      disclaimer,
      promptVersion: COACHING_PLAN_PROMPT_TEMPLATE.version,
      instructions: [...COACHING_PLAN_PROMPT_TEMPLATE.instructions],
    };
    if (!this.retrieval) return bundle;
    const correlationId = `coaching-${result.resultId}`;
    const ragResult = await this.retrieval.search({
      question: `Coaching guidance for ${focusAreaEvidence.map((area) => area.domain).join(', ')}. Support area: ${result.supportDomain ?? 'none'}.`,
      limit: 6,
      score_threshold: Number(process.env.RAG_SCORE_THRESHOLD ?? '0.44'),
    }, correlationId);
    if (ragResult.status !== 'ok' || ragResult.chunks.length === 0) {
      const reason = ragResult.status === 'ok' ? 'INSUFFICIENT_GROUNDING' : 'RAG_UNAVAILABLE';
      throw new PlanUnavailableException({ reason });
    }
    return {
      ...bundle,
      ragContext: {
        retrieval_status: ragResult.status,
        chunks: ragResult.chunks,
        allowed_chunk_ids: ragResult.chunks.map((chunk) => chunk.chunk_id),
        correlation_id: ragResult.correlationId,
      },
    };
  }
}
