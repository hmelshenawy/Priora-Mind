# Boundary Hardening Phase 07: Retention Ownership + Automated Enforcement

Date: 2026-08-10  
Status: Complete; final backend Boundary Hardening phase

## 1. Retention dependency and ownership matrix before changes

| Dependency | Imported capability | Path before | Direct persistence | Ownership classification |
|---|---|---|---|---|
| Auth | AUTH_DELETION_PORT/AuthDeletionPort | `auth/auth.public` | Retention read/updated UserAccount directly | violation: Auth lifecycle |
| Profile | PROFILE_DELETION_PORT/ProfileDeletionPort | deep `profile/ports` | none | orchestrated owner port; deep import |
| Assessment | ASSESSMENT_DELETION_PORT/AssessmentDeletionPort | deep `assessment/ports` | none | orchestrated owner port; deep import |
| Coaching | COACHING_DELETION_PORT/CoachingDeletionPort | deep `coaching/ports` | none | orchestrated owner port; deep import |
| Safety | SAFETY_DELETION_PORT/SafetyDeletionPort | `safety/safety.public` | SafetyDeletionService read Assessment rows | violation inside Safety deletion |
| Retention | DeletionLog | local Prisma | DeletionLog read/create | valid Retention-owned persistence |

Account deletion order before change was Assessment, Coaching, Safety, Profile, Consent, then Auth account last. Scheduled order was Auth, Profile, Assessment, Coaching, Safety. Baseline Retention E2E: 4 files passed, 25 tests passed. A first attempted unit/contract baseline named nonexistent files and correctly executed no tests; the repository's actual baseline was E2E-only.

## 2. Auth account lifecycle ownership correction

`AuthDeletionPort` now exposes `prepareAccountDeletion(userId, acceptedAt)`. `AuthDeletionService` owns the UserAccount lookup and conditional `deletedAt` update. It returns false when the account was already hard-deleted, preserving the completed idempotent no-op.

`AccountDeletionService` no longer reads or writes UserAccount. Retention still orchestrates domain cleanup and owns only DeletionLog persistence.

## 3. Safety/Assessment deletion-candidate ownership correction

`AssessmentDeletionService.deleteExpired` now selects the same eligible incomplete Assessment IDs before deleting the rows and returns those sanitized IDs with its counters. Retention passes those IDs to `SafetyDeletionPort.deleteExpiredForAssessmentIds` at the existing Safety step. Safety deletes only SafetyEvaluation rows and no longer queries Assessment persistence.

A focused E2E test proves the expired Assessment and its loose-reference SafetyEvaluation are both removed.

## 4. Final deletion-port architecture

```text
Retention
  -> AuthDeletionPort       -> AuthDeletionService       -> Auth persistence
  -> ProfileDeletionPort    -> ProfileDeletionService    -> Profile persistence
  -> AssessmentDeletionPort -> AssessmentDeletionService -> Assessment persistence
  -> CoachingDeletionPort   -> CoachingDeletionService   -> Coaching persistence
  -> SafetyDeletionPort     -> SafetyDeletionService     -> Safety persistence
```

The five domain-specific ports remain. No generic deletion port, repository, event bus, or service locator was introduced.

## 5. Deletion ordering and atomicity analysis

User account deletion remains strictly sequential:

1. Auth tombstone/acceptance before data cleanup.
2. Assessment.
3. Coaching.
4. Safety.
5. Profile.
6. Consent.
7. Auth account hard-delete only after every category reports zero errors.
8. Sanitized DeletionLog.

Partial failure still retains the tombstoned account and returns `partial`; retry repeats idempotent port operations. There was no cross-domain transaction before and none was introduced.

Scheduled deletion remains Auth, Profile, Assessment, Coaching, Safety, followed by DeletionLog. Candidate IDs are produced inside the Assessment step and consumed later by Safety without parallelization.

## 6. Scheduled-retention parity

Cutoffs remain 7 days for unverified accounts and 30 days for pre-consent/incomplete Profile/Assessment/Safety scope. Eligible Assessment states remain `NOT_STARTED`, `IN_PROGRESS`, and `SUSPENDED`; SCORED results remain retained. Same-window dedup, category isolation, counter shapes, partial/failed status, and sanitized logging remain unchanged.

## 7. Concrete export cleanup

Removed redundant concrete Nest exports:

- AuthDeletionService from AuthModule exports
- ProfileDeletionService from ProfileModule exports
- CoachingDeletionService from CoachingModule exports

Assessment and Safety already exported only their tokens. All deletion implementations remain internal providers behind owner tokens.

## 8. Final Retention module public surface

RetentionModule exports nothing. Its controller and cron provider remain internally registered. No production module consumes RetentionService or AccountDeletionService externally, so no `retention.public.ts` was created.

## 9. Enforcement-rule design

The checker enforces:

1. Hardened-module cross imports use the owner's `*.public.ts`; Nest module composition may import `*.module.ts`.
2. Cross-module `services/utils/constants/providers/dto/ports` imports fail.
3. Prisma writes remain in the owner module for Auth, Profile, Assessment, Safety, Coaching, Conversations, and Retention.
4. AI internals/adapters remain AI-owned and consumers cannot register concrete AI adapters.
5. RAG URL/token/timeout and `/v1/search` remain Retrieval-owned; NestJS cannot depend on/access Qdrant.
6. `forwardRef()` is prohibited in hardened modules.
7. Runtime file-level relative-import cycles fail.

Every violation prints rule, file, and offending detail.

## 10. Boundary checker implementation

Added `02-BACKEND/scripts/check-module-boundaries.ts`. It uses only Node filesystem/path APIs and deterministic source scanning; no dependency was added. Added `tests/architecture/module-boundaries.spec.ts`, included by the normal Vitest configuration.

Type-only imports/exports are enforced for public-surface paths but excluded from the runtime cycle graph because TypeScript erases them.

## 11. Package and validation command

Added:

```powershell
npm -w 02-BACKEND run check:boundaries
```

The backend package command is `npm run check:boundaries`. The command is documented in `specs/005-frontend-chatbot/quickstart.md` and the architecture test runs during normal unit/contract validation.

## 12. Constitution and architecture guardrail update

Updated `.specify/memory/constitution.md` from 1.0.0 to 1.1.0, last amended 2026-08-10. Added concise mandatory rules for private internals, public owner surfaces, service-by-default/justified ports, owner-local persistence, `module.ts` plus public surface, explicit approval for cycles/`forwardRef`, AI/Retrieval ownership, and the boundary command quality gate. Product requirements were not changed.

## 13. Explicit allowlist and exceptions

The checker has no path allowlist. Allowed categories are rule-based only:

- another module's root Nest module file for DI composition;
- another hardened module's public entry point;
- type-only edges omitted only from runtime cycle detection.

Tests may use internal paths for focused white-box characterization; production enforcement targets `src/modules`.

## 14. Final public-boundary scan

Passed. Retention now consumes every deletion token/type from public entry points:

- `auth.public`
- `profile.public`
- `assessment.public`
- new `coaching.public`
- `safety.public`

The remaining Coaching deep Profile guard import was migrated to `profile.public`. No production hardened-module internal import violation remains.

## 15. Final foreign-Prisma-write scan

Passed owner-local scans for:

- Auth/UserAccount, tokens, and consent
- Profile/Preferences/OnboardingState
- Assessment/AssessmentAnswer/AssessmentResult
- SafetyEvaluation
- Coaching plan graph
- Conversation/message/source graph
- Retention DeletionLog

Retention has no direct UserAccount access. Safety has no Assessment persistence access.

## 16. Final AI ownership scan

Passed: AI imports no Coaching or Conversations source, consumers import AI through `ai.public`, and no consumer module registers concrete AI adapters/providers.

## 17. Final Retrieval ownership and Qdrant scan

Passed: RAG base URL, token, timeout, `/v1/search`, and Python transport remain exclusively under Retrieval. No NestJS Qdrant dependency, import, `query_points`, or client access exists.

## 18. Cycle and forwardRef scan

Runtime file-level import-cycle scan passed. No `forwardRef()` exists in hardened core modules. The checker initially reported type-only cycles; it was corrected to distinguish erased type edges from runtime dependency edges while retaining public-import validation.

## 19. Retention test results

