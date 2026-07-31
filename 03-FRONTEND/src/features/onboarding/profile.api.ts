import { ApiService } from '../../services/api';

/**
 * Profile + onboarding API client (US3, contracts/profile-onboarding.md). All
 * paths include the `/api/v1` prefix to match the backend global prefix.
 * Endpoints require a valid access token + EMAIL_VERIFIED (backend-enforced);
 * the in-memory access token is attached by the shared api-client.
 */

export type LanguageCode = 'en' | 'ar';

export interface ProfileResponse {
  language_code: LanguageCode;
  timezone: string;
}

export interface OnboardingStateResponse {
  onboarding_state: string;
  current_step: string | null;
  assessment_state: string | null;
  language_code: LanguageCode | null;
  requires_reconsent: boolean;
  next_route: string | null;
}

/**
 * Authoritative completion check (US9, FR-033; contracts/profile-onboarding.md
 * GET /onboarding/completion). `completed` is true only when the backend
 * OnboardingState = COMPLETED (excludes SAFETY_HOLD + every incomplete state).
 * The frontend router uses this boolean to bypass onboarding for returning
 * completed users (SC-009) and route incomplete users to their unfinished step.
 */
export interface OnboardingCompletionResponse {
  completed: boolean;
  onboarding_state: string;
  post_onboarding_route: '/dashboard';
}

export interface PutProfileBody {
  language_code: LanguageCode;
  timezone: string;
}

export interface PutProfileResponse {
  profile: { created_at: string };
  preferences: { language_code: LanguageCode; timezone: string };
  onboarding_state: 'ASSESSMENT_PENDING';
  next: '/assessment';
}

export interface PutLanguageBody {
  language_code: LanguageCode;
}

export interface PutLanguageResponse {
  language_code: LanguageCode;
  dir: 'rtl' | 'ltr';
}

const ONB = '/api/v1/onboarding';
const ME = '/api/v1/me';

export class ProfileApiService extends ApiService {
  getOnboardingState(): Promise<OnboardingStateResponse> {
    return this.get<OnboardingStateResponse>(`${ONB}/state`);
  }

  getOnboardingCompletion(): Promise<OnboardingCompletionResponse> {
    return this.get<OnboardingCompletionResponse>(`${ONB}/completion`);
  }

  getProfile(): Promise<ProfileResponse> {
    return this.get<ProfileResponse>(`${ME}/profile`);
  }

  putProfile(body: PutProfileBody): Promise<PutProfileResponse> {
    return this.put<PutProfileResponse>(`${ONB}/profile`, body);
  }

  putLanguage(body: PutLanguageBody): Promise<PutLanguageResponse> {
    return this.put<PutLanguageResponse>(`${ME}/preferences/language`, body);
  }
}

/** Singleton used by hooks; the underlying api-client handles 401 refresh. */
export const profileApi = new ProfileApiService();