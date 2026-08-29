# Boundary Hardening Phase 06: Profile + Assessment Lifecycle Ownership

Date: 2026-08-10  
Status: Complete; Retention hardening was not started

## 1. Cross-module Prisma access matrix before changes

| Caller | Model/state | Access | Actual owner | Violation before Phase 06 |
|---|---|---|---|---|
| AssessmentOnboardingService | OnboardingState | read/write transitions | Profile | yes |
| AssessmentLifecycleService | OnboardingState | safety-hold reads and activity writes | Profile | yes |
| AssessmentSubmitService | OnboardingState | safety-hold read | Profile | semantic direct read |
| SafetyService | OnboardingState | guard read and hold/release writes | Profile | yes |
| SafetyService | Assessment | HIGH_RISK suspension write | Assessment | yes |
| SafetyReentryService | Assessment | current read and resume write | Assessment | yes |
| SafetyDeletionService | Assessment | read expired/incomplete IDs | Assessment | read-only composition; deferred |
| CoachingEligibilityService | OnboardingState | eligibility read | Profile | read-only composition; deferred |
| ConversationAccessService | OnboardingState | access read | Profile | read-only composition; deferred |
| Profile services | Profile/Preferences/OnboardingState | read/write | Profile | no |
| Assessment services | Assessment/Answer/Result | read/write | Assessment | no |
| Safety services | SafetyEvaluation | read/write | Safety | no |

Retention accesses deletion capabilities through existing owner ports and does not directly write these tables.

## 2. Final ownership model

- Profile owns Profile, Preferences, OnboardingState, onboarding guards/context, activity timestamps, completion, SAFETY_HOLD, and release transitions.
- Assessment owns Assessment, AssessmentAnswer, AssessmentResult, current Assessment identity for Safety association, suspension, and resumption.
- Safety owns classification, copy/routes, append-only SafetyEvaluation persistence, current evaluation semantics, and re-entry policy.
- Cross-domain workflows request capability-named transitions from the owner.

## 3. Profile public capability before and after

Before: Profile had no `profile.public.ts`. Other modules imported `OnboardingGuardService` directly and wrote/read OnboardingState through Prisma.

After: `profile.public.ts` intentionally exports `ProfileLifecycleService`, `OnboardingGuardService`, and the guard context type. `ProfileLifecycleService` exposes only concrete capabilities:

- `assertCanEnterAssessment`
- `assertCanEnterSafetyHold`
- `markAssessmentInProgress`
- `markAssessmentComplete`
- `placeOnSafetyHold`
- `releaseSafetyHoldToAssessment`
- `isOnSafetyHold`
- `touchOnboardingActivity`

No generic state/status setter, repository, or Prisma type is exposed.

## 4. Assessment lifecycle public capability before and after

Before: `assessment.public.ts` exposed result consumption only; Safety directly read/wrote Assessment rows.

After: it additionally exports `AssessmentSafetyLifecycleService`, registered in the narrow `AssessmentSafetyLifecycleModule`. Its capability-oriented API is:

- `currentAssessmentId`
- `suspendForSafety`
- `resumeAfterSafety`

It does not expose the full Assessment lifecycle service or arbitrary state mutation.

## 5. Assessment to Profile writes removed

Deleted `AssessmentOnboardingService`, which previously owned foreign persistence. Assessment lifecycle and submit services now call Profile-owned guard, progress, completion, hold-read, and activity capabilities through `profile.public.ts`. No Assessment source directly writes OnboardingState.

## 6. Safety to Profile writes removed

Safety now calls `placeOnSafetyHold` and `releaseSafetyHoldToAssessment`. Safety guard context is assembled by `ProfileLifecycleService`. Safety no longer reads or writes OnboardingState directly.

The predecessor behavior was preserved exactly: Assessment transitions retain their previous state-touch behavior, while Safety hold/release remain complete no-ops outside `SAFETY_HOLD` or `ASSESSMENT_IN_PROGRESS`.

## 7. Safety to Assessment writes removed

HIGH_RISK suspension calls `AssessmentSafetyLifecycleService.suspendForSafety`. Re-entry uses `currentAssessmentId` for the SafetyEvaluation association and `resumeAfterSafety` for the conditional `SUSPENDED → IN_PROGRESS` transition. Safety contains no direct Assessment write.

## 8. Cross-module reads retained and why

- CoachingEligibilityService reads OnboardingState for downstream access composition.
- ConversationAccessService reads OnboardingState for downstream access composition.
- SafetyDeletionService reads incomplete Assessment IDs to scope Safety retention cleanup.

These are read-only, do not select persistence transitions, and were deferred to keep this write-ownership phase narrow. Retention reads will be reconsidered during the next Retention ownership phase.

## 9. Transaction and atomicity analysis

Before Phase 06, cross-owner operations were already sequential and not one cross-table transaction:

- SafetyEvaluation append used its own transaction for prior-current flip plus new evaluation.
- Assessment suspension occurred afterward as a separate write.
- Onboarding SAFETY_HOLD occurred afterward as a separate write.
- Re-entry evaluation persistence, Assessment resume, and onboarding release were separate writes.
- Assessment scoring/result/state/completion writes were sequential rather than one cross-module transaction.

Phase 06 preserves this exact ordering and transaction boundary. No previously atomic operation was split, and no transaction context or generic UnitOfWork was introduced.

## 10. Circular dependency analysis

A direct `SafetyModule → AssessmentModule` import would cycle with the existing `AssessmentModule → SafetyModule` decision dependency. Phase 06 instead introduced `AssessmentSafetyLifecycleModule`, which owns only Assessment persistence and imports neither Safety nor Profile.

The resulting Nest graph is acyclic and uses no `forwardRef()`. No port was introduced merely to conceal a cycle.

## 11. Final module dependency graph

```text
AssessmentModule -> SafetyModule
AssessmentModule -> ProfileModule
SafetyModule -> ProfileModule
SafetyModule -> AssessmentSafetyLifecycleModule

AssessmentSafetyLifecycleModule -X-> SafetyModule
AssessmentSafetyLifecycleModule -X-> ProfileModule
```

Assessment requests Safety decisions; Safety requests narrow Profile and Assessment owner transitions.

## 12. Public entry-point changes

- Added `profile/profile.public.ts`.
- Extended `assessment/assessment.public.ts` with `AssessmentSafetyLifecycleService`.
- Preserved all Phase 04 result exports.
- Did not change `safety/safety.public.ts`.

## 13. Nest module export changes

- `ProfileModule` now provides/exports `ProfileLifecycleService`.
- New `AssessmentSafetyLifecycleModule` provides/exports only `AssessmentSafetyLifecycleService`.
- `SafetyModule` imports ProfileModule and AssessmentSafetyLifecycleModule.
- No duplicate provider, concrete repository export, or manual service construction was added.

## 14. Production ownership scan results

Write-operation scans passed:

- no OnboardingState create/update/updateMany/upsert/delete/deleteMany outside Profile;
- no direct Prisma Assessment/AssessmentAnswer/AssessmentResult write outside Assessment;
- no direct Prisma SafetyEvaluation write outside Safety.

Broad text matching produced Retention false positives such as `this.assessment.deleteExpired`; inspection confirmed these call the existing deletion port, not Prisma.

## 15. Assessment regression results

Focused final unit/contract run: 18 files passed, 162 tests passed. Assessment coverage includes scoring, result mapping/service, lifecycle contracts, submit idempotency, restart/resume, definition-version handling, suspension/resumption, result creation, and onboarding completion.

## 16. Safety regression results

Safety classifier, public-boundary, contract, routing, re-entry, hold, approved copy, persistence, and conversation Safety coverage passed. NORMAL, DISTRESS, HIGH_RISK, and CRISIS behavior remain covered. Conversation Safety routes continue to bypass RAG/LLM.

