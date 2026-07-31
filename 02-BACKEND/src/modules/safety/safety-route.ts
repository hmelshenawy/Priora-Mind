import {
  APPROVED_RESOURCES,
  SAFETY_ACTIONS,
  SAFETY_COPY,
} from './safety-definition';
import type {
  EmergencyResourceDto,
  SafetyActionDto,
  SafetyRoute,
} from './safety.dto';

/**
 * Pure safety-route builder (Constitution VIII split — handwritten files MUST NOT
 * exceed 300 lines). Projects a HIGH_RISK/CRISIS `level` onto the wire `safety_route`
 * payload (contracts/safety.md). Copy = exact approved deterministic copy (FR-021);
 * actions/resources from typed constants; no invented numbers (FR-024).
 * resume_available: HIGH_RISK→true, CRISIS→false.
 *
 * Pure — reads only typed constants, holds no state, does no logging (FR-030). Shared
 * by the per-answer/on-submit evaluation paths and the re-entry flow.
 */
export function buildSafetyRoute(level: 'HIGH_RISK' | 'CRISIS'): SafetyRoute {
  return {
    level,
    copy: { en: SAFETY_COPY[level].en, ar: SAFETY_COPY[level].ar },
    actions: SAFETY_ACTIONS[level].map((a) => ({
      id: a.id,
      label: { en: a.label.en, ar: a.label.ar },
      type: a.type,
    })) as readonly SafetyActionDto[],
    resources: APPROVED_RESOURCES.map((r) => ({
      country_code: r.country_code,
      text: { en: r.text.en, ar: r.text.ar },
      approved: r.approved,
    })) as readonly EmergencyResourceDto[],
    assessment_state: level === 'HIGH_RISK' ? 'SUSPENDED' : 'INTERRUPTED',
    onboarding_state: 'SAFETY_HOLD',
    resume_available: level === 'HIGH_RISK',
  };
}