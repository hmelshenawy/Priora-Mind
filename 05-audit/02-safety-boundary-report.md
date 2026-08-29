# Boundary Hardening Phase 02 — Safety Public Boundary

**Date:** 2026-08-10  
**Scope:** Safety public boundary and mechanical consumers only  
**Behavior changes:** None

## 1. Before Safety public surface

`SafetyModule` imported Auth and Profile, provided `SafetyService`, `SafetyReentryService`, `SafetyDeletionService`, and the deletion-token alias, and exported `SafetyService` plus `SAFETY_DELETION_PORT`.

There was no intentional TypeScript public entry point. Assessment, Coaching, Conversations, and Retention imported Safety implementation files directly.

| Consumer | Deep-imported symbols | Classification |
|---|---|---|
| Assessment | `SafetyService` | public service through internal path |
| Assessment | `SAFETY_QUESTIONS` | immutable definition required for existing assessment-definition wire contract |
| Assessment | `Sq01Code`, `Sq02Code`, `Sq03Code` | canonical answer-code types |
| Assessment | `SQ02_TRIGGER_CODES` | Safety decision knowledge |
| Assessment | `SAFETY_COPY`, `BilingualEntry` | raw approved copy/internal type |
| Assessment | `ClassifierDomainScore` | classifier implementation type |
| Assessment | `SafetyRoute` | stable cross-module wire type |
| Coaching | `SafetyService` | public service through internal path |
| Conversations | `SAFETY_COPY`, `SafetyLevel` | raw copy/type; Conversation also owned duplicate keyword classification |
| Retention | `SAFETY_DELETION_PORT`, `SafetyDeletionPort` | justified deletion capability through internal path |

### Pre-change baseline

The required combined baseline commands reproduced the documented Vitest worker-pool instability:

- Unit/contract baseline: 8 of 9 files reported, 113 of 116 tests executed and passed, then one worker exited unexpectedly.
- E2E baseline: 4 of 6 files reported, 22 of 24 tests executed and passed, then two workers exited unexpectedly.

There were no assertion failures. Post-change authoritative runs used `--maxWorkers=1` and completed cleanly.

## 2. After Safety public surface

Added `02-BACKEND/src/modules/safety/safety.public.ts`. All production consumers now import intentional Safety capabilities only from that entry point. Safety classifier utilities, raw copy, thresholds, trigger arrays, internal DTO files, services paths, and error helpers remain private.

Conversations now imports `SafetyModule`; its existing `ConversationSafetyService` delegates safety decisions to the Safety-owned `SafetyService` capability. The wrapper continues to own Conversation failure fallback and metadata mapping.

No Safety port was created.

## 3. Assessment → Safety dependencies before/after

| Need | Before | After |
|---|---|---|
| Runtime safety evaluation/current route/current level | deep `services/safety.service` import | `SafetyService` from `safety.public` |
| Assessment definition's three safety questions | raw constants-file import | only immutable `SAFETY_QUESTIONS` through `safety.public` |
| Persisted SQ code typing | raw constants-file types | canonical SQ types through `safety.public` |
| SQ-02 conditional requiredness/acceptance | direct `SQ02_TRIGGER_CODES.includes` in two Assessment services | `SafetyService.requiresFollowUpForSq01` |
| DISTRESS result copy | direct `SAFETY_COPY.DISTRESS` reads | `SafetyService.distressSupportCopy` |
| Domain score classifier input | internal `ClassifierDomainScore` | public minimal `SafetyEvaluationDomainScore` (`{ score: number }`) |
| Embedded route DTO | deep DTO import | public `SafetyRoute` type |

The question projection remains byte-for-byte the same. Only the minimal immutable question view required by the existing HTTP contract is exposed; the version, matrix, thresholds, copy, resources, actions, and trigger arrays are not exposed.

## 4. Conversations → Safety dependencies before/after

Before, Conversations imported `SAFETY_COPY` and `SafetyLevel`, ran its own private keyword classifier, and did not import `SafetyModule`.

After:

- `ConversationsModule` imports `SafetyModule`.
- `ConversationSafetyService` imports only `SafetyService` from `safety.public`.
- `SafetyService.evaluateConversation` owns the same deterministic free-text rules and approved response selection.
- `ConversationSafetyService` still catches Safety failures and preserves `CONVERSATION_FALLBACKS.safetyTechnical`, `SAFETY_UNAVAILABLE`, and the downstream persisted metadata.

