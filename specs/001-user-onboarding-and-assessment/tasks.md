# Tasks: 001-user-onboarding-and-assessment

**Input**: Design documents from `/specs/001-user-onboarding-and-assessment/`
**Branch**: `001-user-onboarding-assessment`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — the feature specification and Constitution (Principle IX) mandate automated coverage for safety classification/routing, scoring, auth, isolation, lifecycle transitions, duplicate-submission, and RTL behavior (FR-026, SC-001..SC-010, Safety_Decision_Matrix §12, Assessment_Specification §12, quickstart.md).

**Organization**: Tasks grouped by user story (US1–US9 from spec.md §5) so each story is independently implementable and testable. Priorities: P1 = US1–US6, P2 = US7–US9.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths in descriptions
- Path convention: Web app — `backend/src/`, `frontend/src/` (per plan.md Project Structure)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure (per plan.md Project Structure).

- [x] T001 Create monorepo structure `backend/` and `frontend/` with shared `shared/types/` for cross-stack DTOs per plan.md
- [x] T002 Initialize NestJS backend in `backend/` with dependencies: NestJS, Prisma, Zod, `@nestjs/jwt`, Passport, `@nestjs/schedule`, argon2, OpenTelemetry SDK (plan.md Technical Context)
- [x] T003 [P] Initialize Next.js (App Router) frontend in `frontend/` with dependencies: React, Tailwind CSS, shadcn/ui, React Hook Form, Zod, TanStack Query, next-intl (Frontend_Architecture §2)
- [x] T004 [P] Configure ESLint + Prettier + TypeScript strict mode for `backend/`
- [x] T005 [P] Configure ESLint + Prettier + TypeScript strict mode for `frontend/`
- [x] T006 Configure environment configuration: `backend/src/common/config/` (DATABASE_URL, JWT secrets, EMAIL_PROVIDER/EMAIL_API_KEY/EMAIL_FROM) and `frontend/` public env (research D2/D3)
- [x] T007 [P] Configure Vitest for `backend/tests/` (unit, contract, e2e) and Playwright for `frontend/tests/e2e/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T008 [P] Setup Prisma `schema.prisma` + PostgreSQL connection + migration framework in `backend/prisma/` (research D1); module-scoped schema sections per SAD §5
- [ ] T009 [P] Implement redaction layer in `backend/src/common/redact.ts` with denylist (answers, free text, safety answers, scores, results, classification, consent contents, passwords, tokens) + safe-context allowlist (research D7)
- [ ] T010 [P] Implement OpenTelemetry redacted tracing + structured logging in `backend/src/common/filters/` and `backend/src/common/logger.ts` (research D7, FR-030)
- [ ] T011 [P] Implement Zod validation pipeline + global exception filter (no payload echo) in `backend/src/common/` (FR-037)
- [ ] T012 Implement JWT auth framework in `backend/src/modules/auth/guards/` + `backend/src/modules/auth/strategy/`: Argon2id hashing util, `JwtAuthGuard`, access-token issue + refresh-cookie rotation strategy (SAD §13, research D3); no tokens in localStorage on frontend
- [ ] T013 Implement OnboardingService guard framework (pluggable step-ordering interface) in `backend/src/modules/profile/onboarding.guard.ts` — interface only; rules added in US2/US3/US4 (FR-033)
- [x] T014 [P] Setup next-intl i18n framework in `frontend/src/i18n/`: AR+EN message catalog skeleton, `dir="rtl|ltr"` document handling, locale switching hook (Frontend §12, research D4)
- [x] T015 [P] Setup frontend API service layer + TanStack Query client + auth token handling (in-memory access, refresh cookie, no localStorage) in `frontend/src/services/` + `frontend/src/lib/` (Frontend §9, §15)
- [x] T016 [P] Setup frontend public/protected App Router groups + route guards (UX only, not a security boundary) in `frontend/src/app/(public)/` and `frontend/src/app/(protected)/` (Frontend §7, FR-028)

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 — Register and enter onboarding (Priority: P1) 🎯 MVP

**Goal**: A new user creates an account, verifies email, logs in, and lands on the onboarding start screen.
**Independent Test**: Register → receive verification email (captured by `FakeEmailAdapter`) → verify → land on `/onboarding/boundary`, without the assessment.

### Tests for User Story 1

> Write tests FIRST; ensure they FAIL before implementation.

- [x] T017 [P] [US1] Contract tests for register/resend-verify/verify-email/login/refresh/logout in `backend/tests/contract/auth.contract.spec.ts` (anti-enumeration, hashed tokens, FR-001/FR-002/FR-004)
- [x] T018 [P] [US1] Unit tests for `FakeEmailAdapter` capture + verification-token hashing in `backend/tests/unit/email-and-token.spec.ts`

### Implementation for User Story 1

- [x] T019 [P] [US1] Create Prisma models `UserAccount`, `VerificationToken`, `RefreshToken` + enum `account_status` + migration `m_init_auth` in `backend/prisma/` (data-model §1–§3)
- [x] T020 [P] [US1] Implement `EmailPort` interface in `backend/src/modules/auth/ports/email.port.ts` (research D2)
- [x] T021 [P] [US1] Implement `HttpEmailProviderAdapter` (config-selected production provider) in `backend/src/modules/auth/ports/http-email.adapter.ts`
- [x] T022 [P] [US1] Implement `FakeEmailAdapter` (in-memory, captures messages) in `backend/src/modules/auth/ports/fake-email.adapter.ts`
- [x] T023 [US1] Implement `AuthService` register/resend-verification/verify-email/login/refresh/logout in `backend/src/modules/auth/auth.service.ts` (single-use hashed tokens, anti-enumeration, FR-001..FR-004)
- [x] T024 [US1] Implement `AuthController` endpoints in `backend/src/modules/auth/auth.controller.ts` (contracts/auth.md)
- [x] T025 [P] [US1] Implement `AuthDeletionPort` (unverified/pre-consent account + token cleanup) in `backend/src/modules/auth/ports/auth-deletion.port.ts`
- [x] T026 [US1] Implement frontend auth feature: API service + hooks in `frontend/src/features/auth/` (register, verify, login)
- [x] T027 [US1] Implement `/register` and `/verify-email` pages in `frontend/src/app/(public)/register/` and `frontend/src/app/(public)/verify-email/` (loading/empty/error/expired-link/retry states, FR-035)

**Checkpoint**: US1 fully functional and independently testable.

---

## Phase 4: User Story 2 — Understand and accept service boundaries and consent (Priority: P1)

**Goal**: A verified user reads the service-boundary disclosure + Terms + Privacy Notice and grants or declines consent; granting is recorded and unblocks profile.
**Independent Test**: Verified user can read notices and grant consent → `ConsentRecord` stored with version(s)+timestamp → advances to profile; decline blocks advance.

### Tests for User Story 2

- [x] T028 [P] [US2] Contract tests for notices/consent GET+POST (fail-closed, re-consent, idempotent retry) in `backend/tests/contract/consent.contract.spec.ts` (FR-005..FR-008, FR-032)
- [x] T029 [P] [US2] Unit test for notice-version mismatch → re-consent + fail-closed when versions undetermined in `backend/tests/unit/consent-versions.spec.ts`

### Implementation for User Story 2

- [x] T030 [P] [US2] Create Prisma models `ConsentRecord`, `NoticeVersionSet` + migration `m_consent` + seed `NoticeVersionSet` v1.0 (boundary text EN/AR from Consent policy §3) in `backend/prisma/`
- [x] T031 [US2] Implement `ConsentService` (notices, consent GET/POST, fail-closed, re-consent, idempotent retry, no sensitive fields in record) in `backend/src/modules/auth/consent.service.ts` (Consent policy §5/§6/§12)
- [x] T032 [US2] Implement consent endpoints in `backend/src/modules/auth/auth.controller.ts` (contracts/consent.md)
- [x] T033 [US2] Add OnboardingService guard rules: require `EMAIL_VERIFIED` + granted consent for current `NoticeVersionSet` before profile/assessment (FR-002, FR-006, FR-008) in `backend/src/modules/profile/onboarding.service.ts`
- [x] T034 [P] [US2] Implement consent deletion in `backend/src/modules/auth/ports/auth-deletion.port.ts` (superseded/retention-expired consent records)
- [x] T035 [US2] Implement frontend consent feature + `/onboarding/boundary` page (3 separate acknowledgments, Agree-and-continue, AR/EN, never preselected) in `frontend/src/features/onboarding/` + `frontend/src/app/(protected)/onboarding/boundary/`

**Checkpoint**: US1 + US2 both work independently.

---

## Phase 5: User Story 3 — Provide minimum profile and choose language/direction (Priority: P1)

**Goal**: A consented user sets preferred language + timezone; layout flips RTL/LTR and localized content drives all subsequent screens.
**Independent Test**: Select Arabic → RTL + Arabic content; select English → LTR + English; profile saved → advances to assessment.

### Tests for User Story 3

- [x] T036 [P] [US3] Contract tests for profile PUT, language PUT, GET profile/state (language switch keeps progress) in `backend/tests/contract/profile-onboarding.contract.spec.ts` (FR-009..FR-011)
- [x] T037 [P] [US3] Unit test for IANA timezone validation + language enum in `backend/tests/unit/profile-validation.spec.ts`

### Implementation for User Story 3

- [x] T038 [P] [US3] Create Prisma models `Profile`, `Preferences`, `OnboardingState` + enum `onboarding_state` + migration `m_profile` in `backend/prisma/` (data-model §5–§7)
- [x] T039 [US3] Implement `ProfileService` + `OnboardingService` state transitions (`NOT_STARTED→IN_PROGRESS→ASSESSMENT_PENDING`) in `backend/src/modules/profile/` (FR-009..FR-011, FR-033)
- [x] T040 [US3] Implement endpoints `PUT /onboarding/profile`, `PUT /me/preferences/language`, `GET /me/profile`, `GET /onboarding/state` in `backend/src/modules/profile/profile.controller.ts` (contracts/profile-onboarding.md)
- [x] T041 [P] [US3] Implement `ProfileDeletionPort` (onboarding + profile/preferences with no surviving activity) in `backend/src/modules/profile/ports/profile-deletion.port.ts`
- [x] T042 [US3] Implement frontend `/onboarding/profile` page (language + timezone selectors) with live RTL/LTR + content re-render in `frontend/src/app/(protected)/onboarding/profile/` (FR-010, FR-011)

**Checkpoint**: US1–US3 all work independently.

---

## Phase 6: User Story 4 — Complete and submit the initial assessment (Priority: P1)

**Goal**: A user progresses through the assessment, saves answers individually, and submits once — producing exactly one result (no overall score).
**Independent Test**: Complete all required questions + submit once → exactly one `AssessmentResult`; duplicate/concurrent submit returns the existing result.

### Tests for User Story 4

- [x] T043 [P] [US4] Unit tests for `ScoringService` (Assessment_Specification §12 fixtures: 100/0/50, boundaries 24/25/49/50/74/75, missing-required blocks, AR/EN parity, no overall score) in `backend/tests/unit/scoring.spec.ts`
- [x] T044 [P] [US4] Contract tests for assessment definition/answers/restart/submit/result (idempotent submit, required-question completeness, FR-013..FR-016, FR-018a) in `backend/tests/contract/assessment.contract.spec.ts`
- [x] T045 [P] [US4] Integration test for concurrent/double submit → one result in `backend/tests/e2e/assessment-submit-idempotency.spec.ts` (FR-015, FR-034, AC-X4, SC-003)

### Implementation for User Story 4

- [x] T046 [P] [US4] Create `AssessmentDefinition` reference table + migration `m_assessment_def` + seed v1.0 (Assessment_Specification: 16 questions, 8 domains, polarity, scale, AG-01..AG-05, result bands EN/AR) in `backend/prisma/`
- [x] T047 [P] [US4] Create Prisma models `Assessment`, `AssessmentAnswer`, `AssessmentResult` + enums `assessment_state`, `question_kind` + migration `m_assessment` in `backend/prisma/` (data-model §8–§10)
- [x] T048 [US4] Implement pure deterministic `ScoringService` (polarity + formula + thresholds + tie behavior, no overall score) in `backend/src/modules/assessment/scoring.service.ts` (Assessment §7–§9)
- [x] T049 [US4] Implement `AssessmentLifecycleService` (save/revise/resume/restart, per-answer upsert, required-question completeness incl. SQ-01/SQ-03 required + SQ-02 conditional) in `backend/src/modules/assessment/assessment-lifecycle.service.ts` (FR-014/FR-014a/FR-014b)
- [x] T050 [US4] Implement `AssessmentSubmitService` (idempotent conditional state transition `IN_PROGRESS|SUSPENDED→SUBMITTED→SCORED`, unique result) in `backend/src/modules/assessment/assessment-submit.service.ts` (research D6, FR-015)
- [x] T051 [US4] Implement assessment endpoints in `backend/src/modules/assessment/assessment.controller.ts` (contracts/assessment.md)
- [x] T052 [P] [US4] Implement `AssessmentDeletionPort` (incomplete answers + dangling incomplete assessments; completed retained while account exists) in `backend/src/modules/assessment/ports/assessment-deletion.port.ts`
- [x] T053 [US4] Implement frontend assessment wizard (intro → questions → review) + `/assessment` and submit flow in `frontend/src/features/assessment/` + `frontend/src/app/(protected)/assessment/` (FR-012, FR-035, duplicate-submit prevention)

**Checkpoint**: US1–US4 all work independently (NORMAL path only; safety routing in US6).

---

## Phase 7: User Story 5 — Receive a safe, non-diagnostic assessment result (Priority: P1)

**Goal**: A user whose Safety Evaluation is NORMAL/DISTRESS receives a coaching/screening insight explicitly framed as non-diagnostic, plus a transition point to future coaching (no plan created).
**Independent Test**: NORMAL/DISTRESS submission → non-diagnostic insight presented, onboarding `COMPLETED`, transition point shown; no overall score; result suppressed during `SAFETY_HOLD`.

### Tests for User Story 5

- [x] T054 [P] [US5] Contract tests for `GET /assessment/result` (non-diagnostic framing, no overall score, suppression during `SAFETY_HOLD`, 404 when incomplete) in `backend/tests/contract/assessment.contract.spec.ts` (FR-016..FR-018, SC-002)
- [x] T055 [P] [US5] Unit test for result presenter (strongest domain, support domain, selected priorities preserved separately, non-diagnostic statement, transition point) in `backend/tests/unit/result-presenter.spec.ts`

### Implementation for User Story 5

- [x] T056 [US5] Implement result presenter/assembly (8 domain scores + bands, strongest, support domain, selected priorities, non-diagnostic statement, transition point; no overall score) in `backend/src/modules/assessment/result-presenter.ts` (Assessment §9, FR-016/FR-017/FR-018)
- [x] T057 [US5] Enforce result suppression while `OnboardingState=SAFETY_HOLD` (409 on `GET /assessment/result`, no result in submit response) in `backend/src/modules/assessment/assessment.controller.ts` + `onboarding.service.ts` (FR-019b, Assessment §9)
- [x] T058 [US5] Implement frontend `/assessment/result` page (non-diagnostic coaching insight, "not a diagnosis / not a substitute for professional care", transition point to `/dashboard` placeholder) in `frontend/src/app/(protected)/assessment/result/` (FR-017, FR-018)

**Checkpoint**: US1–US5 all work independently (NORMAL + DISTRESS completion paths).

---

## Phase 8: User Story 6 — High-risk or crisis answer receives the correct safety experience (Priority: P1)

**Goal**: Answers classifying HIGH_RISK or CRISIS produce the approved deterministic safety response, deferring/suppressing the normal result — no generative AI, fail-closed.
**Independent Test**: Safety fixtures (Safety_Decision_Matrix §12 incl. SQ-03) produce correct routes without invoking AI; HIGH_RISK → `SUSPENDED`+`SAFETY_HOLD`; CRISIS → interrupt+`SAFETY_HOLD`; re-entry is user-initiated and preserves history.

### Tests for User Story 6

- [x] T059 [P] [US6] Unit tests for `safety-classifier` pure function (S0/S1+D0/S1+D1/S2/SX+DX, **SQ-03=F2→DISTRESS**, **SQ-03=F0/F1/FX→no escalation**, **SQ-03 never downgrades HIGH_RISK/CRISIS**, distress boundaries, highest-risk-wins, fail-closed) in `backend/tests/unit/safety-classifier.spec.ts` (Safety §12, FR-026, SC-004)
- [x] T060 [P] [US6] Contract tests for `safety_route` payload, `/safety/hold`, `/safety/reentry` (re-entry creates new eval, history unedited, no auto-resume, fail-closed 503) in `backend/tests/contract/safety.contract.spec.ts` (Safety §9/§10, FR-019..FR-025)
- [x] T061 [P] [US6] Integration test: per-answer evaluation triggers routing mid-assessment; CRISIS never reaches `SUBMITTED` in `backend/tests/e2e/safety-routing.spec.ts` (FR-019a/FR-019b/FR-020)

### Implementation for User Story 6

- [x] T062 [P] [US6] Create `SafetyDefinition`, `SafetyCopy`, `EmergencyResource` reference tables + migration `m_safety_def` + seed v1.0 (Safety_Decision_Matrix: SQ-01/SQ-02/**SQ-03** wording+options EN/AR, classification matrix, DISTRESS/HIGH_RISK/CRISIS/unavailable copy; EmergencyResource empty pending approval) in `backend/prisma/`
- [x] T063 [P] [US6] Create Prisma model `SafetyEvaluation` + enums `safety_level`, `trigger_context` + migration `m_safety` in `backend/prisma/` (data-model §11)
- [x] T064 [US6] Implement pure deterministic `safety-classifier.ts` (matrix incl. SQ-03→DISTRESS only + never-downgrade, highest-risk-wins, distress pattern ≥3 domains <25 OR Mood<25 OR SQ-03=F2) in `backend/src/modules/safety/safety-classifier.ts` (Safety §5, research D8)
- [x] T065 [US6] Implement `SafetyService` (evaluation after each saved answer + on submit, immutable append-only `SafetyEvaluation` with `is_current`, fail-closed, copy/resource resolution, stale-no-downgrade) in `backend/src/modules/safety/safety.service.ts` (FR-019a, Safety §4/§9/§10, research D9)
- [x] T066 [US6] Wire safety evaluation into `AssessmentLifecycleService`/`AssessmentSubmitService` (HIGH_RISK → `Assessment=SUSPENDED` + `Onboarding=SAFETY_HOLD`; CRISIS → interrupt, no submit) in `backend/src/modules/assessment/` (FR-019b, Safety §6)
- [x] T067 [US6] Implement safety endpoints: `safety_route` in assessment responses, `GET /safety/hold`, `POST /safety/reentry` in `backend/src/modules/safety/safety.controller.ts` (contracts/safety.md)
- [x] T068 [P] [US6] Implement `SafetyDeletionPort` (safety answers/evaluations tied to deleted accounts/assessments; history immutable until deletion) in `backend/src/modules/safety/ports/safety-deletion.port.ts`
- [x] T069 [US6] Implement frontend `/safety/hold` page + `safety_route` rendering (approved bilingual copy, immediate focus + AT announcement, primary emergency action clear, no invented numbers, color not the only indicator) in `frontend/src/features/safety/` + `frontend/src/app/(protected)/safety/hold/` (Safety §11, FR-024/FR-037)

**Checkpoint**: US1–US6 all work independently; full safety routing verified.

---

## Phase 9: User Story 7 — Arabic/English language selection with correct direction and localization (Priority: P2)

**Goal**: Switching language re-renders every onboarding screen — including validation, empty/error states, and safety experiences — in the correct language and direction.
**Independent Test**: Switch AR↔EN on any screen → direction + all strings update incl. mixed AR/EN/number/date content; safety behavior equivalent across languages.

### Tests for User Story 7

- [x] T070 [P] [US7] Playwright RTL suite: direction + mixed-content ordering + keyboard/focus order in LTR and RTL across onboarding + safety screens in `frontend/tests/e2e/rtl.spec.ts` (FR-036, SC-005/SC-006)
- [x] T071 [P] [US7] Test for missing-string fallback: non-safety key → defined fallback; safety-critical missing key → approved bilingual fallback + block continuation in `frontend/tests/e2e/i18n-fallback.spec.ts` (FR-037, Safety §11)

### Implementation for User Story 7

- [x] T072 [US7] Complete AR + EN message catalogs for all onboarding, assessment, and safety strings (natural localization, not literal) in `frontend/src/i18n/` (FR-010, FR-037, Constitution X)
- [x] T073 [US7] Implement missing-string fallback rule (safety-critical blocks with approved bilingual fallback; no silent cross-language fallback for safety) in `frontend/src/i18n/` (FR-037, Safety §11)
- [x] T074 [US7] Verify safety behavior equivalence across AR/EN (same routing, same copy meaning) via shared classifier + bilingual `SafetyCopy` (Safety §11) — no new code; catalog/fixture verification

**Checkpoint**: Bilingual equality verified across all stories.

---

## Phase 10: User Story 8 — Safely resume or restart an interrupted onboarding journey (Priority: P2)

**Goal**: An interrupted user, on return, resumes at the correct unfinished step with saved progress, or restarts safely without duplicate data.
**Independent Test**: Stop mid-assessment → re-authenticate → resume at last saved question with answers intact; restart clears answers on the single active assessment (no duplicate).

### Tests for User Story 8

- [x] T075 [P] [US8] Integration test: resume from last saved answer; restart clears (no duplicate assessment); corrupt-progress → safe restart, no partial result as complete in `backend/tests/e2e/resume-restart.spec.ts` (FR-014/FR-014b/FR-034, SC-007)
- [x] T076 [P] [US8] Contract test: `GET /onboarding/state` returns correct `current_step`; protected-area access redirects to unfinished step in `backend/tests/contract/profile-onboarding.contract.spec.ts` (FR-033)

### Implementation for User Story 8

- [x] T077 [US8] Implement resume routing in `OnboardingService` (`current_step`, last-saved-question pointer, redirect-to-unfinished) + safe-restart on corrupt/inconsistent progress in `backend/src/modules/profile/onboarding.service.ts` (FR-033/FR-034, US8 failure path)
- [x] T078 [US8] Implement frontend resume flow + restart-with-confirmation UI + redirect guards to unfinished step in `frontend/src/features/onboarding/` + `frontend/src/app/(protected)/` (FR-014b, FR-035)

**Checkpoint**: Resume/restart verified; no duplicate data.

---

## Phase 11: User Story 9 — Existing authenticated user with completed onboarding is routed correctly (Priority: P2)

**Goal**: A returning authenticated user whose onboarding is `COMPLETED` bypasses onboarding and reaches the post-onboarding destination; incomplete users resume at the unfinished step.
**Independent Test**: `COMPLETED` user → `/dashboard`; incomplete user → unfinished step; undeterminable state → earliest unfinished step.

### Tests for User Story 9

- [x] T079 [P] [US9] Contract test: `GET /onboarding/completion` returns `completed:true` for `COMPLETED` users and routes correctly; incomplete → unfinished step in `backend/tests/contract/profile-onboarding.contract.spec.ts` (FR-033, SC-009)

### Implementation for User Story 9

- [x] T080 [US9] Implement authoritative completion check `GET /onboarding/completion` (completed only when `OnboardingState=COMPLETED` and not `SAFETY_HOLD`; undeterminable → earliest unfinished step) in `backend/src/modules/profile/profile.controller.ts` (FR-033, US9 failure path)
- [x] T081 [US9] Implement frontend `/dashboard` placeholder (transition point) + completed-bypass routing + incomplete-redirect in `frontend/src/app/(protected)/dashboard/` + route guard (US9, FR-018a)

**Checkpoint**: Returning-user routing verified; onboarding completion boundary defined.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Platform mechanisms and improvements affecting multiple user stories.

- [x] T082 [P] Create `DeletionLog` model + enum `run_kind`/`retention_status` + migration `m_retention` + inactivity-cutoff indexes in `backend/prisma/` (data-model §13, research D10)
- [x] T083 Implement `RetentionModule` daily `@Cron` job orchestrator calling per-module deletion contracts (`Auth/Profile/Assessment/SafetyDeletionPort`) with deterministic cutoffs + per-category transactions + idempotent `DELETE ... WHERE last_activity_at < :cutoff` in `backend/src/modules/retention/retention.service.ts` (research D10, Consent §8)
- [x] T084 Implement user-initiated account-deletion flow (idempotent, authenticated, blocks new processing, no completion until all stores confirm, reuses deletion contracts) in `backend/src/modules/retention/account-deletion.service.ts` (Consent §9, FR-031)
- [x] T085 [P] Implement redaction audit: e2e log/trace scan asserts no answers/free-text/safety/scores/results/consent in emitted telemetry in `backend/tests/e2e/redaction-audit.spec.ts` (FR-030, SC-010, research D7)
- [x] T086 [P] Implement retention-cleanup tests (cutoff boundaries, expired deleted / non-expired retained / completed retained, idempotent re-run, per-category failure isolation, sanitized `DeletionLog` only) in `backend/tests/e2e/retention-cleanup.spec.ts` (research D10)
- [x] T087 [P] Implement account-deletion tests (full removal incl. derived copies, idempotent re-request, no early completion claim) in `backend/tests/e2e/account-deletion.spec.ts` (FR-031, Consent §9)
- [x] T088 [P] Implement authorization/isolation tests (cross-user access to assessment/result/consent blocked server-side; route-guard bypass blocked) in `backend/tests/e2e/isolation.spec.ts` (FR-027..FR-029, SC-008, AC-X3)
- [x] T089 Review and split any handwritten source file approaching 300 lines by responsibility (Constitution VIII; flagged: `assessment.service.ts` already split into lifecycle + submit) across `backend/src/`
- [x] T090 [P] Update `01-DOCS/Frontend_Architecture.md` §7 with the finalized onboarding route segments (`/onboarding/boundary`, `/onboarding/profile`, `/assessment`, `/assessment/result`, `/safety/hold`, `/dashboard`) per plan.md Reference Alignment
- [x] T091 Run `quickstart.md` end-to-end validation (§1–§12) and fix failing scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup; BLOCKS all user stories.
- **User Stories (Phases 3–11)**: All depend on Foundational completion.
  - US1 is the MVP entry point and is a prerequisite for US2 (verification gate) and US3 (consent gate) in the journey flow, but each is independently testable with fixtures/stubs.
  - US4 (assessment) depends on US3 (profile/onboarding state) for full e2e; unit/contract tests are independent.
  - US5 (result) depends on US4 (result payload) and US6 (suppression during SAFETY_HOLD).
  - US6 (safety) integrates with US4 (per-answer + on-submit evaluation) but the classifier is independently testable.
  - US7–US9 are cross-cutting completions layered on US1–US6.
- **Polish (Phase 12)**: Depends on all P1 user stories (US1–US6) being complete; retention/account-deletion require all deletion contracts present.

### User Story Dependencies

- **US1 (P1)**: After Foundational; no other-story dependencies.
- **US2 (P1)**: After Foundational; integrates US1's `EMAIL_VERIFIED` gate; independently testable.
- **US3 (P1)**: After Foundational; integrates US2's consent gate; independently testable.
- **US4 (P1)**: After Foundational + US3 (onboarding state) for e2e; scoring/contract tests independent.
- **US5 (P1)**: After US4 (result payload) + US6 (suppression) for full behavior; presenter unit test independent.
- **US6 (P1)**: After Foundational; classifier unit tests independent; e2e integrates with US4.
- **US7 (P2)**: After US1–US6 (needs all screens to localize); catalog work can start earlier.
- **US8 (P2)**: After US4 (save/resume) + US3 (routing).
- **US9 (P2)**: After US3 (onboarding state) + US5 (completion).

### Within Each User Story

- Tests written FIRST and FAIL before implementation.
- Models (Prisma) before services.
- Services before controllers/endpoints.
- Backend before frontend integration.
- Story complete (independent test passes) before next priority.

### Parallel Opportunities

- Phase 1: T003–T007 in parallel (different stacks/files).
- Phase 2: T008–T011, T014–T016 in parallel (independent infra files).
- Within a story: tests + models + ports marked [P] run together.
- Across stories (with team): after Foundational, US1/US2/US3 backend tracks can start; US6 classifier (T062–T065) can start in parallel with US4 scoring (independent pure functions).
- Deletion ports (T025/T034/T041/T052/T068) are independent across stories.

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests + models + ports together (independent files):
Task: "T017 contract tests for auth in backend/tests/contract/auth.contract.spec.ts"
Task: "T018 unit tests for email+token in backend/tests/unit/email-and-token.spec.ts"
Task: "T019 Prisma models UserAccount/VerificationToken/RefreshToken in backend/prisma/"
Task: "T020 EmailPort interface in backend/src/modules/auth/ports/email.port.ts"
Task: "T021 HttpEmailProviderAdapter in backend/src/modules/auth/ports/http-email.adapter.ts"
Task: "T022 FakeEmailAdapter in backend/src/modules/auth/ports/fake-email.adapter.ts"
# Then sequentially: T023 AuthService → T024 AuthController → T026 frontend → T027 pages
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: run US1 contract + unit tests independently.
5. Demo the register → verify → login slice.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. Add US1 → test → demo (MVP entry).
3. Add US2 (consent) → test → demo.
4. Add US3 (profile/language) → test → demo.
5. Add US4 (assessment submit) + US6 (safety) → test (incl. §12 fixtures) → demo.
6. Add US5 (non-diagnostic result) → test → demo (full NORMAL/DISTRESS path).
7. Add US7 (bilingual/RTL) → test → demo.
8. Add US8 (resume/restart) + US9 (returning-user routing) → test → demo.
9. Polish: retention cleanup + account deletion + redaction/isolation audit + quickstart validation.

### Parallel Team Strategy

1. Team completes Setup + Foundational together.
2. After Foundational:
   - Developer A: US1 → US2 → US3 (auth + onboarding backend chain)
   - Developer B: US4 scoring + US6 classifier (independent pure functions → integration)
   - Developer C: frontend screens (auth, onboarding, assessment, safety) in parallel with backend
3. US5/US7/US8/US9 integrate after their backends land.

---

## Notes

- [P] = different files, no dependencies on incomplete tasks.
- [Story] label maps each task to its user story for traceability.
- Each user story is independently completable and testable.
- Verify tests FAIL before implementing.
- Commit after each task or logical group.
- Stop at any checkpoint to validate a story independently.
- Constitution VIII: no handwritten source file > 300 lines (migrations/fixtures exempt).
- Safety invariants (plan.md): scoring ≠ safety; no AI in safety; SQ-03 → DISTRESS only, never downgrades HIGH_RISK/CRISIS; all three safety questions unscored.
- No assessment or safety data reaches any AI provider; sensitive content excluded from all telemetry.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence.