# Quickstart — 001-user-onboarding-and-assessment

**Purpose**: End-to-end validation recipe for the feature, mapped to acceptance scenarios (US1–US9, SC-001..SC-010) and the required safety/scoring fixtures (Assessment_Specification §12, Safety_Decision_Matrix §12). This is a manual + automated validation guide, not a setup tutorial; it assumes the stack from plan.md is running.

**Date**: 2026-07-29

---

## 0. Preconditions

- PostgreSQL running; Prisma migrations (m_init_auth … m_safety, m_retention) applied; reference content seeded (AssessmentDefinition/SafetyDefinition/SafetyCopy/NoticeVersionSet v1.0; EmergencyResource empty pending approval).
- Backend (`NestJS`) and frontend (`Next.js`) running over HTTPS; refresh cookie + JWT configured (research D3).
- **Email**: `EmailPort` wired with the `FakeEmailAdapter` for dev/automated tests (in-memory, captures sent messages); production runs the config-selected transactional provider adapter (research D2). Email is the feature's one external integration.
- Test database isolated from production; redaction layer active (research D7).
- No AI provider configured or required (this feature is deterministic).

---

## 1. Full onboarding journey — US1 → US5 (NORMAL) — SC-001/SC-002

1. `POST /auth/register` with a new email → 201 anti-enumeration response; verify a `UserAccount(REGISTERED)` + a verification email was captured by the `FakeEmailAdapter` (assert recipient + language + that a hashed `VerificationToken` row exists; raw token only in the captured link — research D2).
2. Follow the verification link (`GET /auth/verify-email?token=...`) → 200 `EMAIL_VERIFIED`; onboarding redirects to `/onboarding/boundary`.
3. `GET /onboarding/notices` → service-boundary disclosure + Terms + Privacy links + versions, in EN.
4. `POST /onboarding/consent` with all three acknowledgments + current versions → 201; onboarding → `IN_PROGRESS`; next `/onboarding/profile`.
5. `PUT /onboarding/profile` `{language_code:"en", timezone:"Africa/Cairo"}` → `ASSESSMENT_PENDING`; next `/assessment`.
6. `GET /assessment` → definition + introduction ("coaching/screening tool, not a diagnosis").
7. Save answers (`PUT /assessment/answers/{id}`) for all 16 current-state + AG-01/02/03 + SQ-01=`S0` + SQ-03=`F0`. Each save returns the next question; no `safety_route` (NORMAL).
8. `POST /assessment/submit` → 200 with `result` (8 domain scores + bands, strongest, support domain, selected priorities, non-diagnostic statement, transition point), `onboarding_state=COMPLETED`, next `/assessment/result`.
9. `GET /assessment/result` → same coaching insight; no `overall_score`; bands not labeled as safety levels.

**Pass**: SC-001 (no dead-end), SC-002 (non-diagnostic framing).

## 2. Bilingual + RTL — US7 — SC-005/SC-006

1. Repeat step 5 with `language_code:"ar"` → `dir="rtl"` on the document; all subsequent content in Arabic.
2. `PUT /me/preferences/language { "ar"|"en" }` mid-assessment → content + direction re-render; saved answers retained (FR-011).
3. Playwright RTL suite asserts direction, mixed AR/EN/number/date ordering, and keyboard/focus order in both LTR and RTL (FR-036, SC-006).
4. Missing-string fixture: a removed AR key for a **non-safety** string shows the defined fallback; a removed AR key for **safety** copy blocks continuation with the approved bilingual fallback (FR-037, Safety Matrix §11).

**Pass**: SC-005, SC-006.

## 3. Safety routing — US6 — SC-004, Safety Matrix §12 fixtures

Run the pure classifier + API fixture suite (`safety-classifier.spec.ts`), no AI, no DB where possible:

| Fixture | Expected |
|---|---|
| SQ-01=`S0` | NORMAL, no escalation |
| SQ-01=`S1`, SQ-02=`D0` | HIGH_RISK; `Assessment=SUSPENDED`, `Onboarding=SAFETY_HOLD`; result deferred |
| SQ-01=`S1`, SQ-02=`D1` | CRISIS; interrupt; `SAFETY_HOLD`; no submit/score |
| SQ-01=`S2` | immediate CRISIS |
| SQ-01=`SX`, SQ-02=`DX` | CRISIS |
| SQ-03=`F2` (no SQ-01/SQ-02 trigger) | DISTRESS only (continues; result available with supportive copy) |
| SQ-03=`F0`/`F1`/`FX` | no direct escalation from SQ-03 alone |
| SQ-03 never downgrades | SQ-01=`S2` + SQ-03=`F2` → CRISIS (not DISTRESS) |
| Distress boundary | ≥3 domains <25 OR Mood<25 → DISTRESS (continues, result available with supportive copy) |
| Highest-risk-wins | conflicting signals → highest level |
| Per-answer + on-submit | evaluation runs after each answer and on submit |
| Fail-closed | classifier throws → 503 `SAFETY_UNAVAILABLE`; no result, no completion |
| Stale/duplicate cannot downgrade | a repeated/stale request does not lower an existing HIGH_RISK/CRISIS |
| AR/EN parity | identical routing for mirrored AR fixtures |
| No AI | no provider invocation recorded |
| No unapproved resource | `resources` empty unless an approved `EmergencyResource` exists; fallback copy only; no invented numbers |

**Pass**: SC-004; FR-019..FR-026.

## 4. SAFETY_HOLD re-entry — US6 acceptance, research D9

1. From §3, reach HIGH_RISK → `SAFETY_HOLD`.
2. Sign out, sign back in → `GET /safety/hold` shows latest copy + historical evaluations (un-edited, un-relabeled; no "crisis ended" claim).
3. `POST /safety/reentry` with fresh SQ-01=`S0` (+ SQ-03=`F0`) → new `SafetyEvaluation(NORMAL)`, `Onboarding=ASSESSMENT_IN_PROGRESS`, resume `/assessment`.
4. Complete remaining answers → `POST /assessment/submit` → final safety eval NORMAL → `COMPLETED`, result presented.
5. Negative: re-enter with SQ-01=`S2` → CRISIS repeats; `SAFETY_HOLD` persists; no auto-resume; historical evaluations unchanged.

**Pass**: US6 re-entry acceptance scenarios; "preserve historical, use latest completed for routing".

## 5. Duplicate submission — US4/AC-X4 — SC-003

1. Complete the assessment to `SCORED`.
2. `POST /assessment/submit` again (double-click / retry) → returns the **existing** result; no new `Assessment`/`AssessmentResult` row.
3. Concurrent submit from two tabs → exactly one result (conditional state update).

**Pass**: SC-003; FR-015/FR-034.

## 6. Resume / restart — US8 — SC-007

1. Stop mid-assessment (some answers saved). Sign in again → `GET /assessment` returns `next_question_id` at the last unanswered question; saved answers intact.
2. `POST /assessment/restart` (confirmed) → saved answers cleared on the same active assessment; no duplicate assessment created.
3. Corrupt-progress fixture → system offers safe restart; no partial result presented as complete.

**Pass**: SC-007.

## 7. Returning completed user — US9 — SC-009

1. From §1, reach `COMPLETED`.
2. Re-authenticate, hit app entry → `GET /onboarding/completion` returns `completed:true` → routed to `/dashboard`; cannot re-enter onboarding unconditionally (FR-018a).
3. Negative: incomplete user → routed to the unfinished step; if state undeterminable → earliest unfinished step (US9 failure path).

**Pass**: SC-009.

## 8. Authorization / isolation — AC-X3 — SC-008