The assessment SQ classifier was not applied to free text.

## 5. Coaching → Safety dependencies before/after

Coaching still injects the same `SafetyService` and calls the same `currentLevel/currentRoute` behavior. Only its import changed from `safety/services/safety.service` to `safety/safety.public`.

## 6. New SafetyService public methods

| Method | Exact reason |
|---|---|
| `requiresFollowUpForSq01(code)` | Hides `SQ02_TRIGGER_CODES` and preserves SQ-02 shown/required semantics in Assessment |
| `distressSupportCopy()` | Prevents Assessment from reading/assembling raw approved Safety copy; returns the same EN/AR bytes |
| `evaluateConversation(content)` | Makes Safety own the existing conversation-specific deterministic decision and copy selection without changing its algorithm |

`SafetyService.evaluateConversation` also has a static form used by direct-construction legacy tests when Nest injection is absent. Runtime Nest use delegates through the injected service instance.

## 7. Intentionally public Safety types/data

- `SafetyService`
- `SafetyConversationDecision`: minimal free-text evaluation result
- `SafetyEvaluationDomainScore`: only `{ score: number }`
- `SafetyRoute`: existing embedded cross-module wire shape
- `Sq01Code`, `Sq02Code`, `Sq03Code`: canonical persisted answer codes
- `SafetyQuestion` and immutable `SAFETY_QUESTIONS`: required to preserve the assessment-definition response
- `SAFETY_DELETION_PORT` and `SafetyDeletionPort`: justified Retention contract

No global shared package was introduced.

## 8. Safety internals successfully hidden

Production code outside Safety no longer imports:

- `classifySafety`, `ClassifierDomainScore`, or any `safety/utils/**`
- `SAFETY_COPY`
- `SQ02_TRIGGER_CODES`
- distress thresholds or matrix/version internals
- Safety actions/resources internals
- `BilingualEntry` from Safety
- `SafetyReentryService` or `SafetyDeletionService`
- any `safety/constants/**`, `safety/services/**`, or internal DTO file

## 9. SafetyModule export changes

`SafetyModule` runtime exports remain correctly minimal and unchanged: `SafetyService` and `SAFETY_DELETION_PORT`.

`ConversationsModule` now imports `SafetyModule`. No duplicate provider was added. TypeScript types and immutable public data are exposed through `safety.public.ts` and do not require Nest exports.

## 10. Production deep-import scan

Scan pattern outside Safety: `safety/(utils|constants|services)` under `02-BACKEND/src/modules/**/*.ts`.

Result: **PASS — no matches**.

All production consumers use `safety/safety.public`; module classes continue to be imported from `safety/safety.module` for normal Nest composition.

## 11. Safety unit/contract/e2e results

Authoritative single-worker unit/contract group included:

- classifier unit matrix
- new Safety public-boundary tests
- `safety.contract.spec.ts`

The main group passed as part of **9 files / 116 tests**. The new public-boundary suite then passed independently: **1 file / 3 tests**.

Safety routing e2e passed as part of **6 e2e files / 24 tests**. Safety contract/e2e coverage includes hold and re-entry behavior.

## 12. Assessment regression results

Included in the clean 116-test group:

- all `tests/unit/assessment` files
- `assessment.contract.spec.ts`

Included in the clean 24-test e2e group:

- `assessment-submit-idempotency.spec.ts`
- `resume-restart.spec.ts`
- `safety-routing.spec.ts`

All passed. Coverage preserves SQ-02 conditional requiredness, per-answer escalation, final-submit gating/distress, SAFETY_HOLD suppression, re-entry, restart, and idempotency.

## 13. Conversation regression results

Unit/contract group:

- `conversation-safety-routing.spec.ts`
- `conversation-message-send.spec.ts`

E2E group:

- `conversation-safety.e2e-spec.ts`
- `conversation-safety-redaction.e2e-spec.ts`
- `conversation-failure-retry.e2e-spec.ts`

All passed within the 116/116 and 24/24 clean runs.

## 14. Coaching regression results

`coaching-eligibility.spec.ts` and `coaching-generation.spec.ts` passed within the clean unit/contract group. Eligibility, current Safety state checks, and generation behavior are unchanged.

## 15. Build/typecheck results

- `npx tsc --noEmit -p tsconfig.build.json` → **PASS**, exit 0.
- `npx nest build` → **PASS**, exit 0.

Nest application compilation in contract/e2e suites also passed, confirming provider resolution after `ConversationsModule -> SafetyModule` was added.

