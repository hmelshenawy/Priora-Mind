# Backend Boundary Hardening Audit

**Date:** 2026-08-09  
**Scope:** `02-BACKEND/src/modules/**`  
**Mode:** architecture audit only; no implementation, API, schema, prompt, scoring, threshold, or behavior changes

## Executive summary

The backend is structurally organized, but its NestJS module boundaries are not yet consistently enforced. The highest-value hardening is small and conventional: make Auth, Safety, Assessment, and AI expose intentional public capabilities through their modules; make consumers import modules and inject only those public capabilities; centralize the duplicated backend RAG clients behind one Retrieval module; and route Profile/Assessment state transitions through their owners.

No general port layer is warranted. Existing provider ports and Retention deletion ports remain justified. The only new infrastructure abstraction worth considering is a retrieval client contract inside a Retrieval module because it isolates an external HTTP provider and supports two consumers. Safety, Assessment results, Auth guards, consent, and onboarding are better expressed as exported services/types.

The current source graph has two notable source-level reverse dependencies:

- `Coaching -> AI` at module/runtime level, while `AI -> Coaching` owns and imports `COACHING_LLM_PORT` and its request/result types.
- `Conversations -> AI` at runtime, while `AI -> Conversations` imports `ConversationRagChunk`.

There is no observed Nest `forwardRef()` cycle, but the first relationship is a genuine module/source ownership inversion and the second is a reverse type dependency. Conversations also instantiates an AI concrete adapter in its own module instead of importing `AiModule`.

## 1. Current module public surfaces

“Consumed” below means production code under another module, not tests.

| Module | Module imports | Internal providers | Exports | Exported symbols actually consumed | Classification |
|---|---|---|---|---|---|
| AI | None (but imports Coaching symbols in source) | `CoachingLlmAdapter`; token alias | `COACHING_LLM_PORT` | Coaching injects the token | **INCONSISTENT** — exports Coaching-owned token, omits Conversation AI capability, while Conversations registers AI implementation itself |
| Assessment | Auth, Profile, Safety | scoring, answer store, onboarding, lifecycle, result, submit, deletion; deletion alias | `ASSESSMENT_DELETION_PORT`, `AssessmentResultService` | Retention consumes deletion port; Coaching consumes result service | **CLEAR**, with deep-path consumption and cross-owner writes still to fix |
| AuthCore | Passport, Jwt, Config | JWT strategy/token/cookie services | framework modules and token primitives | No feature module consumes these exports directly; root and Auth import the module | **TOO BROAD** for a public domain surface; primarily framework composition |
| Auth | AuthCore | auth, consent, email adapters, deletion; token aliases | `AuthService`, `ConsentService`, `AuthDeletionService`, deletion token, email token | Profile/Assessment/Safety/Coaching consume consent; Retention consumes deletion token | **TOO BROAD** — concrete deletion service and email token are not cross-module needs; guards and `JwtPayload` are used but not represented as intentional public exports |
| Profile | Auth | profile, deletion, onboarding implementation; token aliases | `OnboardingGuardService`, concrete deletion service, deletion token | Assessment/Safety/Coaching consume onboarding; Retention consumes deletion token | **TOO SMALL / TOO BROAD** — lacks a public state-transition capability while exporting unused concrete deletion service |
| Safety | Auth, Profile | safety, re-entry, deletion; deletion alias | `SafetyService`, `SAFETY_DELETION_PORT` | Assessment/Coaching use service; Retention uses deletion port | **TOO SMALL** — callers also reach into constants, DTOs, classifier types; Conversations does not import the module at all |
| Coaching | AI, Assessment, Auth, Profile, Safety | eligibility, grounding, generation, plan, action, deletion, RAG client; token aliases | deletion token and concrete deletion service | Retention consumes only deletion token | **TOO BROAD** — concrete deletion export is unused; LLM contract is paradoxically owned here but implemented/exported by AI |
| Conversations | Prisma only | repositories, orchestration services/utilities, local RAG client, AI adapter and aliases | two repositories, lifecycle, message service | No production module consumes these exports | **TOO BROAD** — exports internals without consumers and bypasses `AiModule`/`SafetyModule` |
| Retention | Auth, Profile, Assessment, Coaching, Safety | scheduled retention and account deletion orchestrators | both orchestrators | No production cross-module consumers | **TOO BROAD** unless root-level programmatic invocation is required; controllers/cron need no exports |

## 2. Current cross-module dependency inventory

Repeated imports from the same owner/path family are grouped, but every production cross-module symbol family is represented.

| Consumer | Owner | Imported symbol(s) | Current path(s) | Symbol type | Quality |
|---|---|---|---|---|---|
| AI | Coaching | `COACHING_LLM_PORT`, `CoachingLlmPort`, `GroundingBundle`, `LlmPlanOutput`, `LlmPlanResult` | `../coaching/ports/coaching-llm.port` | port/token + types | **VIOLATION** — provider module depends on consumer module and creates reverse dependency |
| AI | Conversations | `ConversationRagChunk` | `../conversations/rag/conversation-rag-client.port` | infrastructure DTO/type | **LEAK** — AI contract depends on consumer-owned retrieval type |
| Assessment | Auth | `AuthModule`, `ConsentService`, guards, `JwtPayload` | module plus `auth/...` deep paths | module, service, guards, type | **ACCEPTABLE** capability; **LEAK** paths/public surface |
| Assessment | Profile | `ProfileModule`, `OnboardingGuardService`, context | module plus `profile/onboarding.guard` | service + types | **GOOD** abstract service pattern; **LEAK** path and missing transition capability |
| Assessment | Safety | `SafetyModule`, `SafetyService` | module plus `safety/services/...` | public service | **GOOD** relationship; **LEAK** import path |
| Assessment | Safety | questions, trigger codes, answer code types, `SAFETY_COPY`, `BilingualEntry`, `SafetyRoute` | `safety/constants`, `safety/dto` | constants + DTO/types | **LEAK** — broad internal knowledge |
| Assessment | Safety | `ClassifierDomainScore` | `safety/utils/safety-classifier` | internal classifier type | **VIOLATION** — consumer reaches into an implementation utility |
| Coaching | AI | `AiModule`, `normalizeConversationLlmError`, prompt template | module, `ai/utils`, `ai/prompt-templates` | module, helper, constant | **LEAK**; prompt ownership is ambiguous |
| Coaching | Assessment | `AssessmentModule`, `AssessmentResultService`, `ScoredResultDto`, `ResultNotFoundException` | module plus `assessment/services`, `dto`, `constants` | service, DTO/type, error | **ACCEPTABLE** capability; **LEAK** paths/errors/DTO |
| Coaching | Auth | `AuthModule`, `ConsentService`, guards, `JwtPayload` | module plus deep paths | module, service, guards, type | **ACCEPTABLE** capability; **LEAK** paths |
| Coaching | Profile | `ProfileModule`, onboarding service/context | module plus deep path | service + types | **GOOD** capability; **LEAK** path |
| Coaching | Safety | `SafetyModule`, `SafetyService` | module plus service deep path | service | **GOOD** relationship; **LEAK** path |
| Conversations | AI | AI port/token and request/result types | `ai/ports/conversation-ai.port` | port/token + types | **ACCEPTABLE** external-provider abstraction |
| Conversations | AI | `ConversationLlmAdapter` | `ai/services/conversation-llm.adapter` | provider implementation | **VIOLATION** — concrete implementation registered outside owner module |
| Conversations | AI | `normalizeConversationLlmError` from adapter | `ai/services/conversation-llm.adapter` | implementation helper | **VIOLATION** |
| Conversations | Auth | guards, `JwtPayload` | `auth/guards`, `auth/tokens` | guards + type | **ACCEPTABLE** concepts; **LEAK** paths/public surface |
| Conversations | Safety | `SAFETY_COPY`, `SafetyLevel` | `safety/constants/safety-definition` | constant + type | **VIOLATION** — duplicates classifier and bypasses Safety module/service |
| Profile | Auth | `AuthModule`, `ConsentService`, guards, `JwtPayload` | module plus deep paths | module, service, guards, type | **ACCEPTABLE** capability; **LEAK** paths |
| Safety | Auth | `AuthModule`, `ConsentService`, guards, `JwtPayload` | module plus deep paths | module, service, guards, type | **ACCEPTABLE** capability; **LEAK** paths |
| Safety | Profile | `ProfileModule`, onboarding service/context | module plus deep path | service + types | **GOOD** capability; direct state writes remain a data violation |
| Retention | Auth/Profile/Assessment/Coaching/Safety | each deletion token and interface | each module's `ports/*` | deletion ports/tokens | **GOOD** and justified |
| Retention | Auth | guards, `JwtPayload` | auth internals | guards + type | **ACCEPTABLE** concepts; **LEAK** paths |
| Retention | Prisma/Auth data | `userAccount` read/update | direct Prisma | cross-domain data access | **VIOLATION** |

## 3. Deep-import violations

| Finding | Why currently needed | Correct owner/API | Decision |
|---|---|---|---|
| Consumers import Auth guards and `JwtPayload` from internal files | Controller protection and typed request user | Auth owns them; expose intentional public entry points or a small `auth/public.ts` barrel | Exported guards/types; **no port** |
| Four modules import `ConsentService` directly by file | Consent gating | Auth owns stable consent capability | Exported `ConsentService`; **no port** |
| Assessment imports Safety constants, copy, DTO, classifier score type | Builds assessment definition/responses and calls safety | Safety should provide evaluation/routing/copy through `SafetyService`; only stable answer/route contract types should be public if unavoidable | Prefer service hiding; public types only where DTO composition requires; **no port** |
| Coaching imports Assessment DTO and exception | Eligibility/generation consumes result | `AssessmentResultService` should return a public result view and own not-found semantics | Export service + public result type; consumer should not import Assessment error; **no port** |
| Coaching imports AI error normalizer and prompt constant | Maps provider failure and builds prompt bundle | AI should own provider error normalization; prompt assembly should have one owner | AI public contract/service; do not expose utility. Prompt template stays with the orchestration owner selected in Step 4 |
| Conversations imports AI adapter and helper | Registers provider and maps errors | `AiModule` must register/export token; error normalization belongs behind adapter/contract | Import `AiModule`, inject token; **keep provider port** |
| Conversations imports Safety definition | Uses copy/type while running its own keyword classifier | Safety owns classification and approved responses | Import `SafetyModule`, call a public conversation-safety method on `SafetyService`; **no port** |
| AI imports Coaching port/types and Conversations RAG type | Implements provider contracts | AI should own provider-neutral LLM contracts; Retrieval should own retrieved-chunk type | Move contract ownership, not behavior; **ports justified for providers** |

No cross-module imports of another module's `providers/` folder were found. The concrete AI `services/ConversationLlmAdapter` import is equivalent implementation leakage and is more serious because it is registered by the consumer.

## 4. Public Service vs Port decisions

| Relationship | Choice | Reason |
|---|---|---|
| Assessment/Coaching/Conversations -> Auth consent/guards | **A — exported public service/guard/type** | One implementation; stable application capability; normal Nest exports suffice |
| Assessment/Coaching -> Profile onboarding guard | **A — exported abstract service** | Current abstract class is already a useful DI contract; do not add a symbol port |
| Assessment/Safety -> Profile state transitions | **A — narrow public capability service** | Profile owns data and there is one implementation; methods such as guarded transition are sufficient |
| Assessment/Coaching/Conversations -> Safety | **A — `SafetyService`** | One deterministic implementation and stable safety capability; service should hide classifier/copy internals |
| Coaching -> Assessment results | **A — `AssessmentResultService`** | One stable domain capability; return a deliberately public result view |
| Coaching/Conversations -> AI provider behavior | **B — port/interface/token** | External provider substitution, fake providers, and stable failure contract justify inversion |
| Coaching/Conversations -> Retrieval | **B — port inside Retrieval module**, or public service wrapping that port | External HTTP infrastructure and test substitution justify one internal port; consumers should inject an exported `RetrievalService` unless direct port injection is materially simpler |
| Retention -> domain deletion | **B — existing ports** | Retention must not know domain persistence or cascading details; capability isolation and failure testing justify ports |

