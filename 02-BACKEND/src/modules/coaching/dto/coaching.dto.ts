import { z } from 'zod';
import type {
  AcceptPlanResponse,
  ActionStatus,
  Bilingual,
  CoachingGenerationStatus,
  CoachingPlanProgress,
  CoachingPlanResponse,
  CoachingPlanStatus,
  GenerationStatusResponse,
  UpdateActionBody,
} from '@priora/shared-types';

export const updateActionSchema = z.object({
  status: z.enum(['INCOMPLETE', 'COMPLETE']),
  expected_version: z.number().int().positive().optional(),
});

export type UpdateActionInput = z.infer<typeof updateActionSchema>;

export interface UpdateActionResponse {
  action: { id: string; status: ActionStatus; version: number };
  progress: CoachingPlanProgress;
  plan_status: CoachingPlanStatus;
}

export type {
  AcceptPlanResponse,
  Bilingual,
  CoachingGenerationStatus,
  CoachingPlanProgress,
  CoachingPlanResponse,
  CoachingPlanStatus,
  GenerationStatusResponse,
  UpdateActionBody,
};