## 16. Scoped lint results

`npx eslint` over `src/modules/safety` and every changed Assessment, Conversation, Coaching, and Retention consumer file → **PASS**, exit 0, zero errors/warnings.

The new Safety public-boundary test also passes lint.

## 17. Project-wide lint

`npx eslint .` → **FAIL with exactly one unrelated pre-existing error**:

```text
src/modules/ai/providers/ollama-conversation-llm.provider.ts
71:7  error  Unnecessary try/catch wrapper  no-useless-catch
```

No Safety or affected-consumer lint error was reported. AI was not modified.

## 18. `git diff --check`

Result: **PASS**, exit 0. Git emitted Windows LF-to-CRLF working-copy warnings only; there were no whitespace errors.

## 19. Exact conversation safety parity proof

The free-text predicates were moved without semantic change:

- Technical fixture `__safety_check_throw__` still throws inside Safety evaluation; the Conversation wrapper catches it.
- CRISIS remains any normalized content containing `immediate danger`, `kill myself now`, `harm myself now`, or `suicide now`.
- HIGH_RISK remains content containing `kill myself`, `harm myself`, `suicidal`, or `self-harm` after CRISIS precedence.
- Everything else remains `NORMAL`; “I am feeling depressed” still returns `route: none` and continues downstream.
- HIGH_RISK/CRISIS content remains exactly `SAFETY_COPY[level].en`, now selected inside Safety.
- The Conversation wrapper returns the same `route`, `level`, `content`, or fail-closed decision.
- `ConversationMessageService.routeSafetyAndStatic` was not changed, so handled Safety paths still bypass static routing, RAG, and LLM.
- Failure persistence remains route `SAFETY`, status `FAILED`, processing stage `SAFETY`, failure code `SAFETY_UNAVAILABLE`, detail `safety_check_failed`.

Proof: the new Safety boundary test compares exact approved copy; conversation routing/message-send tests prove low-risk continuation, high-risk/crisis routing, technical failure, RAG/LLM bypass, and assistant persistence; safety/redaction/failure e2e suites all pass. No assistant persistence code changed, so duplicate-message/idempotency behavior is unchanged.

## 20. Exact assessment safety parity proof

- `requiresFollowUpForSq01` delegates to the unchanged `SQ02_TRIGGER_CODES` array (`S1`, `S2`, `SX`; not `S0`). The new unit test asserts all four codes.
- `SAFETY_QUESTIONS` is the same immutable source and Assessment applies the same mapping to its wire response.
- `SafetyService.evaluatePerAnswer`, `evaluateOnSubmit`, `currentRoute`, and `currentLevel` bodies are unchanged.
- The classifier, severity precedence, distress thresholds, reason generation, and validation are unchanged.
- `distressSupportCopy` returns a new object with the exact existing English and Arabic strings; the unit test compares it to `SAFETY_COPY.DISTRESS`.
- Assessment persistence, state changes, safety evaluation IDs, result suppression, and response DTOs were not changed.

Proof: classifier matrix, Safety contract, Assessment unit/contract, submit-idempotency, resume/restart, and Safety routing e2e all pass.

## 21. Deferred Safety data-ownership violations

Per Phase 02 constraints, unchanged and deferred:

- `SafetyService` directly reads/writes Profile-owned `OnboardingState`.
- `SafetyService` directly writes Assessment-owned assessment state during routing.
- `SafetyReentryService` directly reads/writes Assessment state during resume.
- `SafetyDeletionService` reads Assessment rows to derive deletion candidates.

All Prisma calls, transactions, timestamps, and transition semantics remain exactly in place.

## 22. Other intentionally deferred boundary issues

- Test code may still import Safety internals for white-box assertions; the production boundary is clean.
- The static `SafetyService.evaluateConversation` compatibility path can be removed when direct-construction Conversation tests are migrated to Nest injection/fakes; runtime behavior already uses the instance capability.
- Profile ownership, Assessment lifecycle ownership, Retention ownership, AI, and Retrieval phases were not started.
- Phase 03 AI Boundary Hardening was not begun.

## Console summary

Phase 02 complete: one Safety public entry point; Assessment, Coaching, Conversations, and Retention migrated; conversation safety now Safety-owned with identical deterministic behavior; no external production Safety deep imports; 143 authoritative post-change tests passed; typecheck/build/scoped lint/diff-check passed; project lint has only the known unrelated AI error.
