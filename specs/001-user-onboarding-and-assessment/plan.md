# Implementation Plan: 001-user-onboarding-and-assessment

**Branch**: `001-user-onboarding-assessment` | **Date**: 2026-07-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-user-onboarding-and-assessment/spec.md`

**Note**: This plan is the output of `/speckit-plan`. It references research.md, data-model.md, contracts/, and quickstart.md in this directory.

## Summary

Feature 001 delivers the first-time user journey for Priora Mind: **register → verify email → consent (service-boundary + terms + privacy) → minimum profile (language, timezone) → initial assessment → safe, non-diagnostic result → transition point toward future coaching**. No coaching plan is generated or activated (deferred to a future feature).

Technically the feature is a deterministic, AI-free slice of the modular monolith — but it is **not** integration-free: outbound transactional email is required for email verification (EmailPort, research D2). The backend adds four module surfaces — **Auth** (account, verification, consent recording, EmailPort), **Profile** (profile/preferences, onboarding state), **Assessment** (answer storage, deterministic scoring, result), and a new dedicated **Safety** module (deterministic risk classification NORMAL/DISTRESS/HIGH_RISK/CRISIS) — plus a platform-level **RetentionModule** for the scheduled retention-cleanup job (research D10). Two invariants are load-bearing and non-negotiable throughout the plan:

1. **Assessment scoring and Safety classification are strictly separate.** Domain scores drive a coaching insight; the three unscored safety answers (SQ-01, SQ-02, SQ-03) drive routing. Neither derives from the other. A single safety-sensitive answer can trigger routing regardless of all domain scores. SQ-01/SQ-02 determine HIGH_RISK and CRISIS; SQ-03 can classify DISTRESS only and must never downgrade HIGH_RISK or CRISIS (Safety_Decision_Matrix v1.0).
2. **No assessment or safety data reaches any AI provider.** This feature invokes no generative AI; safety classification is deterministic backend rules only. (Email is a separate, non-AI external integration used only for the verification link.)

Additional mandated behavior: consent versioning (service_boundary_version, terms_version, privacy_notice_version), assessment versioning (immutable results tied to a definition version), draft saving (per-answer) with idempotent final submission, SAFETY_HOLD (user-initiated re-entry; system never declares a crisis ended), historical safety evaluations preserved while the latest completed evaluation drives current routing, sensitive content excluded from logs/analytics/traces, and first-class Arabic/English (RTL/LTR) throughout.

## Technical Context

**Language/Version**: TypeScript 5.x on both backend (NestJS) and frontend (Next.js). Node.js 20 LTS runtime.

**Primary Dependencies**:
- Backend: NestJS, Prisma ORM (decision in research.md), Zod (DTO/input validation), `@nestjs/jwt` + Passport (decision in research.md), Argon2id password hashing, `@nestjs/schedule` for the deterministic retention-cleanup cron job (research D10), an Auth-owned `EmailPort` with a config-selected production transactional-email adapter and a `FakeEmailAdapter` for dev/test (research D2), OpenTelemetry SDK for redacted tracing.
- Frontend: Next.js (App Router), React, Tailwind CSS, shadcn/ui, React Hook Form, Zod (shared schema mirror), TanStack Query (server state), `next-intl` for i18n (decision in research.md).
- Translations: deterministic bilingual content sourced from the three product docs, stored as versioned reference data (decision in research.md).

**Storage**: PostgreSQL (primary relational store). Qdrant is part of the platform stack but **not used** by this feature (no vectors, no embeddings, no AI provider calls). File/blob storage: not required.

**Testing**: Vitest (unit/domain), Jest or Vitest + supertest (NestJS e2e/API), Playwright (frontend journeys incl. RTL). Prisma test database with per-test transactional rollback. Safety classification and scoring covered by pure-function fixture tests (no DB, no AI) per Safety_Decision_Matrix §12 and Assessment_Specification §12.

**Target Platform**: Linux server (containerized NestJS service) behind HTTPS; Next.js rendered for modern evergreen browsers (desktop + mobile web). No native mobile, no voice, no offline in this feature.

**Project Type**: web-service (modular monolith backend + Next.js frontend).

**Performance Goals**: Authentication + onboarding steps respond < 300ms p95 server-side; per-answer save < 200ms p95; safety evaluation (pure deterministic function) < 50ms p99. No streaming in this feature. These are product-internal targets, not user-facing SLAs (no public performance commitments in PRD).

**Constraints**:
- Non-negotiable: no AI provider invocation; no sensitive content in logs/analytics/traces/error reports; backend-enforced isolation (route guards are not a security boundary); no assessment/safety data in browser local storage; fail-closed safety.
- Bilingual: every user-facing string and safety copy must exist in AR + EN with equivalent meaning; RTL/LTR tested, not just `dir` attribute.
- 300-line rule for handwritten source files (Constitution VIII).
- One entity, one owner module (SAD §5 / ADR-005).

**Scale/Scope**: Single-tenant MVP scale (thousands of users, not millions). 9 onboarding screens, 21 coaching questions + 3 unscored safety questions (SQ-01/SQ-02/SQ-03 per Safety_Decision_Matrix v1.0), 5 modules touched (auth, profile, assessment, safety, + platform retention), ~8 ordered migrations. **External integration**: outbound transactional email for verification (EmailPort, research D2). No AI provider, no Qdrant, no payments, no async queue.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes for this plan |
|---|-----------|--------|---------------------|
| I | Coaching, Not Clinical Care (NON-NEGOTIABLE) | ✅ Pass | Service-boundary disclosure presented before any coaching/assessment content (FR-005); result framed as non-diagnostic coaching/screening insight (FR-017); no diagnosis, medication, or "replace a professional" claims. |
| II | Safety Before Coaching (NON-NEGOTIABLE) | ✅ Pass | Deterministic classification NORMAL/DISTRESS/HIGH_RISK/CRISIS; CRISIS deterministic bypass (no AI); HIGH_RISK decision matrix; fail-closed; no fabricated resources; safety precedes completion; independently testable via fixtures (FR-019..FR-026). Owned by dedicated Safety module, not the AI pipeline. |
| III | Evidence-Grounded and Bounded AI | ✅ N/A-by-design | No generative AI is invoked; the result is deterministic; no RAG/knowledge retrieval; no fabricated results (FR-016, US5 failure path: safe error instead of fabricated insight). |
| IV | Domain Ownership and Human-Controlled AI | ✅ Pass | One owner per entity (SAD ADR-006): Consent→Auth, Onboarding→Profile, scoring→Assessment, Safety→Safety. No AI DTOs in this feature. No business logic in controllers/UI/adapters. Safety rules are not owned by an AI provider integration. |
| V | Structured Coaching Experience | ✅ Pass (boundary-respecting) | Onboarding is a structured journey with explicit states and a clear completion condition. No open-ended chat; no plan lifecycle created here (deferred). |
| VI | Privacy, Data Isolation, User Control (NON-NEGOTIABLE) | ✅ Pass | Verified ownership; backend isolation every protected op; route guards not a security boundary; no sensitive content in logs/analytics/traces; auth per SAD; no new token storage; minimum collection; versioned consent; product retention limits; full deletion of derived data (FR-027..FR-032). |
| VII | Explicit and Limited Context and Memory | ✅ N/A-vacuously | No AI context constructed; no conversation history or memory created; long-term memory out of scope. |
| VIII | Clean, Modular, Maintainable Code (NON-NEGOTIABLE) | ⏳ Verified at design time | Module boundaries per SAD §5 respected; data-model and contracts below respect single ownership; 300-line rule enforced in tasks phase. No god services; Safety classifier is a pure function. |
| IX | Testing and Verifiable Behavior | ✅ Pass | Safety classification/routing, crisis bypass, scoring, authentication, isolation, lifecycle transitions, RTL behavior, duplicate-submission, retention/deletion all designated for automated tests with fixtures (FR-026, SC-003..SC-010). |
| X | Arabic and English Quality Equality | ✅ Pass | First-class bilingual; RTL/LTR; natural localization; safety equivalence across languages; RTL covered by testing (FR-010, FR-036, FR-037). |
| XI | Authoritative Project References | ✅ Pass | Reference Alignment section below covers PRD/SAD/Frontend; conflicts/gaps/required updates listed; no silent invention. |
| XII | Simplicity and MVP Discipline | ✅ Pass | Simplest safe design: no AI, no plan lifecycle, no sessions, no payments, minimum profile, no Qdrant, no async queue (BullMQ) — a lightweight `@nestjs/schedule` cron is sufficient for the periodic retention job (research D10). New infrastructure (Safety module, consent/assessment/safety tables, EmailPort + adapters, RetentionModule) has an immediate documented need tied to an FR. |

**Gate evaluation**: No violations. No `Complexity Tracking` entries required. Plan proceeds to Phase 0.

## Reference Alignment

- **PRD.md**: Implements PRD §7 journey steps 1–4 (Register, Verify email, Complete profile, Complete initial assessment) and stops before step 5 (Generate coaching plan). Covers PRD §8 Authentication/User Profile/Assessment, §10 Safety Requirements (deterministic input safety independent of scoring, self-harm + immediate-danger questions, NORMAL/DISTRESS/HIGH_RISK/CRISIS, immediate interruption + SAFETY_HOLD, fail-closed, approved versioned resource registry, no diagnosis), §9 multilingual AR/EN, §11 Privacy (user owns data, deletion, isolation, versioned consent, incomplete-progress expiry, full deletion incl. consent/assessment/goal/result/safety, telemetry exclusion). Respects §4 Non-Goals and §12 MVP scope (no plans, sessions, AI chat, RAG, payments, community). Alignment: full.
- **SAD.md**: Uses Auth (UserAccount, VerificationToken, RefreshToken, ConsentRecord), Profile (Profile, Preferences, OnboardingState), Assessment (Assessment, AssessmentAnswer, AssessmentResult + deterministic scoring), and the new Safety module (SafetyEvaluation) per §5 / ADR-006. Authentication follows §13 (HTTPS, password hashing, JWT, refresh tokens, data isolation). No AI provider invoked, so §7/§8 AI flow is not exercised; the assessment result is deterministic (no AI module DTO persistence). Alignment: full.
- **Frontend_Architecture.md**: Uses public/protected routing (§7) — registration/verification public, onboarding steps protected and gated by onboarding state. Feature-first organization (§4) with an onboarding feature area; React Hook Form + Zod (§11); TanStack Query server state vs. local UI state (§8); API access only via service layer (§9); i18n with RTL/LTR and locale switching (§12); design system (§13); loading/empty/error/offline/expired-session/retry states (§14, §16). New onboarding route segments are defined in this plan (the spec deferred them): `/onboarding/boundary`, `/onboarding/profile`, `/assessment`, `/assessment/result`, plus `/safety/hold` for SAFETY_HOLD. These may be back-synced to Frontend §7 (see Required updates).
- **Conflicts / Gaps**: None. Resolved ambiguities: (1) placement of non-AI safety classification → dedicated Safety module (SAD ADR-006). (2) Onboarding route segments not enumerated in Frontend §7 → defined here. (3) Safety question count → the authoritative Safety_Decision_Matrix v1.0 defines three unscored safety questions (SQ-01, SQ-02, SQ-03); SQ-01/SQ-02 determine HIGH_RISK/CRISIS and SQ-03 classifies DISTRESS only and never downgrades HIGH_RISK/CRISIS. Product decisions already resolved in the three product docs (Assessment_Specification v1.0, Safety_Decision_Matrix v1.0, Consent_and_Data_Retention_Policy v1.0) are **not reopened**.

**Required updates to authoritative documents**:
- SAD.md ✅ already applied (Safety module §5, ADR-006, ownership assignments).
- PRD.md ✅ already applied (§8/§10/§11 reference the three product baselines).
- Frontend_Architecture.md ✅ applied (Phase 12, T090): §7 back-synced with the finalized onboarding route segments — `/onboarding/boundary`, `/onboarding/profile`, `/assessment`, `/assessment/result`, `/safety/hold`, `/dashboard`; future `/plans` + `/sessions` marked out of MVP scope.
- Safety_Decision_Matrix.md ✅ already defines three unscored safety questions (SQ-01, SQ-02, SQ-03) with SQ-03 limited to DISTRESS and never downgrading HIGH_RISK/CRISIS; plan artifacts reference it as the authoritative safety baseline.

## Project Structure

### Documentation (this feature)

```text
specs/001-user-onboarding-and-assessment/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — technical decisions resolving unknowns
├── data-model.md        # Phase 1 — entities, fields, relationships, state machines, indexes, migrations
├── quickstart.md        # Phase 1 — end-to-end validation recipe
├── contracts/           # Phase 1 — API contracts
│   ├── auth.md
│   ├── consent.md
│   ├── profile-onboarding.md
│   ├── assessment.md
│   └── safety.md
├── checklists/
│   └── requirements.md  # from /speckit-specify + /speckit-clarify
├── spec.md              # from /speckit-specify (+ /speckit-clarify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

