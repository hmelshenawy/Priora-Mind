# Backend Modules Structural Audit — Consolidated Report

Spec: Full read-only structural audit of all backend modules under `02-BACKEND/src/modules/**` **excluding** `conversations/**` (already audited and refactored separately — see `05-audit/conversation-module-refactor-report.md`). Goal: standardize the remaining modules to the same NestJS structural conventions before any cross-module boundary refactor.

Branch: `006-home-dashboard`. Date: 2026-08-09.

**Constraints honored:** No code was modified. No files moved/renamed. No refactoring performed. No implementation tasks generated. No boundary issues fixed. No tests reorganized. No pre-existing failures fixed. This is structural analysis only — violations are identified, not remediated.

---

## 1. Backend module inventory

Seven non-conversation modules exist under `src/modules/` (plus `conversations/`, excluded):

| Module | Files (src) | Lines (src) | Largest file | >300? | Public exports (module.ts) |
|---|---|---|---|---|---|
| `ai` | 14 | ~913 | `conversation-llm.adapter.ts` (198) | No | `COACHING_LLM_PORT` only |
| `assessment` | 15 | ~1,804 | `assessment-lifecycle.service.ts` (290) | No | `ASSESSMENT_DELETION_PORT`, `AssessmentResultService` |
| `auth` | 22 | ~1,297 | `auth.service.ts` (236) | No | `AuthService`, `ConsentService`, `AuthDeletionService`, `AUTH_DELETION_PORT`, `EMAIL_PORT` (+ `AuthCoreModule` exports `JwtTokenService`, `RefreshCookieService`, `JwtStrategy`, `PassportModule`, `JwtModule`) |
| `coaching` | 18 | ~1,179 | `coaching-generation.service.ts` (209) | No | `COACHING_DELETION_PORT`, `CoachingDeletionService` |
| `profile` | 9 | ~695 | `profile.service.ts` (266) | No | `OnboardingGuardService` (abstract), `ProfileDeletionService`, `PROFILE_DELETION_PORT` |
| `retention` | 4 | ~484 | `retention.service.ts` (219) | No | `RetentionService`, `AccountDeletionService` |
| `safety` | 11 | ~1,072 | `safety.service.ts` (257) | No | `SafetyService`, `SAFETY_DELETION_PORT` |
| **Total** | **93** | **~7,444** | — | **0** | — |

**Key finding (section 7): no handwritten source file in any non-conversation module exceeds 300 lines.** The largest is `assessment-lifecycle.service.ts` at 290. The structural cleanup is therefore **not driven by size** anywhere — it is driven by (a) flat layout vs. the conversations module's conventional `controllers/services/repositories/dto/utils/constants` shape, and (b) cross-module boundary leakage.

Discovered cross-cutting / shared code (not a feature module):
- `src/prisma/prisma.service.ts` — `PrismaService` global; `src/prisma/in-memory-prisma.ts` — test double.
- `src/common/redact.ts` — `toSafeLogContext` (used by retention).
- `tests/helpers/in-memory-prisma.ts` (1,452 lines), `fake-conversation-rag-client`, `fake-conversation-llm`, etc.
- `@priora/shared-types` (external package) — response types shared across modules.

---

## 2. Per-module current tree

### ai
```
src/modules/ai/
├── ai.config.ts (15)
├── ai.module.ts (9)
├── coaching-llm.adapter.ts (107)
├── conversation-ai.port.ts (43)
├── conversation-json-schema-validator.ts (57)
├── conversation-llm.adapter.ts (198)
├── conversation-llm.errors.ts (86)
├── conversation-llm-provider.ts (12)
├── conversation-llm-response.ts (90)
├── fake-coaching-llm.adapter.ts (26)
├── fake-conversation-ai.adapter.ts (47)
├── ollama-conversation-llm.provider.ts (149)
├── openai-conversation-llm.provider.ts (64)
└── prompt-templates/prompt-templates.ts (10)
```

### assessment
```
src/modules/assessment/
├── assessment.controller.ts (83)
├── assessment.dto.ts (223)
├── assessment.errors.ts (77)
├── assessment.module.ts (38)
├── assessment-answer-store.service.ts (123)
├── assessment-definition.ts (201)
├── assessment-definition-view.ts (61)
├── assessment-deletion.service.ts (66)
├── assessment-lifecycle.service.ts (290)
├── assessment-result.service.ts (17)
├── assessment-result-mapping.ts (151)
├── assessment-submit.service.ts (243)
├── result-presenter.ts (96)
├── scoring.service.ts (100)
└── ports/assessment-deletion.port.ts (35)
```

### auth
```
src/modules/auth/
├── auth.module.ts (41)        auth-core.module.ts (25)
├── auth.controller.ts (71)    auth.service.ts (236)
├── auth.dto.ts (62)            auth.errors.ts (26)
├── auth-deletion.service.ts (110)
├── consent.controller.ts (60) consent.service.ts (190)
├── consent.dto.ts (65)         consent.errors.ts (37)
├── password.util.ts (17)
├── guards/jwt-auth.guard.ts (9)  guards/email-verified.guard.ts (28)
├── strategy/jwt.strategy.ts (25)
├── tokens/jwt-token.service.ts (62) tokens/refresh-cookie.service.ts (35) tokens/token-hash.ts (44)
└── ports/auth-deletion.port.ts (37) ports/email.port.ts (25)
    ports/fake-email.adapter.ts (34) ports/http-email.adapter.ts (58)
```

### coaching
```
src/modules/coaching/
├── coaching.controller.ts (51)  coaching.dto.ts (36)
├── coaching.errors.ts (43)      coaching.module.ts (33)
├── coaching-action.service.ts (63)
├── coaching-deletion.service.ts (25)
├── coaching-disclaimer.ts (27)
├── coaching-eligibility.service.ts (55)
├── coaching-generation.service.ts (209)
├── coaching-grounding.service.ts (116)
├── coaching-library.ts (89)
├── coaching-lifecycle.ts (5)
├── coaching-plan.service.ts (111)
├── coaching-plan-mapping.ts (62)
├── coaching-plan-validator.ts (81)
├── ports/coaching-deletion.port.ts (15)  ports/coaching-llm.port.ts (70)
└── rag/rag-client.service.ts (88)
```

### profile
```
src/modules/profile/
├── onboarding.guard.ts (43)   onboarding.service.ts (65)
├── ports/profile-deletion.port.ts (30)
├── profile.controller.ts (77) profile.dto.ts (73)
├── profile.module.ts (27)     profile.service.ts (266)
├── profile-deletion.service.ts (91)
└── timezone.util.ts (23)
```

### retention
```
src/modules/retention/
├── account-deletion.controller.ts (31)
├── account-deletion.service.ts (198)
├── retention.module.ts (36)
└── retention.service.ts (219)
```

### safety
```
src/modules/safety/
├── ports/safety-deletion.port.ts (35)
├── safety.controller.ts (44)  safety.dto.ts (89)
├── safety.errors.ts (33)      safety.module.ts (34)
├── safety.service.ts (257)
├── safety-classifier.ts (163)
├── safety-definition.ts (184)
├── safety-deletion.service.ts (73)
├── safety-reentry.service.ts (121)
└── safety-route.ts (39)
```

---

## 3. Per-module line-count table

All files are ≤300. The 12 largest across all non-conversation modules (watch list for the ≤300 rule during any future growth):

| Rank | File | Lines | Module |
|---|---|---|---|
| 1 | `assessment-lifecycle.service.ts` | 290 | assessment |
| 2 | `profile.service.ts` | 266 | profile |
| 3 | `safety.service.ts` | 257 | safety |
| 4 | `assessment-submit.service.ts` | 243 | assessment |
| 5 | `auth.service.ts` | 236 | auth |
| 6 | `assessment.dto.ts` | 223 | assessment |
| 7 | `retention.service.ts` | 219 | retention |
| 8 | `coaching-generation.service.ts` | 209 | coaching |
| 9 | `assessment-definition.ts` | 201 | assessment |
| 10 | `conversation-llm.adapter.ts` | 198 | ai |
| 11 | `account-deletion.service.ts` | 198 | retention |
| 12 | `safety-definition.ts` | 184 | safety |

Per-module averages: ai ~65, assessment ~120, auth ~59, coaching ~66, profile ~77, retention ~121, safety ~97.

---

## 4. Per-module responsibility findings