1. User A completes assessment; User B authenticates separately.
2. User B calls `GET /assessment` / `GET /assessment/result` / `GET /onboarding/consent` with A's `assessment_id` → 403/404 (filtered by `user_id` server-side). Cross-user access prevented (FR-028/FR-029).
3. Frontend route-guard bypass attempt (direct URL with A's id) is still blocked by the backend.

**Pass**: SC-008.

## 9. Telemetry redaction — SC-010 — FR-030

1. Run the full journey with a captured log/trace pipeline.
2. Assert no assessment answers, goal free text, safety answers, scores, results, classification details, or consent record contents appear in logs, analytics, traces, or error responses (research D7 redaction unit test + an e2e log-scan assertion).
3. Trigger an error mid-submit → the error response and trace do not echo the submitted payload.

**Pass**: SC-010.

## 10. Consent fail-closed + re-consent — US2 — FR-007/FR-008

1. Simulate `NoticeVersionSet` unavailable → `GET /onboarding/notices` 503 → `POST /onboarding/consent` 503 (fail closed; no record; no advance).
2. Grant consent at version set V1; bump to V2 (material change) → `GET /onboarding/consent` returns `requires_reconsent:true` → protected steps pause until re-consent (FR-008).
3. Decline/incomplete acknowledgments → 400 `ACKNOWLEDGMENTS_INCOMPLETE`; no profile/assessment collected (Consent §4).

**Pass**: US2 safety scenarios.

## 11. Retention cleanup — research D10 / Consent policy §8

1. Seed rows across categories with controlled `last_activity_at`: an unverified account 8 days old; a verified pre-consent account 31 days inactive; an incomplete onboarding 31 days inactive; an incomplete assessment 31 days inactive; a completed assessment (recent) on an active account.
2. Trigger the RetentionModule `@Cron` job (or invoke its service directly in tests).
3. Assert: unverified account deleted (7d); pre-consent account deleted (30d); incomplete onboarding + assessment/goal answers deleted (30d); **completed result + active account retained**. Boundary row exactly at the cutoff is deleted; a row one second newer is retained.
4. Re-run the job → nothing further deleted (idempotency); a single `DeletionLog` row written per window with sanitized counters only.
5. Failure injection: make one category's deletion throw → that category counted as errors, **other categories still complete**; failed rows retry on next run.
6. Log/trace scan: the captured output contains **only** `{ window, category, deleted_count, error_count, run_ms }` — no email, answers, scores, safety answers/levels, or consent contents (FR-030, SC-010).

**Pass**: FR-031; Consent §8/§9.

## 12. Account deletion — Consent policy §9 / FR-031

1. From §1, reach `COMPLETED` (profile, consent, assessment answers, goals, result, safety evaluations all present).
2. Submit an authenticated account-deletion request.
3. Assert: profile, preferences, onboarding, assessment answers, goals, result, safety answers/evaluations, consent records, and any cached/derived copies are removed; new processing is blocked on acceptance; a `DeletionLog` (account_deletion) row records sanitized counters.
4. Re-submit the same request → idempotent; no error, no double-delete side effects; completion not reported until all stores confirm (Consent §9).

---

## Automated coverage map

| Concern | Suite | Mapping |
|---|---|---|
| Scoring (Assessment §12 fixtures) | `scoring.spec.ts` (pure) | FR-016, SC-002 |
| Safety classification (Safety §12 fixtures) | `safety-classifier.spec.ts` (pure) | FR-019..FR-026, SC-004 |
| API contracts | `contract/*.spec.ts` (NestJS e2e) | FR-001..FR-037, AC-X1..X4 |
| Lifecycle transitions | unit + integration | FR-014a/014b/015/018a/019b |
| Authorization/isolation | contract tests | FR-027..FR-029, SC-008 |
| Idempotent submit | contract + integration | FR-015/FR-034, SC-003 |
| Redaction | `redact.spec.ts` + e2e log scan | FR-030, SC-010 |
| RTL + bilingual | Playwright | FR-010/036/037, SC-005/006 |
| Retention/deletion | platform integration (trigger asserted here) | FR-031 |
| Email verification (EmailPort) | contract + `FakeEmailAdapter` assertions | FR-002/FR-004 |
| Scheduled retention cleanup | `retention.spec.ts` (unit cutoffs + integration seeded rows) | FR-031, Consent §8 |
| Account deletion | contract + integration | FR-031, Consent §9 |
| Full journey NORMAL + SAFETY_HOLD | Playwright e2e | SC-001/SC-007/SC-009 |

## Launch gates (not verified here — external)

- Safety reviewer sign-off on questions, rules, copy, re-entry, resource governance (Safety Matrix §13).
- Legal/privacy sign-off on Terms, Privacy Notice, consent wording, retention, age/residency, deletion/backup (Consent §15).
- Transactional email provider data posture (research §summary).
- Country emergency resources approved + versioned before display (Safety Matrix §8).