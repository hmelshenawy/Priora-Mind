import type {
  AcceptPlanResponse,
  CoachingPlanResponse,
  GenerationStatusResponse,
} from '@priora/shared-types';
import { ApiService } from '../../services/api';

const C = '/api/v1/coaching/plan';

export type CoachingPlanApiResponse = CoachingPlanResponse | GenerationStatusResponse;

export class CoachingApiService extends ApiService {
  startGeneration(): Promise<CoachingPlanApiResponse> {
    return this.post<CoachingPlanApiResponse>(C, {});
  }

  getPlan(): Promise<CoachingPlanApiResponse> {
    return this.get<CoachingPlanApiResponse>(C);
  }

  acceptPlan(): Promise<AcceptPlanResponse> {
    return this.post<AcceptPlanResponse>(`${C}/accept`, {});
  }
}

export const coachingApi = new CoachingApiService();