### ai — two unrelated AI concerns behind one folder
- **Coaching-AI**: `coaching-llm.adapter.ts`, `fake-coaching-llm.adapter.ts`, `prompt-templates/*`. Owned & exported by `AiModule` via `COACHING_LLM_PORT`. Consumed by `coaching-grounding.service.ts`.
- **Conversation-AI**: `conversation-ai.port.ts`, `conversation-llm.adapter.ts`, `conversation-llm-provider.ts`, `conversation-llm-response.ts`, `conversation-llm.errors.ts`, `conversation-json-schema-validator.ts`, `ollama-*` / `openai-*` providers, `fake-conversation-ai.adapter.ts`. **Not exported by `AiModule`** — `conversations.module.ts` wires `ConversationLlmAdapter` + `CONVERSATION_AI_PORT` directly.
- **Mixed responsibilities inside files:**
  - `coaching-llm.adapter.ts` mixes adapter + inline `COACHING_PLAN_SCHEMA` + `isPlanOutput` validator + `bilingualValue` helper. Schema/validator belong with the coaching port's DTOs, not the adapter.
  - `conversation-llm.adapter.ts` mixes adapter + two inline JSON schemas + provider-client factory + env-based config (`process.env` directly) + structured failure logging + re-export of error symbols.
  - `conversation-llm-response.ts` exports a `ConversationLlmProvider` *type* that collides conceptually with the provider *classes*.
  - `ai.config.ts` (`AiConfig`, `readAiConfig`) appears to be **dead code** — no importer in src or tests.
- **Inconsistent provider construction**: `CoachingLlmAdapter` builds the provider client per-call (`createClient` in `generatePlan`); `ConversationLlmAdapter` builds it once in the constructor. Inconsistent lifecycle for the same pattern.
- **Inconsistent config access**: coaching adapter reads `COACHING_LLM_*` env via `ConfigService`; conversation adapter reads the same env via raw `process.env`. No single config owner.

### assessment — clean lifecycle/submit split, duplicated onboarding helpers
- Lifecycle (pre-submit: definition, save, restart, per-answer safety) vs. submit (final idempotent transition + scoring + gating) split is clean and intentional.
- **`assertCanEnter` / `contextFor` / `transitionOnboarding` are duplicated verbatim** between `assessment-lifecycle.service.ts` and `assessment-submit.service.ts` — the clearest DRY cleanup.
- `ScoringService` is pure (no DB/network/AI) — Constitution IX compliant.
- Shape translation is well-extracted into 3 pure helpers: `assessment-definition-view.ts`, `assessment-result-mapping.ts`, `result-presenter.ts`.
- **Split persistence ownership**: `AssessmentAnswerStore` owns `AssessmentAnswer` + active `Assessment` upsert, but `Assessment` state updates, `OnboardingState` writes, and `AssessmentResult` writes happen directly in lifecycle/submit.
- **Dual source of truth**: `DOMAIN_ENUM` (Zod, in `assessment.dto.ts`) vs `DomainCode` (TS union, in `assessment-definition.ts`) for the same 8 domains — a mismatch would silently drift.
- `BilingualEntry` is **redefined** in `result-presenter.ts` while also imported from `safety/safety-definition` in submit — duplicate definition, drift risk.
- `AssessmentResultService` is a 17-line read-only façade, exported as a concrete class to coaching (not ported).

### auth — clean base module; public surface not formalized
- `auth.service.ts` (236) is cohesive (register/verify/login/refresh/logout) but carries several sub-flows; an optional `VerificationService` extraction (register + verify + VERIFICATION_TTL) is natural but not size-driven.
- `consent.service.ts` (190) is cohesive; `hasGrantedCurrentConsent` is the documented narrow cross-module API for the OnboardingGuard (SAD §11).
- `auth-deletion.service.ts` (110) has a 2-step find-then-delete loop for pre-consent accounts — a workaround for InMemoryPrisma's lack of nested-relation filters; it is N+1 against real Prisma (`consentRecord.findFirst` per candidate).
- **No repository layer anywhere** — all three services inject `PrismaService` and call Prisma client methods inline (incl. a `$transaction` in `verifyEmail`). Consistent with the rest of the codebase but couples domain logic to the Prisma schema shape.
- `password.util.ts` (argon2) and `token-hash.ts` (crypto) are pure, no-framework deps — excellent.
- `token-hash.ts` exports `sameHash` which **appears unused** (no callers found) — dead code candidate.
- `errName` (3-line helper) is duplicated across `auth.service.ts`, `consent.service.ts`, `auth-deletion.service.ts`.
- Placeholder `onboarding_state: 'NOT_STARTED'` literal in `LoginProfile` (US1 stub, acknowledged).

### coaching — flat layout; content assets mixed with code; ownership-inverted AI imports
- `coaching-generation.service.ts` (209) mixes: (a) generation lifecycle bookkeeping (lease, attempt record, stale reclaim), (b) LLM call + validation, (c) LLM-output → persistence-graph mapping (`mapGraph`/`findGoal`/`findAction`, ~50 lines, pure). The mapping is the natural extraction.
- `coaching-grounding.service.ts` (116) mixes integrity verification (library + disclaimer) + focus-area evidence selection + RAG retrieval wiring.
- `coaching-library.ts` (89) and `coaching-disclaimer.ts` (27) are **near-twins**: both define a static content fixture + integrity hash + content-gate flag + dev-fixture warning. They are content assets living alongside services, not under a `content/` folder. Inconsistent canonical-JSON: library uses sorted-key canonical form, disclaimer uses plain `JSON.stringify` — integrity-semantics inconsistency.
- `coaching-lifecycle.ts` (5 lines, single `recomputePlanStatus` function) is a **degenerate file** — too small to justify its own module.
- `coaching-plan-validator.ts` and `coaching-plan-mapping.ts` are pure functions (no DI) — good.
- `CoachingEligibilityService` is the cross-module gatekeeper; it directly instantiates `OnboardingGuardContext` and calls four external services. It returns `ScoredResultDto` (an assessment-domain type) through its return signature — leaks an assessment type.
- `CoachingDeletionService.deleteExpired` is a **no-op stub** returning `{deleted:0, errors:0}` — unimplemented against the port contract.
- `RagApiClientService.retrieve` builds its own `question` string and **ignores most `RagRetrievalRequest` fields** (`priority_codes`, `safety_exclusions`, `max_context_chars`, `language`) — contract/impl drift.
- A local `Db` type alias (`Record<string, {...}>`) bypassing Prisma typing is repeated as a `get db(): Db` accessor in **5+ files** — consistent but defeats type-safety.
- `inFlight: Map<string, AbortController>` in `CoachingGenerationService` is single-instance only (not horizontally safe).

### profile — low-level domain module; one well-justified upward edge
- `onboarding.guard.ts` (abstract + types + token) vs `onboarding.service.ts` (concrete impl) — clean interface/impl split. The naming is slightly misleading: `onboarding.service.ts` is a guard impl, not a domain service.
- `profile.service.ts` (266) mixes: profile/preferences CRUD + guard-context assembly + completion check + `deriveAssessmentState` derivation + `STEP_ROUTE` map. Cohesive but approaching the split threshold; not warranted yet at 266.
- `profile-deletion.service.ts` is single-responsibility.
- **Raw Prisma in both services** (no repository layer). Business decisions live in the service: "missing profile → default `en`/empty tz", "missing onboarding row → NOT_STARTED", "re-save is no-op unless state ∈ {NOT_STARTED, IN_PROGRESS}" (FR-034), "completion = state === COMPLETED'", "fail-closed consent → requires_reconsent true".
- `errName` (3-line) duplicated in `profile.service.ts` and `profile-deletion.service.ts`.
- No unit test for `ProfileService` in isolation (contract test covers it end-to-end).

### retention — clean top-level orchestrator; minor doc/duplication nits
- Two distinct flows correctly owned here: user-initiated deletion (`account-deletion.*`) and scheduled retention (`retention.service.ts`). They are **not duplicates** — different triggers, different idempotency strategies, different status spaces.
- `RetentionService.run<C>()` is JSDoc-documented as "shared run core used by both" but is **only called by the cron path**; `AccountDeletionService` re-implements its own `run`/`sumErrors`/`totalCounts`. Misleading doc.
- `DeletionLog.findMany` + in-JS `.find` on `confirmationId` for idempotency dedup — unbounded scan as the table grows; should be an indexed `findUnique`/compound query. Perf, not structure.
- `categoryCounts` cast as `unknown as object` repeated 4× — minor typing smell.
- Both services write `DeletionLog` directly via `PrismaService` (acceptable — `DeletionLog`/`UserAccount` are retention-owned).

### safety — biggest internal-as-public leak; cross-module Prisma writes
- Single classification source of truth: `safety-classifier.ts` (`classifySafety`) is the only decision function; `SafetyService` wraps it with persistence/copy/routing and never overrides it. Clean.
- `safety-definition.ts` (data/contract) cleanly separated from `safety-classifier.ts` (logic). Good.
- Service split is good: `SafetyService` (orchestration/persistence), `SafetyReentryService` (re-entry), `SafetyDeletionService` (retention).
- `SafetyService` (257) mixes three concerns: classification orchestration + append-only persistence + cross-module state transitions (`applyRouting`, `setOnboardingState`, `resumeAssessment` write `OnboardingState`/`Assessment` rows directly via Prisma).
- **`safety-definition.ts` and `safety-classifier.ts` are consumed as de-facto public API** by assessment and conversations, but they are bare `export const/type/interface` with **no barrel, no facade, no `index.ts`**. The NestJS `SafetyModule.exports` only declares `SafetyService` and `SAFETY_DELETION_PORT` — so every consumer reaching into `safety-definition` is bypassing the declared boundary.
- `safety-deletion.service.ts` has a **local `errName` duplicate** that duplicates `safety.errors.ts:errName`.
- No DTO validation pipeline in `safety.controller.ts`/`safety-reentry.service.ts` — `@Body() body: unknown` cast to `SafetyReentryBody`, validated manually. Consistent with fail-closed manual validation, but the wire contract is hand-enforced, not schema-enforced.
- `safety-classifier.ts`, `safety-definition.ts`, `safety-route.ts` are correctly **not** `@Injectable` (pure helpers) — good call.
- No dedicated test listed for `SafetyDeletionService` (verify retention coverage).