## 5. Data ownership audit

| Writer/reader | Foreign data | Classification | Simplest replacement |
|---|---|---|---|
| Assessment lifecycle/onboarding/submit | Profile-owned `OnboardingState` read/write | **Ownership violation** | Add narrow methods to Profile onboarding capability for context and allowed transitions; keep Assessment state writes in Assessment |
| Safety service | Profile-owned `OnboardingState` read/write | **Ownership violation** | Use Profile onboarding transition/query capability |
| Safety service/re-entry | Assessment-owned `Assessment` read/write | **Ownership violation** | Export a narrow Assessment interruption/resume capability service. A port is unnecessary unless importing Assessment would create a real cycle after Profile writes are removed; if it would, use a narrowly owned transition port as the exceptional cycle-breaking option |
| Safety deletion | Reads Assessment rows to derive expired IDs | **Questionable** | Retention supplies eligible user IDs/cutoffs, or Assessment exposes sanitized deletion candidates. Avoid Safety learning Assessment persistence shape |
| Coaching eligibility/generation/grounding/action/plan | Coaching tables plus public Assessment service; observed Prisma is domain-local | **Acceptable shared infrastructure** | Leave domain-local Prisma access unchanged |
| Retention account deletion | Auth-owned `UserAccount` read/update | **Ownership violation** | Add Auth deletion lifecycle methods (accept/block/check) to existing Auth deletion capability; Retention continues orchestrating |
| Retention services | Retention-owned `DeletionLog` | **Acceptable shared infrastructure** | Leave unchanged |
| Auth consent | Auth-owned `UserAccount` status update | **Acceptable within Auth bounded module** | Leave unchanged |
| Conversations | Conversation tables only | **Acceptable shared infrastructure** | Leave unchanged |

Do not add cross-module repositories. Public domain capability methods are the default correction.

## 6. Shared type ownership

| Type | Decision |
|---|---|
| `JwtPayload` | Part of Auth public API. Keep Auth-owned; expose via an intentional public entry point, not token implementation path |
| `SafetyRoute` | Public Safety API because Assessment response contracts embed it; expose from Safety public contract |
| safety answer codes (`Sq01Code`, etc.) | Public Safety contract only if Assessment must collect the canonical codes; otherwise hide through Safety validation methods |
| safety copy / `BilingualEntry` | Keep internal; callers should ask Safety for a response/route rather than assemble copy |
| `ClassifierDomainScore` | Remove from consumer knowledge. `SafetyService.evaluateOnSubmit` should accept an owner-neutral score input shape or a Safety-owned public input contract; never import classifier utility types |
| `ScoredResultDto` | Rename/shape as an Assessment-owned public result view returned by `AssessmentResultService`; do not move to a global shared package unless frontend/API packages also genuinely consume the identical semantic contract |
| `ConversationRagChunk` | Retrieval-owned public result type; AI may accept a minimal grounded chunk type owned by AI or a neutral Retrieval contract, not Conversations |
| `GroundingBundle`, `LlmPlanOutput`, `LlmPlanResult` | AI provider contract types. They should not live in Coaching if AI implements the contract |
| `OnboardingGuardContext` | Profile public API while consumers assemble it; preferably disappear from consumers once Profile can build/query its own state context |

No large neutral shared-type package is recommended. Most leakage should disappear behind services.

## 7. AI boundary findings

