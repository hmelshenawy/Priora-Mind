import { describe, expect, it, vi } from 'vitest';
import { CoachingGroundingService, buildFocusAreaEvidence } from '../../../../src/modules/coaching/services/coaching-grounding.service';
import { PlanUnavailableException } from '../../../../src/modules/coaching/constants/coaching.errors';
import { COACHING_DISCLAIMER_V1 } from '../../../../src/modules/coaching/constants/coaching-disclaimer';
import { COACHING_LIBRARY_V1 } from '../../../../src/modules/coaching/constants/coaching-library';

const scoredResult = {
  resultId: 'result-1',
  assessmentId: 'assessment-1',
  definitionVersion: '1.0',
  domainScores: { stress: { score: 7, band: 'elevated' } },
  strongestDomain: 'stress',
  supportDomain: 'sleep',
  selectedPriorities: { domains: ['stress'], ranking: { stress: 1 } },
  goalFreeText: 'private free text',
};

function prisma(overrides: { library?: unknown; disclaimer?: unknown } = {}) {
  return {
    coachingActionLibrary: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.library === undefined
          ? { content: COACHING_LIBRARY_V1.content, integrity: COACHING_LIBRARY_V1.integrity }
          : overrides.library,
      ),
    },
    coachingDisclaimer: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.disclaimer === undefined
          ? { copyEn: COACHING_DISCLAIMER_V1.copy.en, copyAr: COACHING_DISCLAIMER_V1.copy.ar, integrity: COACHING_DISCLAIMER_V1.integrity }
          : overrides.disclaimer,
      ),
    },
  };
}

describe('CoachingGroundingService', () => {
  it('builds deterministic focus-area evidence priorities to support to lowest score, deduped and capped', () => {
    expect(buildFocusAreaEvidence({
      ...scoredResult,
      selectedPriorities: { domains: ['stress', 'sleep', 'movement'], ranking: { stress: 1, sleep: 2, movement: 3 } },
      supportDomain: 'sleep',
      domainScores: { stress: { score: 7 }, sleep: { score: 4 }, movement: { score: 2 }, connection: { score: 1 } },
    })).toEqual([
      { domain: 'stress', source: 'priority' },
      { domain: 'sleep', source: 'priority' },
      { domain: 'movement', source: 'priority' },
    ]);
    expect(buildFocusAreaEvidence({
      ...scoredResult,
      selectedPriorities: { domains: ['stress'], ranking: { stress: 1 } },
      supportDomain: 'sleep',
      domainScores: { stress: { score: 7 }, sleep: { score: 4 }, movement: { score: 2 } },
    })).toEqual([
      { domain: 'stress', source: 'priority' },
      { domain: 'sleep', source: 'support' },
      { domain: 'movement', source: 'lowest_band' },
    ]);
  });

  it('looks up pinned snapshots by exact version and no active flag', async () => {
    const db = prisma();
    const bundle = await new CoachingGroundingService(db as never).assemble(scoredResult);
    expect(bundle).toBeDefined();
    expect(db.coachingActionLibrary.findUnique).toHaveBeenCalledWith({ where: { version: COACHING_LIBRARY_V1.version } });
    expect(db.coachingDisclaimer.findUnique).toHaveBeenCalledWith({ where: { version: COACHING_DISCLAIMER_V1.version } });
  });

  it('makes one domain-owned Retrieval request with the unchanged query, limit, threshold, and correlation ID', async () => {
    const retrieval = {
      search: vi.fn().mockResolvedValue({
        status: 'ok',
        correlationId: 'coaching-result-1',
        chunks: [{
          chunk_id: 'chunk-1',
          text: 'Approved grounding',
          score: 0.9,
          source_id: 'source-1',
          source_title: 'Approved Source',
          source_type: 'pdf',
          chunk_index: 1,
          text_hash: 'hash-1',
        }],
      }),
    };

    const bundle = await new CoachingGroundingService(prisma() as never, retrieval as never).assemble(scoredResult);

    expect(retrieval.search).toHaveBeenCalledTimes(1);
    expect(retrieval.search).toHaveBeenCalledWith({
      question: 'Coaching guidance for stress, sleep. Support area: sleep.',
      limit: 6,
      score_threshold: 0.44,
    }, 'coaching-result-1');
    expect(bundle.ragContext?.chunks.map((item) => item.chunk_id)).toEqual(['chunk-1']);
  });

  it('fails closed when the library snapshot is missing', async () => {
    await expect(new CoachingGroundingService(prisma({ library: null }) as never).assemble(scoredResult)).rejects.toBeInstanceOf(PlanUnavailableException);
  });

  it('fails closed when the library integrity does not match the authoritative constant', async () => {
    await expect(new CoachingGroundingService(prisma({ library: { content: COACHING_LIBRARY_V1.content, integrity: 'corrupt' } }) as never).assemble(scoredResult)).rejects.toBeInstanceOf(PlanUnavailableException);
  });

  it('fails closed when the disclaimer snapshot is missing or corrupt', async () => {
    await expect(new CoachingGroundingService(prisma({ disclaimer: null }) as never).assemble(scoredResult)).rejects.toBeInstanceOf(PlanUnavailableException);
    await expect(new CoachingGroundingService(prisma({ disclaimer: { copyEn: '', copyAr: '', integrity: 'corrupt' } }) as never).assemble(scoredResult)).rejects.toBeInstanceOf(PlanUnavailableException);
  });
});