---

## 5. Cross-module boundary violations

Classification: **GOOD** = clean public contract; **QUESTIONABLE** = works but couples via deep path / concrete service / internal; **VIOLATION** = reaches into another module's internal implementation or inverts ownership.

### V1. `JwtPayload` is a de-facto public contract buried in an internal path — VIOLATION
- `JwtPayload` is defined in `auth/tokens/jwt-token.service.ts:6-12` and **not** exported by `AuthModule` or `AuthCoreModule` (the latter exports `JwtTokenService` the *class*, not the payload *type*).
- Six modules deep-import it: assessment, coaching, safety, profile, retention (+ conversations) controllers do `req.user as JwtPayload`.
- It is the cross-module authentication contract but reached via an internal-looking path. A rename/move of `tokens/jwt-token.service.ts` would break 6+ modules.

### V2. `JwtAuthGuard` / `EmailVerifiedGuard` not exported by the auth module — QUESTIONABLE
- Used by assessment, coaching, safety, profile, retention controllers via deep import `../auth/guards/*`.
- Guards are framework contracts, not internals, but consumers reach past the module barrel into `guards/`. Should be re-exported from `AuthCoreModule` (which owns Passport) or `AuthModule`.

### V3. `assessment` (and `conversations`) reach into `safety-definition` / `safety-classifier` internals — VIOLATION (internal-as-public)
- `assessment-answer-store.service.ts`: `SQ02_TRIGGER_CODES`, `Sq01Code`, `Sq02Code`, `Sq03Code` from `../safety/safety-definition`.
- `assessment-definition-view.ts`: `SAFETY_QUESTIONS` from `../safety/safety-definition`.
- `assessment-lifecycle.service.ts`: `SQ02_TRIGGER_CODES`.
- `assessment-result-mapping.ts`: `Sq01Code/Sq02Code/Sq03Code` from `safety-definition`; `ClassifierDomainScore` from `../safety/safety-classifier`.
- `assessment-submit.service.ts`: `SAFETY_COPY`, `BilingualEntry` from `safety-definition`.
- `conversations` (excluded from recommendations, but noted): `SAFETY_COPY` from `safety-definition`.
- These are safety's *data and classifier input shape* — safety-critical, versioned, approved copy — consumed as if public while the module boundary declares only `SafetyService` + `SAFETY_DELETION_PORT`. `ClassifierDomainScore` leaking to assessment couples assessment to the classifier's exact input shape. **This is the single biggest architectural risk**: any copy/matrix version bump silently breaks assessment/conversations.

### V4. `coaching` imports AI's conversation-LLM internals — VIOLATION
- `coaching-generation.service.ts`: `normalizeConversationLlmError` from `../ai/conversation-llm.errors`. This symbol belongs to AI's *conversation* LLM adapter; coaching's plan LLM is a different concept. Coaching's error normalization depends on a conversation-specific helper.
- `coaching-grounding.service.ts`: `COACHING_PLAN_PROMPT_TEMPLATE` from `../ai/prompt-templates/prompt-templates`. A coaching-named prompt asset **stored inside the AI module** — ownership is inverted. Either AI exposes a generic prompt-registry port and coaching registers its template, or coaching owns `COACHING_PLAN_PROMPT_TEMPLATE` and AI consumes it.

