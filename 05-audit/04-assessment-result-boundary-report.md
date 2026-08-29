# Boundary Hardening Phase 04: Assessment Result Public Boundary

Date: 2026-08-10  
Scope: Assessment result consumption by downstream backend modules, especially Coaching  
Status: Complete; Phase 05 was not started

## 1. Before Assessment public result surface

Assessment had no intentional TypeScript entry point for result consumption. `AssessmentModule` already exported the correct runtime capability, `AssessmentResultService`, alongside the justified `ASSESSMENT_DELETION_PORT`, but Coaching imported the service, DTO, and exception from implementation paths.

Pre-change production cross-module Assessment imports were:

| Consumer | Symbol | Path | Classification |
|---|---|---|---|
| CoachingModule | AssessmentModule | `assessment/assessment.module` | NestJS module |
| CoachingEligibilityService | AssessmentResultService | `assessment/services/assessment-result.service` | service |
| CoachingEligibilityService | ScoredResultDto | `assessment/dto/assessment.dto` | DTO/type |
| CoachingEligibilityService | ResultNotFoundException | `assessment/constants/assessment.errors` | error |
| CoachingGenerationService | ScoredResultDto | `assessment/dto/assessment.dto` | DTO/type |
| CoachingGroundingService | ScoredResultDto | `assessment/dto/assessment.dto` | DTO/type |
| RetentionModule | AssessmentModule | `assessment/assessment.module` | NestJS module |
| RetentionService | ASSESSMENT_DELETION_PORT, AssessmentDeletionPort | `assessment/ports/assessment-deletion.port` | justified deletion port |
| AccountDeletionService | ASSESSMENT_DELETION_PORT, AssessmentDeletionPort | `assessment/ports/assessment-deletion.port` | justified deletion port |

The pre-change regression baseline passed: 11 test files, 92 tests.

## 2. After Assessment public result surface

`src/modules/assessment/assessment.public.ts` is now the intentional TypeScript surface for normal Assessment result consumers. Coaching continues to import `AssessmentModule` for NestJS wiring and imports all result symbols from `assessment/assessment.public`.

The dependency is now:

```text
CoachingModule
  -> AssessmentModule
  -> AssessmentResultService
  -> ScoredResultDto (Assessment-owned public result view)
```

No result port, shared domain package, repository, or data-ownership abstraction was introduced.

## 3. Coaching to Assessment dependencies before and after

| Consumer | Before | After |
|---|---|---|
| CoachingModule | `assessment/assessment.module` | unchanged; correct NestJS module import |
| CoachingEligibilityService | deep service path | `assessment/assessment.public` |
| CoachingEligibilityService | deep DTO path | `assessment/assessment.public` |
| CoachingEligibilityService | deep error path | `assessment/assessment.public` |
| CoachingGenerationService | deep DTO path | `assessment/assessment.public` |
| CoachingGroundingService | deep DTO path | `assessment/assessment.public` |

## 4. Final assessment.public.ts exports

The public entry point exports only:

- `AssessmentResultService`
- type-only `ScoredResultDto`
- `ResultNotFoundException`

It does not export lifecycle, submit, scoring, persistence, onboarding, presenter, schema, or mapping internals.

## 5. Assessment result contract decision

`ScoredResultDto` was retained as the public Assessment-owned result contract. Its name and runtime shape were not changed because it already represents the semantic scored-result view consumed by Coaching. Renaming it would add churn without improving the boundary.

The view remains free of Prisma row types and contains the same values Coaching already consumes: result and assessment IDs, definition version, domain scores, strongest/support domains, selected priorities, and goal free text.

## 6. AssessmentResultService API decision

The existing API was already appropriately capability-oriented:

```ts
getScoredResult(userId: string): Promise<ScoredResultDto | null>
```

It selects the latest user-owned result, maps persistence into the Assessment-owned result view, and never exposes a Prisma row. The API was preserved without adding generic repository methods or a second result method.

## 7. Result-not-found and error ownership decision

The nullable service result was preserved. This is the smallest stable semantic mechanism for callers that need different absence behavior.

Coaching has two intentionally different mappings:

- `assertEligible()` maps absence to the existing Assessment-owned `ResultNotFoundException` (`RESULT_NOT_FOUND`).
- `getCurrentResultOrNoPlan()` maps absence to Coaching's existing `NoCurrentPlanException` (`NO_CURRENT_PLAN`).