Focused final Retention/account deletion/isolation/audit run: 4 files passed, 26 tests passed. It covers exact ordering behavior, partial failure, account tombstone, account-last completion, retry/idempotency, counters, scheduled windows/cutoffs, category isolation, completed-data retention, tenant isolation, audit redaction, and Assessment-ID-driven Safety cleanup.

## 20. Cross-domain deletion test results

All contracts plus Auth/Profile/Assessment owner lifecycle and architecture coverage passed: 14 files, 139 tests. Domain deletion port coverage confirms Assessment incomplete-only cleanup, completed result retention, Safety user-history deletion, and account cleanup resolution through RetentionModule.

## 21. Previous-phase regression proof

The automated checker and explicit scans prove:

- Auth consumers use `auth.public`.
- Safety consumers use `safety.public`.
- AI has no reverse consumer dependency and consumers use `ai.public`.
- Coaching uses `assessment.public` for result consumption.
- Retrieval solely owns Python RAG transport.
- Profile/Assessment/Safety foreign writes remain eliminated.

The complete backend suites also passed.

## 22. Full backend validation results

- Full unit/contract/architecture: 49 files passed, 352 tests passed.
- Full E2E/integration: 21 files passed, 77 tests passed.
- Focused Retention after new candidate test: 4 files passed, 26 tests passed.
- `npm run check:boundaries`: passed.

No Vitest worker instability occurred during the final full-suite runs.

## 23. Build, typecheck, lint, and diff-check

- `npx tsc --noEmit -p tsconfig.build.json`: passed
- `npx nest build`: passed
- `npx eslint .`: passed
- `git diff --check`: passed; existing LF-to-CRLF notices only

## 24. Final module dependency graph

```text
Auth -> Auth-owned persistence and external email port
Profile -> Auth public consent; Profile-owned persistence
Assessment -> Auth/Profile/Safety public capabilities; Assessment-owned persistence
Safety -> Auth/Profile public capabilities + narrow Assessment lifecycle module; Safety-owned persistence
AI -> provider ports/adapters; no consumer-domain source
Retrieval -> internal HTTP port/adapter -> Python RAG
Coaching -> Auth/Profile/Assessment/Safety/AI/Retrieval public capabilities; Coaching persistence
Conversations -> Auth/Safety/AI/Retrieval public capabilities; Conversation persistence
Retention -> Auth/Profile/Assessment/Coaching/Safety deletion ports; Retention-owned DeletionLog
```

## 25. Final public Services versus Ports map

Public services:

- AuthService/ConsentService and auth guards
- ProfileLifecycleService/OnboardingGuardService
- AssessmentResultService/AssessmentSafetyLifecycleService
- SafetyService
- RetrievalService
- AI provider-neutral consumer tokens/contracts

Justified ports:

- five owner-defined deletion ports for Retention orchestration
- AI provider/LLM ports for provider substitution
- Retrieval internal client port for HTTP isolation/testing
- Auth email external-provider port

No port was added for a single ordinary domain service.

## 26. Remaining intentional architecture exceptions

- Focused tests may import internals for white-box characterization.
- Type-only import cycles are excluded from runtime cycle failure because they are erased; their paths still obey public-boundary rules.
- Existing read-only cross-domain eligibility composition documented in Phase 06 remains outside the foreign-write prohibition.

There is no production path allowlist in the checker.

## 27. Product behavior confirmation

No deletion/retention duration, eligibility state, ordering, counter, error, retry, idempotency, HTTP API, DTO, Auth lifecycle semantics, Assessment/Safety behavior, Coaching, Conversation, AI, RAG, prompt, provider configuration, Prisma schema, Python service, or frontend behavior changed. The ownership move preserves the same data selection while correcting which module performs it.

## 28. Boundary Hardening completion

All seven Boundary Hardening phases are implemented and protected by a fast automated gate. No further backend architecture refactor was started.

## Console summary

Final Boundary Hardening completed: Retention no longer touches Auth accounts, Safety no longer reads Assessment persistence, all deletion ports use public entry points, redundant exports were removed, and `npm -w 02-BACKEND run check:boundaries` enforces the completed architecture with no path allowlist. Focused Retention passed 26 tests, full unit/contract/architecture passed 352 tests, full E2E/integration passed 77 tests, and all build/lint/static/diff gates passed.
