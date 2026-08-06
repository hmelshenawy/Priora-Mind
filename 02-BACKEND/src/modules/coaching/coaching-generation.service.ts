import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { COACHING_DISCLAIMER_V1, approvedDisclaimerContentAvailable } from './coaching-disclaimer';
import { COACHING_LIBRARY_V1, approvedLibraryContentAvailable } from './coaching-library';
import { PlanUnavailableException } from './coaching.errors';
import { CoachingGroundingService } from './coaching-grounding.service';
import { validateLlmPlanOutput } from './coaching-plan-validator';
import type { ScoredResultDto } from '../assessment/assessment.dto';
import { COACHING_LLM_PORT, type CoachingLlmPort } from './ports/coaching-llm.port';
import type { GroundingBundle, LlmPlanOutput } from './ports/coaching-llm.port';
import { normalizeConversationLlmError } from '../ai/conversation-llm.errors';

type Db = Record<string, { [method: string]: (...args: unknown[]) => unknown }> & {
  $transaction: <T>(fn: (tx: Db) => Promise<T>) => Promise<T>;
};

interface PersistedGraph {
  focusAreas: Array<{ domain: string; source: 'priority' | 'support' | 'lowest_band'; reason: { en: string; ar: string } }>;
  goals: Array<{ libraryKey: string; focusDomain: string; copy: { en: string; ar: string } }>;
  actions: Array<{ libraryKey: string; goalLibraryKey: string; position: number; pacingLabel: { en: string; ar: string } | null; copy: { en: string; ar: string } }>;
}

@Injectable()
export class CoachingGenerationService {
  private readonly inFlight = new Map<string, AbortController>();
  private readonly leaseMs = Number(process.env.COACHING_LLM_TIMEOUT_MS ?? 20_000) + 5_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly grounding: CoachingGroundingService,
    @Inject(COACHING_LLM_PORT) private readonly llm: CoachingLlmPort,
  ) {}

  get db(): Db {
    return this.prisma as unknown as Db;
  }

  async start(plan: Record<string, unknown>, result: ScoredResultDto): Promise<void> {
    const planId = String(plan.id);
    if (this.inFlight.has(planId)) return;
    const attemptId = crypto.randomUUID();
    const startedAt = new Date();
    const deadlineAt = new Date(startedAt.getTime() + this.leaseMs);
    const claimed = await this.db.coachingPlan.updateMany({
      where: { id: planId, generationStatus: 'PENDING' },
      data: { generationStatus: 'GENERATING', generationStartedAt: startedAt, generationDeadlineAt: deadlineAt, currentAttemptId: attemptId },
    }) as { count: number };
    if (claimed.count !== 1) return;
    const existingAttempts = await this.db.coachingPlanGeneration.findMany({ where: { planId } }) as unknown[];
    const attempt = existingAttempts.length + 1;
    await this.db.coachingPlanGeneration.create({ data: {
      id: attemptId,
      planId,
      attempt,
      provider: 'configured',
      modelId: 'configured',
      promptVersion: String(plan.promptVersion),
      sourceAssessmentId: String(plan.sourceAssessmentId),
      sourceResultId: String(plan.sourceResultId),
      definitionVersion: String(plan.definitionVersion),
      libraryVersion: String(plan.libraryVersion),
      disclaimerVersion: String(plan.disclaimerVersion),
      status: 'GENERATING',
      retryCount: attempt - 1,
      startedAt,
      deadlineAt,
    } });
    const controller = new AbortController();
    this.inFlight.set(planId, controller);
    void this.run(planId, attemptId, result).finally(() => this.inFlight.delete(planId));
  }

  async waitForIdle(planId: string, timeoutMs = 1_000): Promise<void> {
    const started = Date.now();
    while (this.inFlight.has(planId)) {
      if (Date.now() - started > timeoutMs) throw new Error('coaching generation did not settle');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  async reclaimIfStale(plan: Record<string, unknown>): Promise<void> {
    if (plan.generationStatus !== 'GENERATING') return;
    const deadline = plan.generationDeadlineAt as Date | null;
    if (!deadline || deadline.getTime() >= Date.now()) return;
    await this.failAttempt(String(plan.id), String(plan.currentAttemptId), 'STALE', ['STALE']);
    await this.db.coachingPlan.update({
      where: { id: String(plan.id) },
      data: { generationStatus: 'PENDING', generationStartedAt: null, generationDeadlineAt: null, currentAttemptId: null },
    });
  }

  private async run(planId: string, attemptId: string, result: ScoredResultDto): Promise<void> {
    try {
      if (!approvedLibraryContentAvailable() || !approvedDisclaimerContentAvailable()) {
        await this.failAttempt(planId, attemptId, 'PLAN_UNAVAILABLE', ['CONTENT_GATE_UNRESOLVED']);
        return;
      }
      const bundle = await this.grounding.assemble(result);
      if (bundle.libraryVersion !== COACHING_LIBRARY_V1.version || bundle.disclaimerVersion !== COACHING_DISCLAIMER_V1.version) {
        throw new PlanUnavailableException();
      }
      const generated = await this.llm.generatePlan(bundle);
      const validation = validateLlmPlanOutput(generated.output, bundle);
      if (!validation.valid) {
        await this.failAttempt(planId, attemptId, 'VALIDATION_FAILED', validation.reasons);
        return;
      }
      const graph = this.mapGraph(bundle, generated.output);
      await this.db.$transaction(async (tx) => {
        const updated = await tx.coachingPlan.updateMany({
          where: { id: planId, generationStatus: 'GENERATING', currentAttemptId: attemptId },
          data: {
            generationStatus: 'READY',
            planStatus: 'PROPOSED',
            title: generated.output.title,
            summary: generated.output.summary,
            disclaimer: bundle.disclaimer,
            updatedAt: new Date(),
          },
        }) as { count: number };
        if (updated.count !== 1) return;
        const focusAreaIds = new Map<string, string>();
        const goalIds = new Map<string, string>();
        for (const [index, area] of graph.focusAreas.entries()) {
          const row = await tx.focusArea.create({ data: { planId, domain: area.domain, source: area.source, position: index + 1, reason: area.reason } }) as { id: string; domain: string };
          focusAreaIds.set(area.domain, row.id);
        }
        for (const [index, goal] of graph.goals.entries()) {
          const focusAreaId = focusAreaIds.get(goal.focusDomain);
          if (!focusAreaId) throw new Error('goal focus area missing');
          const row = await tx.goal.create({ data: { planId, focusAreaId, position: index + 1, copy: goal.copy, libraryKey: goal.libraryKey } }) as { id: string };
          goalIds.set(goal.libraryKey, row.id);
        }
        for (const action of graph.actions) {
          const goalId = goalIds.get(action.goalLibraryKey);
          const goal = graph.goals.find((item) => item.libraryKey === action.goalLibraryKey);
          const focusAreaId = goal ? focusAreaIds.get(goal.focusDomain) : null;
          if (!goalId || !focusAreaId) throw new Error('action goal missing');
          await tx.actionStep.create({ data: { planId, focusAreaId, goalId, position: action.position, pacingLabel: action.pacingLabel, copy: action.copy, libraryKey: action.libraryKey } });
        }
        await tx.coachingPlanGeneration.update({
          where: { id: attemptId },
          data: { status: 'READY', modelId: generated.modelId, validationOutcome: { result: 'VALID', reasons: [] }, tokenUsage: generated.usage, latencyMs: generated.latencyMs, finishedAt: new Date() },
        });
      });
    } catch (error) {
      const code = error instanceof PlanUnavailableException ? 'PLAN_UNAVAILABLE' : normalizeConversationLlmError(error);
      await this.failAttempt(planId, attemptId, code, [code]);
    }
  }

  private mapGraph(bundle: GroundingBundle, output: LlmPlanOutput): PersistedGraph {
    const focusDomains = new Set(output.focusAreas.map((area) => area.domain));
    const seenGoalKeys = new Set<string>();
    const seenActionKeys = new Set<string>();
    const goals: PersistedGraph['goals'] = [];
    const actions: PersistedGraph['actions'] = [];
    for (const requestedGoal of output.goals) {
      if (seenGoalKeys.has(requestedGoal.libraryKey)) throw new Error('duplicate goal key');
      seenGoalKeys.add(requestedGoal.libraryKey);
      const match = this.findGoal(bundle, requestedGoal.libraryKey);
      if (!match || !focusDomains.has(match.domain)) throw new Error('unknown goal key');
      goals.push({ libraryKey: requestedGoal.libraryKey, focusDomain: match.domain, copy: match.goal.copy });
    }
    const goalKeys = new Set(goals.map((goal) => goal.libraryKey));
    for (const requestedAction of output.actions) {
      if (seenActionKeys.has(requestedAction.libraryKey)) throw new Error('duplicate action key');
      seenActionKeys.add(requestedAction.libraryKey);
      const match = this.findAction(bundle, requestedAction.libraryKey);
      if (!match || !goalKeys.has(match.goal.libraryKey)) throw new Error('unknown action key');
      actions.push({
        libraryKey: requestedAction.libraryKey,
        goalLibraryKey: match.goal.libraryKey,
        position: requestedAction.position,
        pacingLabel: requestedAction.pacingLabel,
        copy: requestedAction.copy,
      });
    }
    return { focusAreas: output.focusAreas, goals, actions };
  }

  private findGoal(bundle: GroundingBundle, key: string) {
    for (const domain of bundle.library.domains) {
      for (const goal of domain.goals) if (goal.libraryKey === key) return { domain: domain.domain, goal };
    }
    return null;
  }

  private findAction(bundle: GroundingBundle, key: string) {
    for (const domain of bundle.library.domains) {
      for (const goal of domain.goals) {
        for (const action of goal.actions) if (action.libraryKey === key) return { domain: domain.domain, goal, action };
      }
    }
    return null;
  }

  private async failAttempt(planId: string, attemptId: string, code: string, reasons: string[]): Promise<void> {
    await this.db.coachingPlan.updateMany({
      where: { id: planId, generationStatus: 'GENERATING', currentAttemptId: attemptId },
      data: { generationStatus: 'FAILED', planStatus: null, generationStartedAt: null, generationDeadlineAt: null, currentAttemptId: null, updatedAt: new Date() },
    });
    await this.db.coachingPlanGeneration.update({
      where: { id: attemptId },
      data: { status: 'FAILED', validationOutcome: { result: 'INVALID', reasons }, errorCode: code, finishedAt: new Date() },
    });
  }

}
