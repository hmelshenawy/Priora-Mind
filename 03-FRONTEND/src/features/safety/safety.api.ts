import { ApiService } from '../../services/api';

/**
 * Safety API client (US6, contracts/safety.md, FR-019..FR-025, Safety Matrix §4/§6/§9).
 * All paths include the `/api/v1` prefix. Endpoints require a valid access token +
 * EMAIL_VERIFIED + granted consent (backend-enforced; the in-memory access token is
 * attached by the shared api-client).
 *
 * Safety classification is deterministic backend-only (no AI, SAD ADR-006). The
 * frontend only RENDERS the approved `safety_route` copy/actions/resources and the
 * SAFETY_HOLD page, and submits user-initiated re-entry answers. It never invents
 * hotline numbers, emergency resources, or clinical copy (FR-024) — `resources` is
 * empty unless the backend ships approved rows. The bilingual copy comes from the
 * backend (single source of truth — no EN/AR drift, Constitution X).
 */

export type LanguageCode = 'en' | 'ar';
export interface BilingualEntry { en: string; ar: string }

/** A selectable option on a safety question (SQ-01/02/03, Safety §3). */
export interface SafetyOption {
  code: string;
  en: string;
  ar: string;
}

/** A safety question from the assessment definition (Safety §3). SQ-02 is shown only
 * when SQ-01 ∈ `shown_when` (null = always shown). */
export interface SafetyQuestion {
  id: 'SQ-01' | 'SQ-02' | 'SQ-03';
  required: boolean;
  shown_when: readonly string[] | null;
  prompt_en: string;
  prompt_ar: string;
  options: readonly SafetyOption[];
}

export interface SafetyActionDto {
  id: 'seek_support' | 'emergency_services';
  label: BilingualEntry;
  type: 'navigate' | 'external_fallback';
}

export interface EmergencyResourceDto {
  country_code: string | null;
  text: BilingualEntry;
  approved: boolean;
}

/**
 * `safety_route` payload (contracts/safety.md). Returned by save/submit/assessment
 * responses when the current evaluation is HIGH_RISK or CRISIS, and by re-entry when
 * the hold persists. HIGH_RISK → SUSPENDED + resume_available=true; CRISIS →
 * INTERRUPTED + resume_available=false. No invented resources (FR-024).
 */
export interface SafetyRoute {
  level: 'HIGH_RISK' | 'CRISIS';
  copy: BilingualEntry;
  actions: readonly SafetyActionDto[];
  resources: readonly EmergencyResourceDto[];
  assessment_state: 'SUSPENDED' | 'INTERRUPTED';
  onboarding_state: 'SAFETY_HOLD';
  resume_available: boolean;
}

export interface HistoricalEvaluation {
  level: 'NORMAL' | 'DISTRESS' | 'HIGH_RISK' | 'CRISIS';
  evaluated_at: string;
  trigger_context: 'per_answer' | 'on_submit' | 're_entry';
  definition_version: string;
}

/** `GET /safety/hold` 200 (contracts/safety.md). */
export interface SafetyHoldResponse {
  level: 'NORMAL' | 'DISTRESS' | 'HIGH_RISK' | 'CRISIS';
  copy: BilingualEntry;
  historical: readonly HistoricalEvaluation[];
  can_initiate_reentry: boolean;
}

/** `POST /safety/reentry` body (contracts/safety.md). Fresh safety answers; re_evaluate=true. */
export interface SafetyReentryBody {
  re_evaluate: true;
  safety_answers: { 'SQ-01': string; 'SQ-02'?: string; 'SQ-03': string };
}

/** Re-entry 200 when NORMAL/DISTRESS resume the suspended assessment. */
export interface SafetyReentryResumeResponse {
  onboarding_state: 'ASSESSMENT_IN_PROGRESS';
  assessment_state: 'IN_PROGRESS';
  next: '/assessment';
  safety_evaluation_id: string;
  level: 'NORMAL' | 'DISTRESS';
}

/** Re-entry 200 when HIGH_RISK/CRISIS keeps the hold. */
export interface SafetyReentryHoldResponse {
  onboarding_state: 'SAFETY_HOLD';
  safety_route: SafetyRoute;
  safety_evaluation_id: string;
  level: 'HIGH_RISK' | 'CRISIS';
}

export type SafetyReentryResponse = SafetyReentryResumeResponse | SafetyReentryHoldResponse;

const S = '/api/v1/safety';

export class SafetyApiService extends ApiService {
  getHold(): Promise<SafetyHoldResponse> {
    return this.get<SafetyHoldResponse>(`${S}/hold`);
  }
  reentry(body: SafetyReentryBody): Promise<SafetyReentryResponse> {
    return this.post<SafetyReentryResponse>(`${S}/reentry`, body);
  }
}

/** Singleton used by hooks; the underlying api-client handles 401 refresh. */
export const safetyApi = new SafetyApiService();