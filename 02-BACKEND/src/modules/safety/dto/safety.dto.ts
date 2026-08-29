import type { BilingualEntry, SafetyLevel, TriggerContext } from '../constants/safety-definition';

/**
 * Safety DTOs (contracts/safety.md). These shapes are the wire contract for
 * `safety_route` (embedded in assessment responses), `GET /safety/hold`, and
 * `POST /safety/reentry`. Copy/resources are the approved deterministic content
 * from `safety-definition.ts` — never generative, never invented (FR-020/FR-021/
 * FR-024). No safety answers, reasons, or copy content are emitted to logs/
 * analytics (FR-030, Safety Matrix §10).
 */

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
 * `safety_route` payload (contracts/safety.md). Returned whenever a safety
 * evaluation produces HIGH_RISK or CRISIS (per-answer, on submit, on re-entry).
 * - HIGH_RISK: `assessment_state = SUSPENDED`, `resume_available = true`.
 * - CRISIS: `assessment_state = INTERRUPTED`, `resume_available = false`.
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

/** A historical evaluation row in `GET /safety/hold` (never edited/relabeled —
 * Safety Matrix §9). Carries only non-sensitive routing metadata; no answers/reasons. */
export interface HistoricalEvaluation {
  level: SafetyLevel;
  evaluated_at: string; // ISO
  trigger_context: TriggerContext;
  definition_version: string;
}

/** `GET /safety/hold` 200 response. The user sees the safety message before any
 * resume action (Safety Matrix §9). */
export interface SafetyHoldResponse {
  level: SafetyLevel;
  copy: BilingualEntry;
  historical: HistoricalEvaluation[];
  can_initiate_reentry: boolean;
}

/** `POST /safety/reentry` 200 response (NORMAL/DISTRESS). The suspended assessment
 * may resume; completion still requires all answers + a final safety evaluation
 * (Safety Matrix §9). */
export interface SafetyReentryResumeResponse {
  onboarding_state: 'ASSESSMENT_IN_PROGRESS';
  assessment_state: 'IN_PROGRESS';
  next: '/assessment';
  safety_evaluation_id: string;
  level: 'NORMAL' | 'DISTRESS';
}

/** `POST /safety/reentry` 200 response (HIGH_RISK/CRISIS). SAFETY_HOLD persists and
 * the route repeats; no auto-resume for CRISIS (Safety Matrix §9). */
export interface SafetyReentryHoldResponse {
  onboarding_state: 'SAFETY_HOLD';
  safety_route: SafetyRoute;
  safety_evaluation_id: string;
  level: 'HIGH_RISK' | 'CRISIS';
}

export type SafetyReentryResponse = SafetyReentryResumeResponse | SafetyReentryHoldResponse;

/** `POST /safety/reentry` body — re-asks the required safety check (Safety Matrix
 * §9, contracts/safety.md). Fresh safety answers are submitted here; `re_evaluate`
 * must be true. */
export interface SafetyReentryBody {
  re_evaluate: true;
  safety_answers: {
    'SQ-01': string;
    'SQ-02'?: string;
    'SQ-03': string;
  };
}