### V5. `AiModule` is not the boundary for conversation-AI — VIOLATION
- `AiModule` exports only `COACHING_LLM_PORT`. It does **not** export `CONVERSATION_AI_PORT`.
- `conversations.module.ts` wires `ConversationLlmAdapter` + `CONVERSATION_AI_PORT` directly (bypassing `AiModule`), so `AiModule` is half a library (coaching-AI) and half a sibling implementation folder for conversations. The dependency between `ai` and `conversations` is bidirectional at the file level (ai imports a conversations RAG type; conversations imports ai's adapter + port).

### V6. `ai` reverse type-dependency on `conversations` — QUESTIONABLE
- `ai/conversation-ai.port.ts` imports the `ConversationRagChunk` type from `../conversations/rag/conversation-rag-client.port`. Type-only (no runtime coupling), but the AI module's port references a conversations-owned RAG type. The shared type should be neutral or owned by AI. (Noted because another module depends on conversations; conversations itself is excluded from recommendations.)

### V7. `coaching` → `assessment` via concrete service + reused exception — QUESTIONABLE
- `coaching-eligibility.service.ts`: `AssessmentResultService` (concrete service, exported by `AssessmentModule` — public, but not ported), `ScoredResultDto` (public DTO), `ResultNotFoundException` (assessment's HTTP exception, **reused inside coaching** — coaching throws an assessment-shaped error; should map to a coaching-owned error).
- `coaching-generation.service.ts` and `coaching-grounding.service.ts`: `ScoredResultDto`.

### V8. Direct cross-module service imports without ports — QUESTIONABLE (documented-intentional)
- `assessment`, `coaching`, `safety` → `ConsentService` (auth) — concrete exported service; documented sanctioned consent-read path (SAD §11). Acceptable but no port indirection.
- `assessment`, `coaching` → `SafetyService` (safety) — concrete exported service; `evaluatePerAnswer`/`evaluateOnSubmit`/`currentRoute`/`currentLevel` form an implicit contract. No `SafetyEvaluationPort` exists to mirror the deletion-port pattern.
- `assessment`, `coaching`, `safety` → `OnboardingGuardService` (profile) — **GOOD** (abstract class exported; consumers depend on the abstraction, impl swappable via DI). This is the correct public-contract pattern.
- `profile` → `ConsentService` — same as above (QUESTIONABLE).

### V9. Cross-module writes via Prisma bypassing the owning module's API — QUESTIONABLE (documented pattern)
- `SafetyService.applyRouting` / `setOnboardingState` / `resumeAssessment` write `OnboardingState` and `Assessment` rows directly via Prisma (not via Profile/Assessment). Avoids circular NestJS DI (Safety does not import AssessmentModule). Documented "mirror the codebase pattern" but means Safety mutates other domains' state directly.
- `AssessmentLifecycleService` / `AssessmentSubmitService` write `OnboardingState` directly via Prisma (not via Profile).
- `SafetyDeletionService` reads `Assessment` rows via Prisma (not via AssessmentModule).

### V10. Module-level reverse source dependency `ai → coaching` — QUESTIONABLE (hexagonal, acceptable)
- `ai.module.ts` imports the `COACHING_LLM_PORT` *symbol* from `../coaching/ports/coaching-llm.port` to bind `CoachingLlmAdapter` to it. `coaching.module.ts` imports `AiModule`. No module-level cycle (ai does not import `CoachingModule`), but there is a source-level reverse reference (provider side → consumer's port file). This is the standard hexagonal pattern where the consumer owns the port. Acceptable; the port file is the public contract.

### Summary counts
- **VIOLATION**: V1, V3, V4, V5 (4).
- **QUESTIONABLE**: V2, V6, V7, V8, V9, V10 (6).
- **GOOD**: deletion-port pattern (retention → all 5 domains), `OnboardingGuardService` abstract export, `ConsentService` documented consent-read, `EmailPort`, `COACHING_LLM_PORT` port/adapter.

---

## 6. Dependency graph

```
                         ┌──────────────────────────┐
                         │          auth            │  (base module; no outbound domain deps)
                         │  AuthService ConsentService│
                         │  AUTH_DELETION_PORT EMAIL_PORT│
                         └──────────────┬───────────┘
            guards/JwtPayload (V1,V2)   │  ConsentService (V8)
                 ▲                       │
                 │                       ▼
            ┌────┴────────┐         ┌─────────────┐
            │  profile    │◄────────┤  (consumers) │
            │ Onboarding- │ guard   │              │
            │  GuardService│(GOOD)  │              │
            └──────┬──────┘         └──────────────┘
                   │ OnboardingGuard (GOOD, abstract)
        ┌──────────┼──────────────────────────────────┐
        │          │                                  │
        ▼          ▼                                  ▼
   ┌────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐
   │ safety │  │assessment│  │ coaching │  │ retention│
   │SafetySvc│◄┤──imports─┤  │          │  │ (sink)   │
   │SAFETY_  │ │ SafetySvc│  │          │  │          │
   │DELETION │ │ (V8)     │  │          │  │  imports │
   │_PORT    │ │          │  │          │  │ all 5 via│
   └────┬────┘ │ + safety │  │          │  │ DELETION │
        │      │   internals│          │  │  PORTS   │
        │      │   (V3)◄───┤  │          │  │ (GOOD)  │
        │      │ Assessment│  │          │  └─────────┘
        │      │ ResultSvc │  │ ←AssessmentResultSvc (V7)
        │      └─────┬─────┘  │   ScoredResultDto / ResultNotFound
        │            │        │
        │            │        │  ┌──────────────────────┐
        │            │        └──┤ ai                   │
        │            │           │ COACHING_LLM_PORT    │
        │            │           │ (port/adapter, GOOD)  │
        │            │           │                       │
        │            │           │ + conversation-AI     │
        │            │           │   NOT exported (V5)   │
        │            │           │ + reverse type dep V6  │
        │            │           └──────────┬────────────┘
        │            │                      │
        └────────────┴──────────────────────┴────────── conversations (EXCLUDED)
                         SafetyService + SAFETY_COPY (V3)
```

**Direction summary (acyclic at the NestJS module level):**
- `auth` is the base (no outbound domain deps). Inbound: assessment, coaching, safety, profile, retention (+ conversations).
- `profile` → `auth` (consent read). Inbound: assessment, coaching, safety (guard); retention (deletion port).
- `safety` → `auth`, `profile`. Inbound: assessment, coaching (SafetyService + safety-definition internals); conversations (SAFETY_COPY); retention (deletion port).
- `assessment` → `auth`, `profile`, `safety`. Inbound: coaching (AssessmentResultService + DTO + error); retention (deletion port).
- `coaching` → `auth`, `profile`, `safety`, `assessment`, `ai`. Inbound: retention (deletion port).
- `ai` → `coaching` (port symbol), `conversations` (type). Inbound: coaching (COACHING_LLM_PORT consumed), conversations (adapter wired directly).
- `retention` → all 5 domain modules via deletion ports (sink/orchestrator; nothing depends back).

**No circular NestJS DI.** The circularities are at the *file-import* level: assessment ↔ safety (assessment imports safety internals; safety writes assessment tables via Prisma), and ai ↔ conversations (ai imports a conversations type; conversations wires ai internals). Both are documented/accepted today.

---

## 7. Files >300 lines

**None.** No handwritten source file in any non-conversation module exceeds 300 lines. This is the headline structural fact: the cleanup is **not** a size problem. It is (a) flat layout (modules do not use the `controllers/services/repositories/dto/utils/constants` convention the conversations module now follows) and (b) cross-module boundary leakage (section 5).

Watch list (largest files, ≤300 today, most likely to cross if logic grows):
1. `assessment-lifecycle.service.ts` (290) — natural extractions: shared onboarding-coordinator (~60 lines, removes verbatim duplication with submit) + `crossValidate` (~30). Resulting ~190. Risk MEDIUM.
2. `profile.service.ts` (266) — natural extraction: `OnboardingStateService` (onboarding-state reads + completion + `deriveAssessmentState` + `STEP_ROUTE`) ~120 out → ~145. Risk LOW. **Not warranted yet.**
3. `safety.service.ts` (257) — natural extractions: `SafetyEvaluationRepository` (persistEvaluation + queries) ~80 + `SafetyRoutingService` (applyRouting/setOnboardingState) ~50 → ~140. Risk LOW-MEDIUM. **Not warranted yet.**
4. `assessment-submit.service.ts` (243) — consume shared coordinator + optional insight-assembler ~50 → ~170. Risk MEDIUM.
5. `auth.service.ts` (236) — optional `VerificationService` ~110 out → ~150. Risk LOW. **Not warranted.**
6. `coaching-generation.service.ts` (209) — extract `coaching-generation-mapping.ts` (pure `mapGraph`/`findGoal`/`findAction`) ~55 → ~145. Risk LOW. **Optional.**

No extraction is *required* by the ≤300 rule anywhere. All are optional / preventative.

---

## 8. Repository findings

- **No module (except conversations) has a repository layer.** Every domain service injects `PrismaService` and calls Prisma client methods inline. This is consistent across ai/assessment/auth/coaching/profile/retention/safety, so it is the de-facto project convention, not a per-module defect.
- Consequences observed:
  - **Raw Prisma + business decisions in services**: "missing profile → default `en`" (profile), "missing onboarding row → NOT_STARTED" (profile/assessment), "re-save no-op unless state ∈ {NOT_STARTED, IN_PROGRESS}" (FR-034, profile), "completion = state === COMPLETED'" (profile), safety append-only `isCurrent` flip inside `SafetyService` (FR-031 invariant), assessment `Assessment`/`OnboardingState` writes in lifecycle/submit.
  - **Split persistence ownership** in assessment: `AssessmentAnswerStore` owns `AssessmentAnswer` + active `Assessment` upsert, but `Assessment` state updates, `OnboardingState`, `AssessmentResult` writes are direct in lifecycle/submit.
  - **InMemoryPrisma workaround leak**: `AuthDeletionService`'s 2-step find-then-delete loop (N+1) and `RetentionService`'s `DeletionLog.findMany`+in-JS filter (unbounded scan) exist *because* there is no repository to hide the test-double's limitations. These are perf/structure debts, not bugs today.
  - **Cross-module Prisma writes** (V9): safety/assessment write other modules' tables directly via `PrismaService` to avoid circular DI.
- **Verdict**: introducing repositories is *not* required by the structural-convention mandate ("repositories should contain persistence only" — the codebase has none to misplace). If a repository layer is later mandated, the highest-value introductions are: a `SafetyEvaluationRepository` (encapsulates the append-only `$transaction`), an `AssessmentRepository` (consolidates `Assessment`/`OnboardingState`/`AssessmentResult` writes out of lifecycle/submit), and a retention `DeletionLog` query helper. All **later phase**, not part of structural standardization.

---

## 9. Service findings

Per-service responsibility verdict (all `@Injectable`, constructor-injected, no god-classes):

| Module | Service | Lines | Verdict |
|---|---|---|---|
| ai | `CoachingLlmAdapter` | 107 | Adapter + inline schema/validator (mixed). Per-call provider construction. |
| ai | `ConversationLlmAdapter` | 198 | Adapter + inline schemas + config + logging (mixed). Constructor-time provider construction. |
| assessment | `AssessmentLifecycleService` | 290 | Orchestrator; duplicates onboarding helpers with submit. Near 300. |
| assessment | `AssessmentSubmitService` | 243 | Orchestrator; duplicates onboarding helpers with lifecycle. |
| assessment | `AssessmentAnswerStore` | 123 | Persistence (AssessmentAnswer + active Assessment upsert) — closest thing to a repository. |
| assessment | `AssessmentResultService` | 17 | Read-only façade; exported concrete to coaching (not ported). |
| assessment | `ScoringService` | 100 | Pure (no DB/network/AI) — excellent. |
| assessment | `AssessmentDeletionService` | 66 | Port impl; idempotent. No unit test. |
| auth | `AuthService` | 236 | Cohesive; optional VerificationService split (not size-driven). |
| auth | `ConsentService` | 190 | Cohesive; `hasGrantedCurrentConsent` is the narrow cross-module API. |
| auth | `AuthDeletionService` | 110 | Port impl; N+1 pre-consent loop (InMemoryPrisma workaround). No unit test. |
| auth | `JwtTokenService` / `RefreshCookieService` | 62/35 | Stateless framework primitives. Clean. |
| coaching | `CoachingGenerationService` | 209 | Lifecycle + LLM call + mapping (mixed); `inFlight` map (single-instance). Mapping is the extraction. |
| coaching | `CoachingGroundingService` | 116 | Integrity verification + evidence + RAG wiring (mixed). |
| coaching | `CoachingPlanService` | 111 | Orchestrator; tight/coherent. |
| coaching | `CoachingEligibilityService` | 55 | Cross-module gatekeeper; returns assessment DTO (leak); 4 direct service deps. |
| coaching | `CoachingActionService` | 63 | Cohesive (optimistic concurrency + status recompute). |
| coaching | `CoachingDeletionService` | 25 | `deleteExpired` is a **no-op stub**. |
| profile | `ProfileService` | 266 | Cohesive but approaching 300; raw Prisma + business rules inline. |
| profile | `OnboardingGuardServiceImpl` | 65 | Pure, no DB — correct (consumed via abstract). |
| profile | `ProfileDeletionService` | 91 | Port impl; single-responsibility. |
| retention | `RetentionService` | 219 | Scheduled orchestrator; `run<C>()` doc misleading (not shared by account-deletion). |
| retention | `AccountDeletionService` | 198 | User-initiated orchestrator; re-implements run/sumErrors (duplication with retention). |
| safety | `SafetyService` | 257 | Orchestration + persistence + cross-module state writes (mixed). Near 300. |
| safety | `SafetyReentryService` | 121 | Re-entry flow; delegates to SafetyService (one-way). Clean. |
| safety | `SafetyDeletionService` | 73 | Port impl; local `errName` duplicate. No dedicated test. |

**Trivial/degenerate service-shaped files:** `coaching-lifecycle.ts` (5-line pure function, not `@Injectable`, its own file — degenerate). `assessment-result.service.ts` (17-line read façade — acceptable but could be a repository method).

**Dead code:** `ai.config.ts` (`readAiConfig`/`AiConfig` — no importers). `token-hash.ts` `sameHash` (no callers).

---

## 10. DTO/schema findings

- **Zod is the validation standard** (Zod schemas + `ZodValidationPipe`) across assessment, auth, profile, coaching, safety. No `class-validator`. Consistent.
- **Response shapes are TS interfaces, not Zod-validated** (output validation not enforced) — matches the codebase pattern.
- `assessment.dto.ts` (223, largest DTO) co-locates Zod answer schemas + `answerSchemaForQuestionId`/`kindForQuestionId` dispatch + all wire response interfaces. `DOMAIN_ENUM` (Zod) vs `DomainCode` (definition) dual source of truth for the 8 domains.
- `BilingualEntry` is **defined in `safety-definition.ts`** and **redefined in `assessment/result-presenter.ts`** while also imported in `assessment-submit.service.ts` — triplicated, drift risk.
- `coaching/ports/coaching-llm.port.ts` (70) carries `GroundingBundle` + `LlmPlanOutput` — large structural contracts (40+ lines) consumed by validator/grounding/generation, arguably belong in a `dto/` not the port file.
- `coaching-llm.adapter.ts` inlines `COACHING_PLAN_SCHEMA` + `isPlanOutput` — the coaching port's runtime schema/validator lives in an **AI adapter**, not with the coaching port.
- `conversation-llm.adapter.ts` inlines two JSON schemas (grounded_answer, follow_up_rewrite) duplicating structure implied by the port DTOs, not reusable by tests/providers.
- `ai/conversation-json-schema-validator.ts` is a **hand-rolled JSON-Schema subset matcher** (object/array/string/number/integer/null + required/additionalProperties/minLength/minItems/minimum), used only by the Ollama cloud path — duplicates well-tested libraries (ajv). Structural smell, not a bug.
- `safety.dto.ts` `SafetyRoute` is the one type consumed cross-module (assessment.dto imports it) — legitimately shared, but should be re-exported via a safety public surface, not the dto file directly.
- `retention` has **no DTOs/folder** — the `AccountDeletionOutcome` type is returned directly as JSON; acceptable for a single-shape sanitized response.

---

## 11. Utility/helper findings

**Correctly pure, not `@Injectable` (good):** `safety-classifier.ts`, `safety-definition.ts`, `safety-route.ts`, `assessment-definition-view.ts`, `assessment-result-mapping.ts`, `result-presenter.ts`, `coaching-plan-validator.ts`, `coaching-plan-mapping.ts`, `coaching-lifecycle.ts`, `password.util.ts`, `token-hash.ts`, `timezone.util.ts`, `conversation-llm-response.ts`, `conversation-llm.errors.ts`, `conversation-json-schema-validator.ts`.

**Duplication:**
- `errName` (3-line coarse error-name helper) duplicated across **6** services: `auth.service.ts`, `consent.service.ts`, `auth-deletion.service.ts`, `profile.service.ts`, `profile-deletion.service.ts`, `safety-deletion.service.ts` (safety has its own `safety.errors.ts:errName` that the deletion service duplicates). Trivial; could hoist to `common/errName.ts`.
- `BilingualEntry` — triplicated (see §10).
- `DOMAIN_ENUM` vs `DomainCode` — dual source of truth (see §10).
- Canonical-JSON integrity: `coaching-library.ts` (sorted-key) vs `coaching-disclaimer.ts` (plain `JSON.stringify`) — inconsistent integrity semantics.
- Coaching `Db` type-alias workaround repeated in 5+ files.

**Dead helpers:** `ai.config.ts` (`readAiConfig`), `token-hash.ts` `sameHash`.

**Degenerate file:** `coaching-lifecycle.ts` (5 lines) — should fold into `coaching-plan-mapping.ts` or `coaching-action.service.ts`.

**Self-contradicting util:** `conversation-llm.errors.ts` `normalizeConversationLlmError` classifies via `error.message` regex (`/rate/i`, `/disabled|not_configured/i`, `/invalid|malformed/i`, `/unsafe/i`) **despite its own doc-comment stating classification should never come from message text** — documented invariant violation inside the util.

**Test doubles co-located with sources:** `ai/fake-coaching-llm.adapter.ts`, `ai/fake-conversation-ai.adapter.ts` live in `src/modules/ai/` (not `tests/helpers/`). Plus `tests/helpers/fake-conversation-llm.ts` is a **second fake for the same `ConversationAiPort`** — two fakes for one port is a smell.

---

## 12. Test findings

Tests are **flat** in `tests/unit/`, `tests/contract/`, `tests/e2e/`, `tests/integration/` — **not** organized into per-module subfolders (except `conversations/`, reorganized in the prior refactor). This is consistent across all non-conversation modules; reorganization is explicitly out of scope for this audit.

Per-module test inventory:

| Module | Unit | Contract | E2E/Integration |
|---|---|---|---|
| ai | `coaching-llm.adapter.spec.ts` (48); **4 files under `conversations/` test ai sources** (see below) | — | — |
| assessment | `scoring.spec.ts` (121), `result-presenter.spec.ts` (141) | `assessment.contract.spec.ts` (448) | `assessment-submit-idempotency.spec.ts` (191) |
| auth | `email-and-token.spec.ts` (92), `consent-versions.spec.ts` (181) | `auth.contract.spec.ts` (251), `consent.contract.spec.ts` (271) | — |
| coaching | `coaching-generation.spec.ts` (206), `coaching-grounding.spec.ts` (79), `coaching-eligibility.spec.ts` (56), `coaching-plan-validator.spec.ts` (117), `coaching-lifecycle.spec.ts` (17), `coaching-dev-fixtures.spec.ts` (40), `coaching-llm.adapter.spec.ts` (48) | `coaching.contract.spec.ts` (281), `coaching-rag-boundary.contract.spec.ts` (92) | `coaching-plan.spec.ts` (229), `coaching-rag-plan.e2e-spec.ts` (76) |
| profile | `profile-validation.spec.ts` (78), `onboarding-guard.spec.ts` (69) | `profile-onboarding.contract.spec.ts` (456) | — |
| retention | — | — | `account-deletion.spec.ts` (341), `retention-cleanup.spec.ts` (428) |
| safety | `safety-classifier.spec.ts` (199), `redact.spec.ts` (66) | `safety.contract.spec.ts` (405) | `safety-routing.spec.ts` (248), `redaction-audit.spec.ts` (331) |

Cross-cutting: `tests/e2e/resume-restart.spec.ts` (324), `tests/e2e/isolation.spec.ts` (264), `tests/e2e/reset-test-coaching-plan.spec.ts` (105), `tests/unit/app.service.spec.ts` (15).

**Mislocated tests:** 4 unit files live under `tests/unit/conversations/` but exercise `ai/` sources — `conversation-ai-ports.spec.ts` (42, tests `ai/conversation-ai.port.ts`), `conversation-llm-adapter.spec.ts` (214, tests `ai/conversation-llm.adapter.ts`), `conversation-ollama-cloud-provider.spec.ts` (269, tests `ai/ollama-conversation-llm.provider.ts`), `conversation-llm-failures.spec.ts` (29, tests `ai/conversation-llm.errors.ts`). They should live under `tests/unit/ai/` to match source location. Pure move; no behavioral change. (Note: the prior conversations refactor deliberately left these at root because their primary subject is the AI adapter; they are still under `conversations/` rather than `ai/`.)

**Coverage gaps (unit isolation):**
- `AssessmentResultMapping` (6 pure helpers) — no unit test (exercised only via contract/e2e).
- `AssessmentDefinitionView` (pure projection) — no unit test.
- `AssessmentAnswerStore` (required-set + SQ-02 conditional requiredness) — no dedicated test.
- `AssessmentLifecycleService` (SAFETY_HOLD save blocking, corrupt-progress re-anchoring, crossValidate) — only indirect coverage.
- `AssessmentDeletionService` / `AuthDeletionService` / `SafetyDeletionService` — no dedicated unit tests (counters/cutoffs); verify retention coverage.
- `ProfileService` (`transitionTo` no-op logic, `getOnboardingCompletion` fail-closed) — only contract coverage.
- `coaching-plan-mapping.ts`, `coaching-action.service.ts` — no dedicated unit tests.
- `RetentionService.scheduledCutoffs()` — exposed "for unit tests" but no unit test provided.

**Implementation-coupled tests:** `coaching-llm.adapter.spec.ts` (48) and `coaching-generation.spec.ts` (206) assert on `COACHING_PLAN_SCHEMA`/`isPlanOutput`/`errorCode` strings — any extraction/relocation of the schema or `normalizeConversationLlmError` must keep these green.

**Pre-existing failures (NOT introduced by this audit; do not fix):**
1. `tests/unit/coaching-grounding.spec.ts` — 3 failing tests (`looks up pinned snapshots by exact version and no active flag`, `fails closed when the library snapshot is missing`, `fails closed when the disclaimer snapshot is missing or corrupt`). Coaching module; zero conversations references; environmental/fixture-related.
2. ESLint `no-useless-catch` at `src/modules/ai/ollama-conversation-llm.provider.ts:71`. (This file was already modified/staged at session start; not opened by this audit.)

---

## 13. Proposed target structure per module

Target convention (from the conversations refactor): `module-name/{controllers,services,repositories,dto,utils,constants,ports,providers,adapters}.module-name.module.ts` — special folders only when genuinely needed; do not force empty folders or deep hierarchies.

### ai (genuinely needs providers/ports/dto/utils — it is an integration module)
```
src/modules/ai/
├── ai.module.ts                    # export BOTH COACHING_LLM_PORT and CONVERSATION_AI_PORT (V5)
├── config/ai.config.ts             # single config reader; replace process.env + ConfigService duplication; delete dead readAiConfig
├── coaching/
│   ├── coaching-llm.adapter.ts      # adapter only
│   ├── coaching-plan.schema.ts     # COACHING_PLAN_SCHEMA + isPlanOutput + bilingualValue (out of adapter)
│   ├── fake-coaching-llm.adapter.ts
│   └── prompt-templates.ts          # COACHING_PLAN_PROMPT_TEMPLATE (moved from prompt-templates/) — or move to coaching/ (see V4)
├── conversation/
│   ├── conversation-ai.port.ts     # port + DTOs (remove ConversationRagChunk reverse import — V6)
│   ├── conversation-llm.adapter.ts # adapter only
│   ├── conversation-llm-provider.ts
│   ├── conversation-llm-response.ts
│   ├── conversation-llm.errors.ts
│   ├── conversation-llm.schemas.ts # grounded_answer + follow_up_rewrite JSON schemas (out of adapter)
│   ├── conversation-json-schema-validator.ts
│   ├── ollama-conversation-llm.provider.ts
│   ├── openai-conversation-llm.provider.ts
│   └── fake-conversation-ai.adapter.ts
└── shared/llm-provider.factory.ts  # deduplicated Ollama/OpenAI client construction (both adapters)
```

### assessment
```
src/modules/assessment/
├── assessment.module.ts
├── controllers/assessment.controller.ts
├── services/{assessment-lifecycle,assessment-submit,assessment-answer-store,assessment-result,assessment-deletion,scoring}.service.ts
├── services/assessment-onboarding-coordinator.ts   # NEW: shared transition/guard helpers (removes duplication)
├── repositories/  (defer — no repository layer today; add if mandated)
├── dto/{assessment.dto,assessment-definition-view,result-presenter}.ts
├── domain/{assessment-definition,assessment-result-mapping,assessment.errors}.ts
├── utils/assessment-cross-validation.ts             # NEW (optional): AG-02/AG-03 vs AG-01
└── ports/assessment-deletion.port.ts
```

### auth (already idiomatic; mostly leave; add a public barrel)
```
src/modules/auth/
├── auth.module.ts / auth-core.module.ts   # re-export JwtAuthGuard, EmailVerifiedGuard, JwtPayload (V1,V2)
├── public/index.ts (or auth.public.ts)     # NEW barrel: JwtPayload, JwtAuthGuard, EmailVerifiedGuard, ConsentService, AUTH_DELETION_PORT, AuthDeletionPort
├── auth.controller.ts / auth.service.ts / auth.dto.ts / auth.errors.ts / auth-deletion.service.ts
├── consent.controller.ts / consent.service.ts / consent.dto.ts / consent.errors.ts
├── password.util.ts
├── guards/ strategy/ tokens/ ports/   (unchanged)
```

### coaching
```
src/modules/coaching/
├── coaching.module.ts
├── controllers/coaching.controller.ts
├── services/{coaching-plan,coaching-action,coaching-eligibility,coaching-generation,coaching-generation-mapping,coaching-grounding,coaching-deletion}.service.ts
├── dto/coaching.dto.ts                     # + GroundingBundle/LlmPlanOutput moved out of the port file
├── content/{coaching-library,coaching-disclaimer}.ts   # content assets separated from code
├── mapping/coaching-plan-mapping.ts
├── validators/coaching-plan-validator.ts
├── utils/coaching-lifecycle.ts              # or fold into mapping/
├── ports/{coaching-deletion.port,coaching-llm.port}.ts  # slim: interface + token only
└── rag/rag-client.service.ts
```

### profile
```
src/modules/profile/
├── profile.module.ts
├── controllers/profile.controller.ts
├── services/{profile,profile-deletion}.service.ts
├── onboarding/{onboarding.guard,onboarding.service}.ts   # interface + impl together (optional cosmetic)
├── dto/profile.dto.ts
├── utils/timezone.util.ts
└── ports/profile-deletion.port.ts
```

### retention (already correct flat; leave unless it grows)
```
src/modules/retention/
├── retention.module.ts
├── account-deletion/{account-deletion.controller,account-deletion.service}.ts   # optional subfolder if a 3rd flow is added
├── retention.service.ts
└── (shared/ deletion-log.ts — optional dedup)
```

### safety (needs a declared public API surface for the V3 leak)
```
src/modules/safety/
├── safety.module.ts
├── domain/index.ts                # NEW: declared public surface re-exporting SAFETY_QUESTIONS, SAFETY_COPY, SQ02_TRIGGER_CODES, Sq0*Code, BilingualEntry, SafetyRoute, ClassifierDomainScore (V3)
├── controllers/safety.controller.ts
├── services/{safety,safety-reentry,safety-deletion}.service.ts
├── domain/{safety-definition,safety-classifier,safety-route}.ts
├── dto/safety.dto.ts
├── errors/safety.errors.ts
└── ports/safety-deletion.port.ts
```

---

## 14. Move / Split / Leave / Boundary-later classification

**A = Move only · B = Split · C = Leave unchanged · D = Boundary issue — later phase (do NOT implement now)**

### ai
- **A (Move):** 4 conversation-AI unit test files → `tests/unit/ai/...`; flatten `prompt-templates/` to `ai/coaching/prompt-templates.ts` (or to `coaching/`).
- **B (Split):** `coaching-llm.adapter.ts` → adapter + `coaching-plan.schema.ts`; `conversation-llm.adapter.ts` → adapter + `conversation-llm.schemas.ts` + shared `llm-provider.factory.ts`; `ollama-conversation-llm.provider.ts` → provider + `ollama-cloud.instructions.ts`.
- **C (Leave):** `conversation-llm.errors.ts`, `conversation-llm-response.ts`, `conversation-json-schema-validator.ts`, `conversation-llm-provider.ts`, `conversation-ai.port.ts`, both fakes, `openai-conversation-llm.provider.ts`.
- **D (Boundary — later):** `AiModule` does not export `CONVERSATION_AI_PORT` (V5); `coaching` deep-imports `COACHING_PLAN_PROMPT_TEMPLATE` (V4); `ai.config.ts` dead code; `normalizeConversationLlmError` message-text classification; hand-rolled JSON-Schema validator.

### assessment
- **A (Move):** into `controllers/services/dto/domain/utils/ports` folders (cosmetic, low value while flat is acceptable).
- **B (Split):** `assessment-lifecycle.service.ts` → + `assessment-onboarding-coordinator.ts` (shared) + optional `assessment-cross-validation.ts`; `assessment-submit.service.ts` → consume shared coordinator + optional insight-assembler.
- **C (Leave):** `scoring.service.ts`, `assessment-definition.ts`, `assessment-result-mapping.ts`, `result-presenter.ts`, `assessment-definition-view.ts`, `assessment-answer-store.service.ts`, `assessment-result.service.ts`, `assessment-deletion.service.ts`, `assessment.dto.ts`, `assessment.errors.ts`, `ports/*`, controller, module.
- **D (Boundary — later):** `JwtPayload` from `auth/tokens/` (V1); `safety-definition`/`safety-classifier` internals (V3); duplicate `BilingualEntry`; `DOMAIN_ENUM` vs `DomainCode`; `AssessmentResultService` exported concrete (optional `ASSESSMENT_RESULT_PORT`); optional `SafetyEvaluationPort`; split persistence ownership.

### auth
- **A (Move):** none required (already idiomatic).
- **B (Split):** none required. Optional: `VerificationService` out of `auth.service.ts` (defer).
- **C (Leave):** everything except the public-barrel addition.
- **D (Boundary — later):** `JwtPayload` not surfaced (V1); guards not exported (V2); dead `sameHash`; duplicated `errName`; optional repository layer.

### coaching
- **A (Move):** `coaching.dto.ts` → `dto/`; `coaching.errors.ts` → `errors/`; `coaching-plan-mapping.ts` → `mapping/`; `coaching-plan-validator.ts` → `validators/`; `coaching-library.ts` + `coaching-disclaimer.ts` → `content/`; all services → `services/`; `coaching-lifecycle.ts` → `utils/` or fold.
- **B (Split):** `coaching-generation.service.ts` → + `coaching-generation-mapping.ts` (pure, LOW risk); `coaching-grounding.service.ts` → + `coaching-grounding-evidence.ts`; `ports/coaching-llm.port.ts` → slim port + move `GroundingBundle`/`LlmPlanOutput` to `dto/`.
- **C (Leave):** `coaching.controller.ts`, `coaching.module.ts`, `rag/rag-client.service.ts`, `ports/coaching-deletion.port.ts`.
- **D (Boundary — later):** `normalizeConversationLlmError` import (V4); `COACHING_PLAN_PROMPT_TEMPLATE` ownership (V4); `ResultNotFoundException` reuse (V7); direct service imports (V8); `RagRetrievalRequest` vs impl drift; `CoachingDeletionService.deleteExpired` no-op stub; `Db` type-alias workaround; `inFlight` single-instance; inconsistent canonical-JSON integrity.

### profile
- **A (Move):** `onboarding.guard.ts` + `onboarding.service.ts` into `onboarding/` (cosmetic).
- **B (Split):** `profile.service.ts` — **not yet** (266; hold until ~300).
- **C (Leave):** `profile.controller.ts`, `profile.dto.ts`, `profile.module.ts`, `profile-deletion.service.ts`, `ports/*`, `timezone.util.ts`.
- **D (Boundary — later):** none. All boundaries correctly oriented (`OnboardingGuardService` abstract export is GOOD; deletion port is GOOD).

### retention
- **A (Move):** none.
- **B (Split):** none (484 total; no file >300).
- **C (Leave):** all 4 files.
- **D (Boundary — later):** `DeletionLog.findMany` → indexed query (perf); misleading `run<C>()` JSDoc; `unknown as object` casts; optional `scheduledCutoffs()` unit test.

### safety
- **A (Move):** `safety-deletion.service.ts` → `services/`; dedup `errName` → import from `safety.errors.ts`.
- **B (Split):** `safety.service.ts` → optionally + `safety-evaluation.repository.ts` + `safety-routing.service.ts` (not required now; before it grows).
- **C (Leave):** `safety-classifier.ts`, `safety-definition.ts`, `safety-route.ts`, `safety.dto.ts`, `safety.errors.ts`, `safety.controller.ts`, `safety-reentry.service.ts`, `ports/*`, module.
- **D (Boundary — later):** the `safety-definition`/`safety-classifier` internal-as-public leak (V3) — introduce `domain/index.ts` barrel and re-point assessment/conversations; `ClassifierDomainScore` leak to assessment (SafetyService should accept assessment's own shape and adapt); cross-module Prisma writes to `Assessment`/`OnboardingState` (V9) — consider ports; no DTO validation pipeline.

---

## 15. Structural cleanup priority ranking

Ranked by (boundary risk × responsibility mixing × test risk × dependency complexity × centrality). Boundary issues (D) are later-phase and excluded from the *structural* ranking, but flagged where they raise a module's priority.

| Rank | Module | Priority | Rationale |
|---|---|---|---|
| 1 | **safety** | **HIGH** | Biggest internal-as-public leak (V3) spanning 3+ modules; safety-critical versioned copy reached as bare `export const`; `SafetyService` (257) mixes orchestration + persistence + cross-module state writes; no declared public API surface. Centrality high (consumed by assessment, coaching, conversations, retention). |
| 2 | **ai** | **HIGH** | `AiModule` is not the boundary for conversation-AI (V5) — half library, half sibling folder; bidirectional file coupling with conversations (V6); coaching imports AI conversation internals (V4); 4 test files mislocated; dead config; self-contradicting error normalizer. Centrality high (consumed by coaching + conversations). |
| 3 | **coaching** | **MEDIUM-HIGH** | Flat layout (most files to move); content assets mixed with code; `coaching-generation.service.ts` mixed (mapping extractable); `CoachingDeletionService.deleteExpired` no-op stub; RAG request/impl drift. Boundary imports (V4, V7) raise priority. |
| 4 | **assessment** | **MEDIUM** | Two near-300 orchestrators with verbatim helper duplication (clean DRY win); split persistence ownership; dual source of truth (`DOMAIN_ENUM`/`DomainCode`); triplicated `BilingualEntry`. Boundary: reaches safety internals (V3) + auth `JwtPayload` (V1). Centrality high (consumed by coaching, retention). |
| 5 | **auth** | **MEDIUM** | Already idiomatic layout; the only real work is formalizing the public surface (V1 `JwtPayload`, V2 guards) — a barrel + re-exports. Low risk, high blast-radius benefit (6 consumers). |
| 6 | **profile** | **LOW** | Clean boundaries (GOOD); only `profile.service.ts` approaching 300 (not yet); no violations. Mostly test-coverage and minor dedup. |
| 7 | **retention** | **LOW** | Clean port-only orchestration (the model pattern); 484 lines total; no structural action. Perf/doc nits are later-phase. |

---

## 16. Recommended execution order

Derived from the priority ranking, applying the rule **each module refactored + validated independently before the next**, and **do NOT implement category D (boundary) in this phase**. The structural phase is A (move) + B (split) only; D items are listed for a later, separately-scoped boundary-hardening phase.

**Phase 1 — Structural standardization (A + B only, per module, independent):**

1. **auth** — *first, lowest risk, unblocks others.* Add the public barrel (`auth.public.ts` or `public/index.ts`), re-export `JwtPayload` + guards + `ConsentService` + deletion port. Re-export guards from `AuthCoreModule`. **Do not** change consumer import paths yet (that is a cross-module change — see Phase 2 sequencing). Validate: `auth.contract.spec.ts`, `consent.contract.spec.ts`, `email-and-token.spec.ts`, `consent-versions.spec.ts`. Risk: LOW (additive). No file >300 touched.

2. **safety** — add `domain/index.ts` public barrel re-exporting the symbols assessment/conversations already import (`SAFETY_QUESTIONS`, `SAFETY_COPY`, `SQ02_TRIGGER_CODES`, `Sq0*Code`, `BilingualEntry`, `SafetyRoute`, `ClassifierDomainScore`); move `safety-deletion.service.ts` to `services/`; dedup `errName`. **Do not** re-point assessment/conversations imports in this step (cross-module — Phase 2). Optional B-split of `safety.service.ts` is deferred until it approaches 300. Validate: `safety.contract.spec.ts`, `safety-classifier.spec.ts`, `redact.spec.ts`, `safety-routing.spec.ts`, `redaction-audit.spec.ts`. Risk: LOW-MEDIUM.

3. **ai** — relocate the 4 conversation-AI test files to `tests/unit/ai/`; split schemas out of the two adapters into `*.schemas.ts`; extract the shared `llm-provider.factory.ts`; flatten `prompt-templates/`; delete dead `ai.config.ts`/`readAiConfig` and unused `sameHash`. **Do not** make `AiModule` export `CONVERSATION_AI_PORT` or re-wire conversations (D — Phase 2). Validate: the relocated AI unit tests + `coaching-llm.adapter.spec.ts` + the full conversations e2e (which exercise `CONVERSATION_AI_PORT`). Risk: MEDIUM (the failure-retry/redaction e2e assert exact failure codes).

4. **coaching** — folder reorganization (services/dto/content/mapping/validators/utils/ports); split `coaching-generation.service.ts` → `+ coaching-generation-mapping.ts`; split `coaching-grounding.service.ts` → `+ coaching-grounding-evidence.ts`; slim `coaching-llm.port.ts` (move `GroundingBundle`/`LlmPlanOutput` to `dto/`); fold/keep `coaching-lifecycle.ts`. **Do not** touch `normalizeConversationLlmError` / `COACHING_PLAN_PROMPT_TEMPLATE` imports (D — Phase 2). Validate: `coaching.contract.spec.ts`, `coaching-rag-boundary.contract.spec.ts`, `coaching-plan.spec.ts`, `coaching-rag-plan.e2e-spec.ts`, all coaching unit specs. Risk: MEDIUM (integrity-hash verification, generation transaction).

5. **assessment** — extract shared `assessment-onboarding-coordinator.ts` (removes verbatim duplication between lifecycle & submit, shrinks both); optional `assessment-cross-validation.ts`. Defer folder move (flat is acceptable; only do it if the team wants full consistency). Validate: `assessment.contract.spec.ts`, `assessment-submit-idempotency.spec.ts`, `scoring.spec.ts`, `result-presenter.spec.ts`. Risk: MEDIUM (corrupt-progress re-anchoring, SAFETY_HOLD ordering, idempotent submit race).

6. **profile** — no structural action this phase (clean). Optionally move `onboarding.guard.ts` + `onboarding.service.ts` into `onboarding/` for discoverability. Validate: `profile-onboarding.contract.spec.ts`, `profile-validation.spec.ts`, `onboarding-guard.spec.ts`. Risk: LOW.

7. **retention** — no action this phase. Validate: `account-deletion.spec.ts`, `retention-cleanup.spec.ts`. Risk: none.

**Phase 2 — Boundary hardening (D items; separately scoped; NOT part of this structural audit):** re-point consumers to the new barrels (auth public surface, safety `domain/index.ts`), make `AiModule` export `CONVERSATION_AI_PORT` and have conversations import `AiModule`, invert `COACHING_PLAN_PROMPT_TEMPLATE` ownership, introduce `SafetyEvaluationPort`/`ASSESSMENT_RESULT_PORT` if desired, resolve cross-module Prisma writes via ports. Each D item must be validated across all affected modules.

**Sequencing rationale:** auth → safety → ai before coaching/assessment because the barrels created in steps 1-2 are what coaching/assessment will later import in Phase 2; creating them first (without re-pointing consumers yet) is non-breaking. ai before coaching because coaching's Phase-2 decoupling depends on ai's surface. assessment before profile/retention because assessment is higher-centrality. Each step is independently validatable (run that module's tests + the build + lint after each).

---

## 17. Current validation baseline

Captured before any changes (this audit changed nothing). All commands run from `02-BACKEND`.

| Check | Command | Result |
|---|---|---|
| Build | `npx nest build` | **OK** (exit 0) |
| Typecheck | `tsc --noEmit -p tsconfig.build.json` | 0 errors |
| Lint (full) | `eslint .` | **exit 1** — 1 pre-existing error: `src/modules/ai/ollama-conversation-llm.provider.ts:71` "Unnecessary try/catch wrapper (`no-useless-catch`)" |
| Unit + Contract | `npx vitest run` | **333 passed / 3 failed / 338 total** (1 file failed). Pre-existing failures all in `tests/unit/coaching-grounding.spec.ts`: (a) `looks up pinned snapshots by exact version and no active flag`, (b) `fails closed when the library snapshot is missing`, (c) `fails closed when the disclaimer snapshot is missing or corrupt`. |
| E2E + Integration | `npx vitest run --config vitest.config.e2e.ts` | **77 passed / 77 total** (21 files, all green). (A first run showed a transient 1-file/1-test flake that passed on re-run.) |

**Pre-existing issues (do NOT fix during the structural phase):**
1. `tests/unit/coaching-grounding.spec.ts` — 3 failures (coaching library/disclaimer snapshot lookups; environmental/fixture-related; zero conversations references).
2. `src/modules/ai/ollama-conversation-llm.provider.ts:71` — ESLint `no-useless-catch` (file already staged-modified at session start).

Both are out of scope for the structural standardization and must be reported separately, not fixed, per the audit constraints.

---

## 18. High-risk regression areas

The load-bearing surfaces most likely to regress if a structural phase is executed. Listed per module in priority order.

**Cross-cutting (apply to every step):**
- `CONVERSATION_AI_PORT` wiring + exact LLM failure codes (`LLM_TIMEOUT`, `LLM_UNAVAILABLE`, `LLM_RATE_LIMITED`, `LLM_INVALID_OUTPUT`, `LLM_UNSUPPORTED_CITATION`) and `LlmRequestDiagnostics` shape — asserted by `conversation-failure-retry.e2e-spec.ts`, `conversation-redaction-audit.e2e-spec.ts`, `conversation-llm-failures.spec.ts`. Any AI-adapter split or re-wiring must keep these green.
- `JwtPayload` shape — every guarded controller casts `req.user`; relocating the type must keep a re-export at the old path during transition or update all 6+ consumers atomically.
- Deletion-port tokens (`AUTH/PROFILE/ASSESSMENT/COACHING/SAFETY_DELETION_PORT`) — retention e2e injects failure via these tokens; any port/provider move must keep `useExisting` bindings intact.

**safety:**
- Append-only `persistEvaluation` `$transaction` (`safety.service.ts`, FR-031 `isCurrent` flip) — must move intact if extracted to a repository.
- Fail-closed catch blocks → `SafetyUnavailableException`; `errName` must stay coarse (FR-030, no answers/reasons in logs).
- `ClassifierDomainScore` shape contract with assessment — any adaptation layer must map `score` exactly or the distress pattern silently disables.
- `SAFETY_COPY`/`SAFETY_QUESTIONS` version — a partial barrel migration (some consumers on bare `export const`, others on barrel) risks divergent versions of safety-critical copy.

**ai:**
- `conversation-ollama-cloud-provider.spec.ts` (269) + `conversation-llm-adapter.spec.ts` (214) — high coverage of Ollama cloud path, abort/timeout, provider-error detection; any split must keep them green.
- Two fakes for `ConversationAiPort` (`ai/fake-conversation-ai.adapter.ts`, `tests/helpers/fake-conversation-llm.ts`) — wiring changes must reconcile both or tests may silently use a stale double.
- `COACHING_PLAN_PROMPT_TEMPLATE.version` persisted as `promptVersion` on `coachingPlan` rows — relocation must not change the version string or persisted comparisons break.

**coaching:**
- Generation transaction (`coaching-generation.service.ts` `run` → `db.$transaction`): `coachingPlan.updateMany` guard + focus-area/goal/action-step creation + `coachingPlanGeneration.update`; the `updated.count === 1` early-return guard is load-bearing.
- Integrity verification chain (`coaching-grounding.service.ts`): stored row integrity vs re-computed integrity; moving content files / sharing canonical-JSON must preserve the exact canonical form or all stored rows fail verification.
- `normalizeConversationLlmError` call (`coaching-generation.service.ts`) — error-code strings asserted via `errorCode` on `coachingPlanGeneration` in contract/e2e.
- `inFlight` map + `waitForIdle` — `start`/`run` must keep the AbortController lifecycle on the same service instance; splitting across services risks orphaned controllers.
- `coaching-action.service.ts` optimistic-concurrency `where` clause — conditional `expected_version` inclusion must survive any mapper move.

**assessment:**
- Lifecycle corrupt-progress branch (NOT_STARTED silent re-anchor vs IN_PROGRESS `requires_safe_restart`) — FR-034/SC-007; any onboarding-coordinator extraction must not disturb it.
- Idempotent submit race (`assessment-submit.service.ts` `updateMany` conditional transition + post-race result lookup) — the e2e idempotency test is the regression net.
- SAFETY_HOLD save/submit suppression — throw ordering relative to answer persistence.
- `ZodError` propagation — `crossValidate` and schema parse must keep throwing real `ZodError` instances (FR-037 field paths), not custom errors.
- `goalFreeTextInput` `Prisma.JsonNull` vs JS `null` semantics in the mapping helper.
- Per-answer vs on-submit safety ordering (`evaluatePerAnswer` after persist; `evaluateOnSubmit` before result create) — FR-019a/b.

**profile:**
- `OnboardingGuardServiceImpl` rules + `nextStep` — consumed by assessment/coaching/safety; a rule change ripples to 3 modules' route gating.
- `transitionTo` no-op-on-reresave (FR-034) — must not clobber `ASSESSMENT_PENDING`/`COMPLETED`/`SAFETY_HOLD`.
- `getOnboardingCompletion` fail-closed (missing row → `completed:false`) — must never return `completed:true` for a missing row.
- `ProfileDeletionService.deleteExpired` state filter — must exclude `COMPLETED`; including it deletes completion records (US9/FR-018a).
- `safeConsentStatus` fail-closed default (`requires_reconsent:true` on error) — flipping it lets consent errors silently bypass re-consent.

**auth:**
- `verifyEmail` `$transaction` + `issueAccessAndRefresh` shared helper — any `VerificationService` split must keep the helper reachable by `login`/`refresh`.
- `AuthDeletionService` 2-step pre-consent loop (InMemoryPrisma workaround) — must not be "optimized" into a nested filter the test double can't run.
- Anti-enumeration + hashed-token invariants in `AuthService`.

**retention:**
- `deletedAt` set before any data deletion (Consent §9 "block new processing on acceptance") — reordering breaks the login-rejection test.
- Account row hard-delete only when all categories `errors===0` — moving/loosening the `deleteAccountForUsers` condition leaks identity while domain rows persist.
- `DeletionLog.confirmationId` window dedup key shape — changing it allows double-deletion runs or blocks legitimate re-runs.
- Per-category try-catch isolation — a category throw must not abort sibling categories.
- Sanitized logging only (`toSafeLogContext`, integer counters) — any refactor passing raw counts/entities into logs violates FR-030/research D7.

---

## End of audit

This audit is **read-only and structural**. No code was modified, no files moved or renamed, no refactoring performed, no implementation tasks generated, no boundary issues fixed, no tests reorganized, and no pre-existing failures fixed. The two pre-existing failures (3 `coaching-grounding` unit tests, 1 `no-useless-catch` lint error) and the boundary violations (category D) are documented for a **separately-scoped** later phase.

Per the task instructions, work stops here for review. The recommended next step — *only after review* — is to execute Phase 1 (structural standardization, A + B only) module-by-module in the order of §16, validating each module independently before proceeding to the next, and explicitly **not** implementing any category D boundary fix until a dedicated boundary-hardening phase is scoped.