1. `AiModule` currently exposes only `COACHING_LLM_PORT`, a token defined by Coaching. This reverses ownership and produces `AI -> Coaching -> AI` at source/module level.
2. Conversations does not import `AiModule`; it imports and registers `ConversationLlmAdapter` itself. AI provider selection and lifecycle therefore leak into Conversations.
3. AI's `conversation-ai.port.ts` imports a Conversations-owned RAG chunk type, creating `AI -> Conversations` while Conversations imports AI.
4. Coaching imports the AI internal error normalizer. Conversations imports that normalizer from the concrete adapter file.
5. Coaching imports `COACHING_PLAN_PROMPT_TEMPLATE` from AI while also owning grounding bundle construction. Prompt ownership is split.

Minimal architecture:

```text
CoachingModule ------> AiModule ------> external LLM providers
ConversationsModule -> AiModule ------> external LLM providers
                         exports provider ports/tokens
                         owns provider-neutral contracts and error mapping
```

`AiModule` should register and export both coaching and conversation tokens. Consumers should not import providers, adapters, schema validators, or error-normalization helpers. Preserve ports because provider abstraction is genuine. Pick one prompt owner per flow: AI if the template is provider execution policy; Coaching if it is domain plan composition. The current use favors Coaching ownership for the coaching plan prompt, passed as provider input, while AI retains provider formatting/schema validation.

## 8. Safety boundary findings

- Assessment correctly imports `SafetyModule` and consumes `SafetyService`, but also imports Safety constants, DTOs, copy, and classifier internals.
- Coaching correctly imports `SafetyModule` and calls `SafetyService`, though through a deep service path.
- Conversations neither imports `SafetyModule` nor calls `SafetyService`. It implements a separate English keyword classifier and reads `SAFETY_COPY` directly. This is the most safety-sensitive boundary violation because policy and copy can drift.
- Safety mutates Profile onboarding and Assessment lifecycle tables directly to avoid a cycle. Avoiding a cycle is valid; bypassing ownership is not the preferred steady state.

Smallest public Safety API: exported `SafetyService` plus narrowly public evaluation input/result and route types. Add a conversation-text evaluation method only if the existing product-approved deterministic behavior can be preserved exactly. Do not expose classifier helpers or raw definition constants. No Safety port is justified with one deterministic implementation.

## 9. RAG / retrieval ownership

Two HTTP integrations exist:

- `coaching/rag/rag-client.service.ts`
- `conversations/rag/conversation-rag-client.{port,service}.ts`

They target the same backend RAG infrastructure but own different request/result shapes, error normalization, configuration, and test seams. This duplicates an infrastructure boundary and causes AI to depend on a Conversations RAG type.

Create one backend `RetrievalModule` owning HTTP configuration, authentication, timeout/error normalization, and canonical retrieved-chunk metadata. It should expose a public `RetrievalService`; internally it may use a `RETRIEVAL_CLIENT_PORT` because the external provider and test substitution justify it. Coaching and Conversations may retain small domain request mappers, thresholds, selection logic, and product-specific grounding policy. Do not move thresholds or change retrieval behavior during boundary hardening.

```text
Coaching ------> RetrievalModule <------ Conversations
                    |
                    v
               RAG HTTP service
```

## 10. Auth boundary findings

The intended public Auth surface is:

- `ConsentService` (stable consent capability)
- `JwtAuthGuard`
- `EmailVerifiedGuard`
- `JwtPayload` public type
- `AUTH_DELETION_PORT` for Retention
- `AuthService` only if another module genuinely needs account operations (none currently)

`EMAIL_PORT`, concrete `AuthDeletionService`, and low-level token/cookie/strategy services should remain internal to Auth/AuthCore unless a verified external consumer exists. Guards and payload do not need ports. A small public barrel is appropriate to stop folder-deep imports; Nest module exports are required only for injected providers, not pure types.

## 11. Profile / onboarding findings

`OnboardingGuardService` as an abstract class token with one implementation is already a reasonable boundary: it provides an injectable stable contract without a separate symbol/interface pair. Keep it.

Its weakness is scope: consumers still query and mutate `OnboardingState` directly to build `OnboardingGuardContext` and perform transitions. Expand the Profile-owned capability narrowly so Profile builds context/reads state and performs allowed transitions. Do not create a generic onboarding repository or expose arbitrary state setters.

## 12. Retention findings

The deletion-port pattern remains justified and should be retained. Retention is a platform orchestrator and should know only sanitized counters/cutoffs, not domain persistence. The ports support failure isolation and substitution in scheduled/account-deletion tests.

Corrections:

- Remove redundant concrete deletion-service exports from Auth, Profile, and Coaching after verifying no external consumer.
- Route `UserAccount` acceptance/blocking/checking through the Auth deletion capability instead of direct Prisma access.
- Reconsider Safety deletion's read of Assessment rows; candidate ownership should not leak into Safety.
- Retention's own `DeletionLog` Prisma access remains valid.

## 13. Dependency graphs

### Current module imports

```text
Auth -> AuthCore
Profile -> Auth
Assessment -> Auth, Profile, Safety
Safety -> Auth, Profile
Coaching -> Auth, Profile, Safety, Assessment, AI
Conversations -> Prisma only
Retention -> Auth, Profile, Assessment, Coaching, Safety
AI -> (no Nest module imports)
```

### Current source-level additions

```text
AI -> Coaching contracts
AI -> Conversations retrieval type
Conversations -> AI concrete adapter/port/helper
Conversations -> Safety constants
Assessment -> Safety internals
Coaching -> AI internals + Assessment internals
Safety -> Profile and Assessment data via Prisma
Assessment -> Profile data via Prisma
Retention -> Auth data via Prisma
```

### Proposed graph

```text
Auth
  ^
  |
Profile
  ^       Safety API
  |      ^    ^    ^
Assessment    |    Conversations
  ^           |       |       |
  |           |       v       v
Coaching -----+-----> AI    Retrieval
  |                   ^       ^
  +-------------------+-------+

Retention -> Auth/Profile/Assessment/Coaching/Safety deletion ports only
```

More explicitly: Assessment imports Profile and Safety; Coaching imports Profile, Assessment, Safety, AI, and Retrieval; Conversations imports Auth, Safety, AI, and Retrieval; AI and Retrieval import no domain consumer modules. Safety uses public Profile and Assessment lifecycle capabilities only if that dependency can remain acyclic; otherwise the narrow Assessment lifecycle port is the one justified cycle-breaking exception.

## 14. Circular and reverse dependencies

| Relationship | Kind | Finding | Minimal correction |
|---|---|---|---|
| Coaching <-> AI | module/source bidirectionality | Coaching imports `AiModule`; AI imports Coaching token/types | Move LLM contracts/tokens to AI; AI imports no Coaching source |
| Conversations <-> AI | source bidirectionality | Conversations imports AI; AI imports Conversations RAG chunk type | Move chunk contract to Retrieval or AI-owned minimal grounded chunk type |
| Assessment <-> Safety data ownership | logical reverse dependency avoided via Prisma | Assessment calls Safety; Safety writes Assessment rows directly | Assessment lifecycle capability; use a port only if direct module import creates cycle |
| Profile <-> Safety | module relationship plus foreign writes | Safety imports Profile and writes Profile table | Use Profile public transition service |
| File import cycles | No confirmed same-file cycle from the reviewed production imports | Main issues are module/domain reverse dependencies above | Add an import-cycle check during validation after each boundary change |

No `forwardRef()` use was found under the audited modules, so there is no explicit Nest circular-DI workaround today.

## 15. Hardening classification A-G