Web application layout (frontend + backend per Frontend §4 and SAD §2).

```text
backend/
├── src/
│   ├── modules/
│   │   ├── auth/                 # UserAccount, VerificationToken, RefreshToken, ConsentRecord, EmailPort
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── consent.service.ts
│   │   │   ├── ports/
│   │   │   │   ├── email.port.ts            # EmailPort interface (Auth-owned)
│   │   │   │   ├── http-email.adapter.ts   # production: config-selected transactional provider
│   │   │   │   └── fake-email.adapter.ts    # dev + automated tests (in-memory)
│   │   │   ├── dto/
│   │   │   └── guards/
│   │   ├── profile/              # Profile, Preferences, OnboardingState
│   │   │   ├── profile.controller.ts
│   │   │   ├── onboarding.service.ts
│   │   │   ├── ports/profile-deletion.port.ts
│   │   │   └── dto/
│   │   ├── assessment/           # Assessment, AssessmentAnswer, AssessmentResult + scoring
│   │   │   ├── assessment.controller.ts
│   │   │   ├── assessment.service.ts
│   │   │   ├── scoring.service.ts        # pure deterministic function
│   │   │   ├── assessment-definition.ts # versioned reference content
│   │   │   ├── ports/assessment-deletion.port.ts
│   │   │   └── dto/
│   │   ├── safety/               # SafetyEvaluation — deterministic classification
│   │   │   ├── safety.service.ts
│   │   │   ├── safety-classifier.ts      # pure deterministic function (matrix)
│   │   │   ├── safety-copy.ts            # approved bilingual copy (versioned)
│   │   │   ├── resource-registry.ts      # versioned approved emergency resources
│   │   │   ├── ports/safety-deletion.port.ts
│   │   │   └── dto/
│   │   └── retention/            # platform: scheduled retention-cleanup job (research D10)
│   │       ├── retention.service.ts       # @Cron daily orchestrator
│   │       ├── retention.module.ts
│   │       └── dto/
│   ├── common/
│   │   ├── redact.ts             # log/trace redaction (FR-030)
│   │   ├── i18n-content.ts       # bilingual content loader
│   │   └── filters/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── main.ts
└── tests/
    ├── unit/                     # scoring, safety-classifier, redact, content
    ├── contract/                 # API contract tests
    └── e2e/                      # onboarding journey incl. safety fixtures

frontend/
├── src/
│   ├── app/
│   │   ├── (public)/register/
│   │   ├── (public)/verify-email/
│   │   ├── (protected)/onboarding/boundary/      # service-boundary + consent
│   │   ├── (protected)/onboarding/profile/      # language + timezone
│   │   ├── (protected)/assessment/              # wizard (intro → questions → review)
│   │   ├── (protected)/assessment/result/      # non-diagnostic insight (suppressed in SAFETY_HOLD)
│   │   ├── (protected)/safety/hold/            # SAFETY_HOLD + re-entry
│   │   └── (protected)/dashboard/             # post-onboarding transition point (placeholder)
│   ├── features/
│   │   ├── auth/
│   │   ├── onboarding/
│   │   ├── assessment/
│   │   └── safety/
│   ├── components/
│   ├── services/                 # API service layer (no direct fetch in components)
│   ├── hooks/
│   ├── lib/
│   └── i18n/                      # next-intl: AR + EN message catalogs, RTL/LTR
└── tests/
    └── e2e/                       # Playwright: full journey, RTL, safety routing
```

**Structure Decision**: Web application structure — NestJS modular monolith backend organized by SAD §5 module boundaries (auth, profile, assessment, safety) plus a platform-level `retention` module for the scheduled cleanup job, Next.js App Router frontend organized feature-first per Frontend §4. The `safety` module is new (SAD ADR-006); the other domain modules reuse existing module homes. Auth owns an `EmailPort` with a config-selected production adapter and a fake adapter for dev/test (research D2). No Qdrant, no AI module, and no async queue (BullMQ) is introduced — `@nestjs/schedule` is sufficient for the periodic retention job (Constitution XII). The feature has one external integration: outbound transactional email for verification.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No Constitution Check violations. Table intentionally empty — every addition (Safety module, consent/assessment/safety tables, versioned reference content) has an immediate documented need tied to an FR.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |