import type { CoachingPlanResponse, GenerationStatusResponse } from '@priora/shared-types';

type PlanRow = Record<string, unknown>;

export function toGenerationStatusResponse(plan: PlanRow): GenerationStatusResponse {
  return { plan_id: String(plan.id), generationStatus: plan.generationStatus as never };
}

export function toPlanUnavailableResponse(plan: PlanRow) {
  return { plan_id: String(plan.id), generationStatus: 'FAILED' as const, retryable: true };
}

export function toCoachingPlanResponse(plan: PlanRow, children: {
  focusAreas: Record<string, unknown>[];
  goals: Record<string, unknown>[];
  actions: Record<string, unknown>[];
}): CoachingPlanResponse {
  const completed = children.actions.filter((a) => a.status === 'COMPLETE').length;
  return {
    plan_id: String(plan.id),
    plan_version: Number(plan.planVersion ?? 1),
    generationStatus: 'READY',
    planStatus: plan.planStatus as never,
    source: {
      assessment_id: String(plan.sourceAssessmentId),
      result_id: String(plan.sourceResultId),
      definition_version: String(plan.definitionVersion),
      library_version: String(plan.libraryVersion),
      disclaimer_version: String(plan.disclaimerVersion),
      prompt_version: String(plan.promptVersion),
    },
    title: plan.title as never,
    summary: plan.summary as never,
    disclaimer: plan.disclaimer as never,
    focus_areas: children.focusAreas.map((area) => ({
      id: String(area.id),
      domain: String(area.domain),
      source: area.source as never,
      position: Number(area.position),
      reason: area.reason as never,
    })),
    goals: children.goals.map((goal) => ({
      id: String(goal.id),
      focus_area_id: String(goal.focusAreaId),
      library_key: String(goal.libraryKey),
      position: Number(goal.position),
      copy: goal.copy as never,
    })),
    actions: children.actions.map((action) => ({
      id: String(action.id),
      focus_area_id: String(action.focusAreaId),
      goal_id: action.goalId ? String(action.goalId) : null,
      library_key: String(action.libraryKey),
      position: Number(action.position),
      pacing_label: (action.pacingLabel as never) ?? null,
      copy: action.copy as never,
      status: action.status as never,
      version: Number(action.version ?? 1),
    })),
    progress: { completed, total: children.actions.length },
  };
}
