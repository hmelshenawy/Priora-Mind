# API Contract — Assessment

**Feature**: 001-user-onboarding-and-assessment
**Module**: Assessment (Assessment, AssessmentAnswer, AssessmentResult, deterministic scoring)
**Date**: 2026-07-29
**Base**: `HTTPS`, `/api/v1`. Protected; requires EMAIL_VERIFIED + granted consent + profile saved (OnboardingService guard).

> Scoring is deterministic and separate from safety classification (FR-016/FR-018/FR-019). No AI provider is invoked. No assessment data sent to any AI provider (plan requirement, FR-030).

---

## GET /assessment

Return the active assessment definition (versioned) and the user's saved answers/progress (FR-013, FR-014).

- 200:
  ```json
  {
    "assessment_id": "...",
    "definition_version": "...",
    "assessment_state": "NOT_STARTED" | "IN_PROGRESS" | "SUSPENDED" | "SUBMITTED" | "SCORED",
    "next_question_id": "...",
    "answered": [ { "question_id": "...", "value": ... } ],
    "introduction": { "en": "...", "ar": "..." }
  }
  ```
- If `state = SUSPENDED` or `SAFETY_HOLD`, the response includes a `safety_route` pointer (see safety.md) and does not surface domain scores.

## GET /assessment/definition

Return the pinned `AssessmentDefinition` content (16 current-state questions across 8 domains + AG-01..AG-05 + the three unscored safety questions SQ-01/SQ-02/SQ-03), bilingual (Assessment_Specification v1.0, Safety Matrix §3).

- 200: `{ version, questions: [ { id, domain, polarity, scale, required, en, ar } ], goal_questions: [...], safety_questions: [...], band_thresholds: [...], domain_labels: { en: {domain: label}, ar: {domain: label} } }` — `domain_labels` is the canonical bilingual label map for the 8 domains (single source of truth; the frontend renders AG-01 area selection + result domain names from it so EN/AR never drift).

## PUT /assessment/answers/{question_id}

Save/revise a single answer (FR-014, FR-014b). Idempotent upsert (unique `assessment_id`+`question_id`, research D6).

- Body: typed by `question_kind`:
  - current_state: `{ value: 0|1|2|3|4 }`
  - goal_select (AG-01): `{ domains: string[1..3] }`
  - goal_rank (AG-02): `{ ranking: { domain: rank } }` (unique ranks)
  - goal_free_text (AG-03/04/05): `{ text: string, suggested?: string }` (AG-03 required per selected domain; AG-04/05 optional)
  - safety (SQ-01): `{ code: "S0"|"S1"|"S2"|"SX" }`
  - safety (SQ-02): `{ code: "D0"|"D1"|"DX" }` (only accepted when SQ-01 ∈ {S1,S2,SX})
  - safety (SQ-03): `{ code: "F0"|"F1"|"F2"|"FX" }` — required; classifies DISTRESS only (F2), never HIGH_RISK/CRISIS, and never downgrades a HIGH_RISK/CRISIS from SQ-01/SQ-02 (Safety Matrix §5)
- 200: `{ saved: true, assessment_state, next_question_id, safety_route?: {...} }`
- 400: `{ error: { code: "VALIDATION", fields } }` — localized (FR-037).
- Side effects (FR-019a, Safety Matrix §4):
  1. Persist the answer.
  2. Run the Safety classifier after this answer.
  3. If `HIGH_RISK` → `Assessment.state = SUSPENDED`, `Onboarding.state = SAFETY_HOLD`, response includes `safety_route` (HIGH_RISK copy + action) and `next` is not a normal question.
  4. If `CRISIS` → interrupt immediately; response includes `safety_route` (CRISIS copy); assessment does not advance to SUBMITTED.
  5. Else → continue.

## POST /assessment/restart

Clear saved answers on the single active assessment and begin a fresh attempt (FR-014b, Assessment §10). Explicit confirmation required (Assessment §10). Overwrites (not a new row). Does not clear historical SafetyEvaluations.

- 204; `Assessment.state = IN_PROGRESS` (or `NOT_STARTED`).
- Not permitted if `state = SCORED` (no retake — FR-018a).

## POST /assessment/submit

Final, idempotent submission (FR-015, FR-034, AC-X4). Conditional state transition `IN_PROGRESS|SUSPENDED → SUBMITTED → SCORED` (research D6). Runs the final Safety evaluation on the complete answer set (FR-019a, Safety Matrix §4).

- Body: `{ }` (no payload — uses saved answers) or `{ confirm: true }` to model the review-screen confirmation (Assessment §10).
- 200 (NORMAL/DISTRESS): `{ result_id, assessment_state: "SCORED", onboarding_state: "COMPLETED", result: {...coaching insight...}, next: "/assessment/result" }`
  - `result` = the non-diagnostic coaching insight: 8 domain scores + bands, strongest domain, support domain, selected priorities, the explicit "not a diagnosis / not a substitute for professional care" statement (FR-017/FR-018), and the transition point (FR-018). No `overall_score` (FR-016).
  - If `DISTRESS`: result includes the bounded supportive messaging (Safety §6 DISTRESS routing) alongside the normal result.
- 200 (already submitted — duplicate/retry): returns the **existing** result (FR-015). No new assessment/result created.
- 409 (HIGH_RISK/CRISIS): `{ error: { code: "SAFETY_HOLD", safety_route: {...} } }` — normal result suppressed, onboarding not completed (FR-019b, FR-023).
- 409 (incomplete): `{ error: { code: "INCOMPLETE", missing: ["AS-03", "AG-01", ...] } }` — required questions missing (FR-014a).
- 503 (safety-service failure / scoring rules unavailable): `{ error: { code: "SAFETY_UNAVAILABLE" | "SCORING_UNAVAILABLE" } }` — fail closed; MUST NOT fabricate a result or mark complete (FR-025, US5 failure path).

## GET /assessment/result

Return the completed result (FR-017/FR-018). Suppressed while `SAFETY_HOLD`.

- 200: the coaching insight payload (as in submit 200).
- 409: `{ error: { code: "SAFETY_HOLD" } }` if `OnboardingState = SAFETY_HOLD` (FR-019b, Assessment §9).
- 404: no result yet (incomplete) → redirect to the unfinished step (FR-033).
- After `COMPLETED`, the result is not revisitable through this feature beyond this endpoint's read; retake is disallowed (FR-018a).

---

## Behavior notes

- One active assessment per user (FR-018a): enforced by `Assessment.user_id` unique.
- Idempotent submit via conditional state update + unique `AssessmentResult` on `assessment_id` (FR-015, research D6).
- Domain scores use the deterministic polarity + formula + thresholds + tie behavior in Assessment_Specification §7/§8/§9; no overall score (FR-016).
- Result bands are coaching labels, NOT safety levels (FR-018). The result is never labeled with or derived from safety levels.
- Free-text answers are subject to the safety evaluation and MUST NOT infer a diagnosis (Assessment §6).
- All assessment payloads are excluded from logs/analytics/traces/error reports (FR-030, research D7).
- **Retention & deletion**: incomplete assessment/goal answers expire after 30d of assessment inactivity; completed results are retained while the account exists. Enforced by the platform RetentionModule scheduled job via `AssessmentDeletionPort` (research D10). Account deletion removes assessment answers, goals, and results via the same contract (FR-031).