| Issue | Class | Priority |
|---|---|---|
| Auth guards/payload/consent intentional public surface | **A — Public export fix** | Medium |
| Safety service/public contracts; hide internals | **A/B — Public export + deep-import replacement** | High |
| Conversations uses Safety constants/local classifier | **B — Deep-import replacement** | High |
| Assessment imports Safety classifier/constants/copy | **B — Deep-import replacement** | High |
| Coaching consumes Assessment service via deep path and error/DTO internals | **A/B** | Medium |
| AI owns Coaching contracts incorrectly | **C — Ownership correction** | High |
| Conversations registers AI concrete adapter | **B/C** | High |
| Duplicate Coaching/Conversation RAG clients | **C — Ownership correction** | High |
| Assessment/Safety write Profile onboarding data | **D — Data-ownership correction** | High |
| Safety writes Assessment lifecycle data | **D**; possibly **F** only to break a proven cycle | High |
| Retention writes Auth account data | **D** | High |
| Retention deletion ports | **E — Keep as Port** | High confidence / unchanged |
| LLM provider ports | **E — Keep as Port** | High confidence / unchanged |
| Retrieval external-client abstraction | **F — Introduce Port**, internal to Retrieval only | Medium |
| Profile abstract onboarding service | **G — Leave unchanged** structurally; extend capability narrowly | Medium |
| Domain-local Prisma access | **G — Leave unchanged** | Low |
| Unconsumed module exports | **A — Public export cleanup** | Low |

## 16. Priority ranking

### High

1. Conversations -> Safety bypass and duplicated safety decision logic.
2. AI <-> Coaching reverse contract ownership and Conversations registering AI implementation.
3. Profile/Assessment cross-module state mutations from Assessment and Safety.
4. Retention direct Auth data writes.
5. Consolidated Retrieval ownership, because two central AI paths currently duplicate infrastructure and types.

### Medium

1. Formal Auth public surface and removal of deep guard/payload/consent paths.
2. Assessment result public contract for Coaching.
3. Safety deletion candidate query crossing into Assessment data.
4. Prompt and error-normalization ownership cleanup.

### Low

1. Remove unused concrete service/repository exports.
2. Remove unnecessary Retention exports if no external bootstrap/test consumer exists.
3. Add documented public barrels after runtime boundaries are correct.

## 17. Recommended execution order

Each item is a boundary hardening change set, not an implementation task breakdown.

1. **Formalize Auth public surface.** Export only consent, guards, payload contract, and deletion port required by consumers. Replace deep Auth imports without behavior changes.
2. **Harden Safety's public API.** Make Assessment and Coaching consume only `SafetyService` plus minimal public contracts; route Conversations through the same public safety capability while preserving its current decisions/copy exactly.
3. **Correct AI contract ownership.** Make AI own/register/export both provider contracts; remove AI imports from Coaching/Conversations domains and stop Conversations registering the concrete adapter.
4. **Formalize Assessment result API.** Coaching consumes only `AssessmentResultService` and an Assessment-owned public result view; remove error/DTO internals.
5. **Establish Retrieval ownership.** Introduce one Retrieval module/client boundary and migrate one consumer at a time, keeping request shapes, thresholds, timeout behavior, and error codes unchanged.
6. **Correct Profile onboarding ownership.** Route Assessment and Safety reads/transitions through the Profile capability.
7. **Correct Assessment lifecycle ownership.** Route Safety suspend/resume through Assessment; introduce a narrow port only if a direct module dependency demonstrably creates a Nest cycle.
8. **Finish Retention ownership cleanup.** Move account lifecycle operations behind Auth deletion capability and remove Safety's Assessment-row candidate query.
9. **Trim unused exports and enforce boundaries.** Remove unconsumed concrete exports and add import-cycle/forbidden-deep-import checks.

## 18. Validation plan per boundary

| Step | Affected modules | Unit/contract tests | E2E and regression checks | Static checks |
|---|---|---|---|---|
| 1 Auth surface | Auth and all controllers | guard allow/deny; consent gate; deletion token resolution | registration/login/verified routes; protected endpoint 401/403 behavior | backend lint/build; Nest testing module resolves every consumer |
| 2 Safety API | Safety, Assessment, Coaching, Conversations | classifier matrices unchanged; SafetyService public methods; conversation safety routing/fail-closed; assessment per-answer/on-submit | `safety-routing`, `conversation-safety`, assessment submit/re-entry/resume, redaction audit | lint/build; no imports from `safety/utils` or `safety/constants` outside Safety except explicitly public contract |
| 3 AI ownership | AI, Coaching, Conversations | both token bindings; fake/provider substitution; error code mapping; schema validation | coaching plan generation and conversation send/follow-up/failure retry | lint/build; cycle detection; no consumer import from `ai/providers`, `ai/services`, `ai/utils` |
| 4 Assessment result API | Assessment, Coaching | public result mapping; missing-result behavior; eligibility/generation unchanged | coaching plan success/unavailable and assessment result contract | lint/build; no Coaching import from Assessment `dto/constants/services` internals |
| 5 Retrieval | Retrieval, Coaching, Conversations | request mapper parity; auth header; timeout/unavailable/invalid response; chunk metadata; threshold passthrough | coaching RAG plan; conversation RAG answer, insufficient retrieval, citation validation, failure retry | lint/build; assert exact request payloads and effective thresholds; no duplicated HTTP RAG clients |
| 6 Profile ownership | Profile, Assessment, Safety | allowed predecessor transitions; context construction; idempotent/no-op transitions | onboarding resume/restart, safety hold/re-entry, assessment lifecycle | lint/build; forbid foreign `prisma.onboardingState` |
| 7 Assessment ownership | Assessment, Safety | suspend/resume guards, missing assessment, crisis vs high-risk behavior | safety routing/re-entry, assessment idempotency and state preservation | lint/build; no Safety `prisma.assessment`; verify no Nest cycle |
| 8 Retention ownership | Retention, Auth, Assessment, Safety | port counters/cutoffs; partial failure isolation; accepted deletion state; candidate derivation | account deletion, scheduled retention, tenant isolation | lint/build; Retention touches only `DeletionLog` directly; deletion tokens resolve |
| 9 Surface trim | all | module-resolution smoke tests | focused full backend e2e suite | lint/build; import-cycle and boundary-rule checks |

For every step, compare response DTOs and persisted state before/after; boundary hardening must not change public HTTP status, error code, field naming, safety route, scoring, prompt, model/provider selection, RAG threshold, citation, or deletion counter semantics.

## 19. High-risk regression areas

- Conversation safety must remain fail-closed and preserve the exact static response and persisted processing metadata.
- Assessment per-answer interrupts, final submit gating, distress notes, current safety evaluation, and re-entry history must remain unchanged.
- `HIGH_RISK` suspends the assessment while `CRISIS` leaves the current assessment interrupted/in progress; ownership cleanup must preserve this distinction.
- Onboarding transitions are conditional on predecessor state; a generic setter would create illegal journey skips.
- Coaching `PLAN_UNAVAILABLE` reasons, retryability, LLM invalid-output mapping, prompt/schema validation, and grounding bundle content must not drift.
- Conversation provider errors, citation validation, follow-up rewrite, and idempotent persistence rely on exact error/stage metadata.
- Retrieval consolidation must preserve separate domain request semantics, effective `0.44` threshold, timeouts, correlation IDs, chunk metadata, and insufficient-grounding behavior.
- Account deletion ordering, idempotency, partial failure recovery, sanitized counters, tenant isolation, and “not complete until all stores confirm” semantics are sensitive.
- Nest token resolution can fail at bootstrap even when TypeScript compiles; module-resolution tests are required after export/import changes.

## 20. Audit conclusion

The target is a conventional NestJS modular monolith, not a ports-and-adapters rewrite. Public services are sufficient for Auth consent, Safety, Assessment results, Profile onboarding, and domain lifecycle transitions. Keep ports for LLM providers and Retention deletion; use a Retrieval client port only inside a centralized infrastructure module. The recommended sequence first removes safety and AI implementation leakage, then corrects data ownership, and finally trims surfaces and enforces the new boundaries.

This report intentionally stops at the audit and execution sequence. It does not define implementation tasks or modify source code.