## 17. Profile regression results

Profile validation, onboarding guard, onboarding contract, completion state, protected ordering, and the new lifecycle owner tests passed. Direct tests pin completion timestamps, Safety predecessor no-op behavior, and owner-managed transitions.

## 18. Coaching and Conversation access regression results

Representative Coaching eligibility/plan and Conversation access/send/Safety tests passed. Completed onboarding grants access, SAFETY_HOLD blocks expected paths, and re-entry restores Assessment progress exactly as before.

Combined final E2E run: 7 files passed, 30 tests passed. The first baseline attempt had a transient Vitest worker exit after 6/7 files and 29/30 tests; its unchanged rerun passed. The last verification likewise had a worker exit after 6/7 files with no assertion failure, and its unchanged rerun passed 7/7 files and 30/30 tests.

## 19. Typecheck and build results

- `npx tsc --noEmit -p tsconfig.build.json`: passed
- `npx nest build`: passed

## 20. Scoped lint results

Profile, Assessment, Safety, and affected unit/contract tests: passed.

## 21. Project-wide lint

`npx eslint .`: passed.

## 22. git diff --check

Passed. Existing LF-to-CRLF working-copy notices were emitted; no whitespace errors were reported.

## 23. Proof onboarding behavior did not change

Capability methods reproduce the exact predecessor lists, targets, currentStep values, updatedAt, and lastActivityAt writes from the removed foreign implementations. Tests directly pin Assessment completion and Safety disallowed-predecessor no-op semantics. Profile/onboarding contracts and all selected E2E flows passed.

## 24. Proof Assessment lifecycle behavior did not change

Suspension still conditionally updates only `IN_PROGRESS|NOT_STARTED` to `SUSPENDED` using the same timestamp. Resume still selects the same current user Assessment and only updates `SUSPENDED` to `IN_PROGRESS`. Stale/non-suspended state remains a no-op. Assessment start, save, restart, submit, scoring, result, definition compatibility, and idempotency tests passed.

## 25. Proof Safety hold and re-entry behavior did not change

SafetyEvaluation persistence remains append-only and transactionally flips the prior current row before creating the new one. HIGH_RISK still suspends and holds; CRISIS still leaves Assessment conceptually interrupted while holding onboarding. NORMAL/DISTRESS re-entry still resumes a suspended Assessment before releasing onboarding. HIGH_RISK/CRISIS re-entry still retains hold without state changes. Safety and E2E regressions passed.

## 26. Proof previous hardening phases remain intact

Static scans passed:

- no new Auth deep imports;
- external Safety consumers use `safety.public.ts`;
- AI has no Coaching/Conversations reverse dependency;
- Coaching retains the Assessment public result boundary;
- Retrieval remains the sole Python RAG transport owner;
- no `forwardRef()` was introduced.

## 27. Ownership issues intentionally deferred

- Coaching and Conversation direct read-only OnboardingState eligibility composition.
- Safety retention’s read-only Assessment cutoff lookup.
- Retention deletion orchestration and ownership.
- final automated boundary enforcement.

No Prisma schema, HTTP API, DTO, scoring, question definition, Safety classification/copy, state name, state timing, error code, AI, RAG, prompt, Coaching generation, Conversation behavior, or frontend code changed.

## 28. Retention hardening confirmation

Retention code and its existing owner deletion ports were not modified. Retention Ownership Hardening was not started.

## Console summary

Phase 06 moved all Profile onboarding writes into `ProfileLifecycleService`, all Safety-driven Assessment writes into `AssessmentSafetyLifecycleService`, avoided the Assessment/Safety module cycle without `forwardRef()`, preserved exact transition and transaction behavior, and passed focused tests (18 files/162 tests), E2E (7 files/30 tests), typecheck, build, scoped/full lint, ownership scans, prior-boundary scans, and diff checks. Retention hardening was not started.
