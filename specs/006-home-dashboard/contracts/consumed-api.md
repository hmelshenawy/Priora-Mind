# Consumed API Contract: Post-Onboarding Home Dashboard

**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

Spec 006 introduces **no new API contract**. This document lists the existing backend contracts the Home Dashboard consumes, confirming that every capability required by the spec already exists (SC-001). All calls go through the existing `api-client.ts` → `ApiService` → feature API services (no direct `fetch` from components; no RAG/LLM/Qdrant/Python calls — SC-010).

## Coaching API — `coachingApi` (`features/coaching/coaching.api.ts`)

Base path: `/api/v1/coaching/plan` (guarded by `JwtAuthGuard` + `EmailVerifiedGuard` on the backend).

| Method & path | Frontend method | Home Dashboard use | Response type |
|---|---|---|---|
| `POST /api/v1/coaching/plan` | `startGeneration()` | Start/retry plan generation (FR-006, FR-007); also called by the preserved auto-start effect | `CoachingPlanApiResponse` |
| `GET /api/v1/coaching/plan` | `getPlan()` | Read current plan state (every Home Dashboard load) | `CoachingPlanApiResponse` |
| `POST /api/v1/coaching/plan/accept` | `acceptPlan()` | Accept a proposed plan (FR-009) | `AcceptPlanResponse` |
| `PATCH /api/v1/coaching/plan/actions/:action_id` | `updateAction(actionId, body)` | Continue plan / mark action (FR-010) | `UpdateActionResponse` |

`startOrGet` semantics (backend, unchanged): creates a new plan only when there is no current plan **or** the assessment `resultId` differs from the plan's `sourceResultId`. A `COMPLETED` plan with an unchanged assessment result is returned as-is — no replacement plan is created. This is why the completed-plan experience offers review + continue-chat, not new-plan generation (FR-010a, spec Assumptions).

### Error codes consumed (mapped by the existing `resolveDashboardView`)

| Code | HTTP | Home Dashboard state | Coaching action offered? |
|---|---|---|---|
| `PLAN_NOT_FOUND` | 404 | `startable` (or `starting` if start pending) / `firstRun` if the conversations query **succeeds** with 0 active conversations (AD-9; not asserted while conversations is loading/errored) | Start (auto-start preserved — the single generation flow) |
| `PLAN_UNAVAILABLE` | 503 | `failedRetryable` (`retryable: true`, current backend) or `unavailable` | Retry only if `retryable` |
| `PLAN_NOT_READY` | 409 | `notReady` | None (manual refetch only) |
| `PLAN_NOT_ACTIVE` | 409 | `notActive` | None (manual refetch only) |
| `SAFETY_HOLD` | 409 | `safetyHold` → redirect `/safety/hold` | None |
| `ONBOARDING_STEP_BLOCKED` | 403 | `ineligible` → redirect `routeForStep(nextStep)` | None |
| `RESULT_NOT_FOUND` | 404 | `noAssessment` | None |
| `UNAUTHENTICATED` | 401 | handled by `api-client.ts` transparent refresh → `/login` | None |
| `EMAIL_NOT_VERIFIED` | 403 | existing redirect behavior | None |
| `ACTION_CONFLICT` | 409 | handled by existing mutation `onError` invalidate | — |
| 429 / 5xx | — | bounded retry via `shouldRetryPlanQuery`; persistent → `error` | Manual retry only |

No new error handling is introduced (FR-026).

## Conversation API — `conversationApi` (`features/chat/chat.api.ts`)

Base path: `/api/v1/conversations`.

| Method & path | Frontend method | Home Dashboard use | Response type |
|---|---|---|---|
| `GET /api/v1/conversations?includeArchived=false&limit=5` | `getRecentConversations(HOME_RECENT_CONVERSATIONS_LIMIT)` **(NEW dedicated helper in `features/home/home.api.ts`; `HOME_RECENT_CONVERSATIONS_LIMIT = 5`)** | Continue-chat target + recent conversations (FR-017, FR-023) | `ConversationListResponse` |
| `POST /api/v1/conversations` | `create()` (reused from `conversationApi`, unchanged) | Start a new conversation (FR-019) | `ConversationMutationResponse` |

**No change to the existing Chat API.** The existing `conversationApi.list(includeArchived)` and `useConversationListQuery` are **not modified** and remain the Spec 005 sidebar's data path. The Home Dashboard's recent-conversations needs are met by a dedicated helper, `getRecentConversations(limit)`, which calls the **same existing backend endpoint** (`GET /api/v1/conversations`) with `includeArchived=false&limit=${limit}` via the shared `apiFetch` (same auth/refresh path as every feature). No DTO is changed (`ConversationListResponse`, `ConversationSummaryDto` are consumed as-is). No `features/chat/*` file is edited. The backend already supports `limit` (spec Assumptions).

`ConversationListResponse`: `{ items: ConversationSummaryDto[]; nextCursor: string | null }`. The Home Dashboard reads only `items` (no cursor pagination needed for a bounded recent list). Items are sorted by the backend `updatedAt desc, id desc` — the Home Dashboard relies on this ordering and does **not** re-sort (FR-017). The dedicated `useRecentConversationsQuery(HOME_RECENT_CONVERSATIONS_LIMIT)` hook uses its own query key (`['chat','conversations','recent',{limit}]`) — a **descendant** of `['chat','conversations']` — so it never perturbs the sidebar's cache. **Verified invalidation (inspected `chat-hooks.ts`):** every existing conversation mutation (`useCreateConversationMutation`, `useSendMessageMutation`, `useSetArchivedMutation`, `useDeleteConversationMutation`) calls `invalidateQueries({ queryKey: ['chat','conversations'] })`; TanStack Query v5 prefix-matches by default, so each already invalidates the recent query. **No additional invalidation is required.** Retry: `retry: false`, no `refetchInterval` (no polling), manual refetch via the chat region's retry control on error (AD-6).

`ConversationMutationResponse`: `{ conversation: ConversationSummaryDto }`. The Home Dashboard navigates to `/chat/{conversation.id}` on success, matching the existing `ChatPageView` pattern (FR-019, FR-020). `useCreateConversationMutation` is reused unchanged.

## Frontend-only state contract

See [frontend-state-contract.md](./frontend-state-contract.md) for the presentation-only `HomeDashboardState` / `PrimaryAction` model. This is not an API contract; it is a pure frontend derivation over the two responses above.