Because the first exception genuinely crosses the module boundary and its behavior must remain unchanged, it is now intentionally exported from `assessment.public.ts`. No domain errors were generically converted to null and no HTTP/error code changed.

## 8. AssessmentModule export changes

No code change was necessary. Before Phase 04, `AssessmentModule` already exported exactly:

- `ASSESSMENT_DELETION_PORT`
- `AssessmentResultService`

These exports remain unchanged. Internal services were not added to the export list.

## 9. Deep result imports removed

All production imports outside Assessment matching these result implementation paths were removed:

- `assessment/services/assessment-result.service`
- `assessment/dto/assessment.dto`
- `assessment/constants/assessment.errors`

A post-change production scan found zero matches outside Assessment.

## 10. Assessment deep imports intentionally deferred

Retention continues to import `assessment/ports/assessment-deletion.port`. This is the already justified deletion capability and is outside normal result consumption.

Other deferred relationships are unchanged:

- Safety lifecycle/state interactions with Assessment
- Assessment onboarding access and Profile ownership
- Retention ownership hardening
- internal Assessment controller/service/DTO relationships

## 11. Assessment unit, contract, and E2E results

Final focused Assessment and Coaching unit/contract run after the boundary change: 12 files passed, 94 tests passed.

New focused `AssessmentResultService` characterization coverage proves:

- no stored result returns `null`;
- lookup is user-scoped and ordered by `createdAt: desc`;
- the latest stored result is mapped to the unchanged `ScoredResultDto` shape.

Relevant E2E run: 4 files passed, 22 tests passed. It included assessment submit idempotency and resume/restart/result coverage.

## 12. Coaching regression results

The focused suite covered Coaching eligibility, generation, grounding, validation/lifecycle support, contract behavior, and the Coaching RAG boundary. The E2E suite covered the normal plan journey, retry, safety hold, incomplete onboarding, retake snapshot behavior, action lifecycle, isolation, returning users, bounded RAG context, and RAG failure behavior.

No Coaching plan or generation implementation was changed; only Assessment imports were redirected.

## 13. Build and typecheck results

- `npx tsc --noEmit -p tsconfig.build.json`: passed
- `npx nest build`: passed

## 14. Scoped lint results

`npx eslint src/modules/assessment src/modules/coaching tests/unit/assessment tests/unit/coaching`: passed.

## 15. Project-wide lint result

`npx eslint .`: passed.

## 16. git diff --check

Passed. Git emitted existing LF-to-CRLF working-copy notices but reported no whitespace errors.

## 17. Proof Coaching no-assessment behavior did not change

The eligibility unit test `returns RESULT_NOT_FOUND when no scored result exists` passed before and after migration. The new service characterization also proves the Assessment service still returns `null` when no row exists. `getCurrentResultOrNoPlan()` remains unchanged and still maps the same null result to `NO_CURRENT_PLAN`.

## 18. Proof scored-result behavior did not change

The service implementation and mapping utility were not changed. The new characterization test verifies the same latest-result query and exact result view fields. Assessment submit idempotency and resume/restart E2E tests passed, including single-result creation, definition-version restart behavior, result 404 for corrupt progress, and user isolation.

## 19. Proof Coaching generation behavior did not change

Generation and grounding logic were not modified. Their parameter type now comes through `assessment.public.ts` but resolves to the same `ScoredResultDto`. Unit coverage for atomic graph persistence, bilingual generation, failure handling, stale attempts, retries, grounding selection, version pinning, and content integrity passed. Coaching plan and RAG E2E coverage passed unchanged.

## 20. Remaining Assessment boundary and ownership issues deferred

Intentionally deferred to later reviewed phases:

- Safety suspend/resume and direct Assessment state writes
- Assessment onboarding Prisma access and Profile state ownership
- Retention deletion ownership consolidation
- broader Assessment lifecycle ownership
- Retrieval consolidation
- any repository introduction

No frontend, Prisma schema, route, DTO shape, scoring, persistence, AI, Auth, Safety public boundary, or provider behavior was changed. Phase 05 Retrieval Boundary Hardening was not started.

## Concise summary

Phase 04 added one intentional Assessment result entry point, migrated all Coaching result imports to it, preserved the existing result service/type/error behavior, left the already-correct module exports unchanged, and introduced direct characterization coverage. All requested focused tests, E2E tests, compiler/build gates, lint gates, and diff hygiene checks passed. Work stopped after Phase 04.
