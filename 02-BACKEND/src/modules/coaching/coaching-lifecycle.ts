import type { CoachingPlanStatus } from '@priora/shared-types';

export function recomputePlanStatus(incompleteCount: number): CoachingPlanStatus {
  return incompleteCount === 0 ? 'COMPLETED' : 'ACTIVE';
}
