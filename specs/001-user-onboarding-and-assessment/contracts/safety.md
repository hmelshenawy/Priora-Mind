# API Contract — Safety

**Feature**: 001-user-onboarding-and-assessment
**Module**: Safety (SafetyEvaluation — deterministic classification)
**Date**: 2026-07-29
**Base**: `HTTPS`, `/api/v1`. Protected.

> The Safety module classifies deterministically and **without generative AI** (FR-019/FR-020, Safety Matrix §2). It is separate from Assessment scoring and from the AI provider integration (SAD ADR-006). Safety takes precedence over completion (FR-023). Fail closed (FR-025).

The Safety service is invoked internally by the Assessment/Onboarding flows (after each saved answer and on submit — FR-019a). Most user-facing safety interaction is delivered through `safety_route` payloads on assessment responses and through the dedicated `/safety/hold` route.

---

## `safety_route` payload (embedded in assessment responses)

Returned whenever a safety evaluation produces HIGH_RISK or CRISIS, or when re-entry is needed:

```json
{
  "level": "HIGH_RISK" | "CRISIS",
  "copy": { "en": "...approved deterministic copy...", "ar": "..." },
  "actions": [ { "id": "seek_support" | "emergency_services", "label": { "en": "...", "ar": "..." }, "type": "navigate" | "external_fallback" } ],
  "resources": [ { "country_code": null | "...", "text": { "en": "...", "ar": "..." }, "approved": true } ],
  "assessment_state": "SUSPENDED" | "INTERRUPTED",
  "onboarding_state": "SAFETY_HOLD",
  "resume_available": true | false
}
```

- Copy is the **exact approved** deterministic copy from `SafetyCopy` (versioned) — never generative (FR-020/FR-021, Safety Matrix §7).
- `resources`: only approved, versioned `EmergencyResource` rows are shown; if none approved for the context, `resources` is empty and the copy directs the user to local emergency services / a trusted person (Safety Matrix §8). No invented numbers (FR-024).
- HIGH_RISK: `assessment_state = SUSPENDED`, saved answers retained, `resume_available = true` (user-initiated re-entry later — Safety Matrix §6).
- CRISIS: `assessment_state = INTERRUPTED`, no scoring/results, no auto-resume (Safety Matrix §6).

## GET /safety/hold

The SAFETY_HOLD page data (US6). Shows the latest current SafetyEvaluation's approved copy and the re-entry prompt.

- 200: `{ level, copy: {...}, historical: [ { level, evaluated_at, trigger_context, definition_version } ], can_initiate_reentry: true }`
  - `historical` lists prior evaluations **without editing or relabeling** them (Safety Matrix §9). No claim that any crisis ended.
- The user must see the safety message before any resume action (Safety Matrix §9).

## POST /safety/reentry

User-initiated re-entry from `SAFETY_HOLD` (FR-019b context, Safety Matrix §9). Creates a **new** `SafetyEvaluation` and routes per its result. Never edits/downgrades/relabels historical evaluations; never declares a crisis clinically ended.

- Body: `{ re_evaluate: true }` — re-asks the required safety check (SQ-01, SQ-02 when applicable, and SQ-03); the client must collect fresh safety answers and submit them here.
- 200 (NORMAL/DISTRESS): `{ onboarding_state: "ASSESSMENT_IN_PROGRESS", assessment_state: "IN_PROGRESS" | "SUSPENDED→IN_PROGRESS", next: "/assessment", safety_evaluation_id, level }` — the suspended assessment may resume; completion still requires all answers + a final safety evaluation (Safety Matrix §9).
- 200 (HIGH_RISK): repeats HIGH_RISK routing; `SAFETY_HOLD` persists; `safety_route` returned.
- 200 (CRISIS): repeats CRISIS routing; `SAFETY_HOLD` persists; `safety_route` returned; no auto-resume.
- 503: `{ error: { code: "SAFETY_UNAVAILABLE", copy: { en: "...unavailable fallback...", "ar": "..." } } }` — fail closed; do not resume (FR-025, Safety Matrix §10).

## Internal: SafetyService.classify (not an HTTP endpoint)

Pure deterministic function `safety-classifier.ts` over `{ safety_answers: { SQ-01, SQ-02, SQ-03 }, domain_scores }` → `{ level, reasons }` (research D8). Implements Safety Matrix §5 exactly. Highest-risk-wins. SQ-01/SQ-02 determine HIGH_RISK/CRISIS; SQ-03 (F0/F1/F2/FX) classifies DISTRESS only (F2) and MUST NOT produce HIGH_RISK/CRISIS or downgrade a HIGH_RISK/CRISIS classification from SQ-01/SQ-02. A stale/duplicate request cannot downgrade an existing classification (Safety Matrix §10). The service persists an immutable, versioned `SafetyEvaluation` (append-only; `is_current` on latest — research D9).

---

## Behavior notes

- Classification is independent of `AssessmentResult` bands; only the DISTRESS pattern reads domain scores as input (≥3 domains <25 OR Mood <25 — Safety Matrix §5).
- Every evaluation is immutable/append-only; historical evaluations retained; latest completed drives current routing (plan requirement, FR-031, Safety Matrix §9).
- Client-side state cannot override server-side safety state (Safety Matrix §10).
- No safety answers, levels, reasons, or copy content are emitted to logs/analytics/traces/error reports (FR-030, Safety Matrix §10, research D7). The `level` may be emitted as a coarse routing tag only if explicitly approved by the safety reviewer; default: not emitted.
- Arabic and English routing and copy MUST be equivalent (Safety Matrix §11, FR-037). Safety copy receives immediate focus and is announced to assistive technology (Safety Matrix §11).
- All classification/routing is independently testable via fixtures without generative AI (FR-026, SC-004, Safety Matrix §12).
- **Retention & deletion**: safety answers and `SafetyEvaluation` rows are retained while the related assessment/account exists and removed on account deletion or assessment expiry via `SafetyDeletionPort` (research D10, FR-031). Historical evaluations are immutable until deletion — never edited or relabeled.