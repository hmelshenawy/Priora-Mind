# Data Model: Post-Onboarding Home Dashboard

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Persistence impact

**None.** Spec 006 adds no database tables, no migrations, no DTOs, and no backend entities. The Home Dashboard is a read-and-navigate frontend surface. No state is persisted client-side (FR-025, FR-031). This section documents the **frontend-only presentation model** and the **existing entities consumed** (read-only).

## Existing entities consumed (read-only, unchanged)

### CoachingPlan (owned by the backend Coaching module)

The Home Dashboard reads the existing coaching-plan API response and maps it via the existing `resolveDashboardView` (no new mapping).

- `generationStatus`: `'PENDING' | 'GENERATING' | 'READY' | 'FAILED'` — generation progress.
- `planStatus`: `'PROPOSED' | 'ACTIVE' | 'COMPLETED' | null` — lifecycle (nullable until `READY`).
- When `generationStatus === 'READY'`: full `CoachingPlanResponse` (title, summary, focus_areas, goals, actions, progress, disclaimer — all `Bilingual`).
- When not `READY`: `GenerationStatusResponse` (`{ plan_id, generationStatus }`).

**Two-status rule preserved (SAD §7)**: `FAILED` is a generation status, never a plan lifecycle status. The Home Dashboard maps `FAILED` to the `failedRetryable`/`unavailable` *display* states only (FR-004).

### ConversationSummary (owned by the backend Conversation module)

`ConversationSummaryDto` (from `@priora/shared-types`), unchanged:

| Field | Type | Home Dashboard use |
|---|---|---|
| `id` | string | continue-chat navigation target (`/chat/{id}`); recent-conversation link |
| `title` | string \| null | recent-conversation label (fallback to date, matching existing `labelFor`) |
| `status` | `'ACTIVE' \| 'ARCHIVED'` | filter to `ACTIVE` for continue-chat target (includeArchived=false) |
| `createdAt` | string | recent-conversation fallback label |
| `updatedAt` | string | consumed implicitly via server-side `updatedAt desc` ordering |
| `lastMessageAt` | string \| null | available; not required for MVP rendering |

**Server-side ordering (relied upon, not duplicated)**: `GET /conversations` returns items sorted by `updatedAt desc, id desc`. The Home Dashboard treats `items[0]` (with `includeArchived=false`) as the deterministic continue-chat target (FR-017).

## Frontend-only presentation model (new, non-persistent)

This model lives entirely in `features/home/`, split across three focused pure modules (AD-10): the `HomeDashboardState` type and `resolveHomeDashboardView` in `home-dashboard-state.ts`, the `PrimaryAction` type and `resolvePrimaryAction` in `home-primary-action.ts`, and `selectContinueChatTarget` in `home-chat.ts`. The state model is **not redesigned** by the split — types and functions are unchanged, only relocated. It is **presentation-only**: it is not a domain entity, is not persisted, and introduces no backend field (Constitution IV, VIII; FR-035).

### `HomeDashboardState`

A superset of the existing `CoachingDashboardView` plus one composite UX state:

```ts
type HomeDashboardState =
  | 'loading'
  | 'firstRun'          // NEW composite: startable (no plan) AND zero active conversations
  | 'startable'
  | 'starting'
  | 'pending'
  | 'generating'
  | 'failedRetryable'
  | 'unavailable'
  | 'noAssessment'
  | 'safetyHold'
  | 'ineligible'
  | 'notReady'
  | 'notActive'
  | 'readyProposed'
  | 'readyActive'
  | 'readyCompleted'
  | 'error';
```

**Derivation** (`resolveHomeDashboardView`, pure — lives in `home-dashboard-state.ts`, AD-10) — input is `{ coachingView, conversationsQuery: { status, items } }`, where `status` is the recent-conversations query status (`'loading' | 'success' | 'error'`) and `items` is its result. `firstRun` is asserted **only** on complete data:

| Coaching view | Conversations query | Home Dashboard state |
|---|---|---|
| `startable` | `success` + 0 items | `firstRun` |
| `startable` | `loading` | `startable` (chat region shows loading; `firstRun` not asserted on incomplete data) |
| `startable` | `error` | `startable` (chat region shows error + retry; `firstRun` not asserted) |
| `startable` | `success` + ≥ 1 item | `startable` |
| any other | any | the coaching view unchanged |

`firstRun` is the **only** composite state. "Plan exists but no conversations" (FR-002b) is **not** a separate state — the coaching view (e.g. `readyActive`) renders normally and the chat region shows a "not started yet" prompt. This keeps the state machine honest (FR-004: no new lifecycle states). Partial query failures degrade per region (AD-9): the plan region depends only on the coaching query; the chat region only on the conversations query; one failing never blocks the other.

### `PrimaryAction`

```ts
type PrimaryAction =
  | 'generate-plan'
  | 'generate-first-plan'
  | 'accept-plan'
  | 'continue-plan'
  | 'review-completed-plan'
  | 'retry'
  | 'none';
```

**Mapping** (`resolvePrimaryAction`, pure — implements FR-035; lives in `home-primary-action.ts`, AD-10):

| State | PrimaryAction |
|---|---|
| `firstRun` | `generate-first-plan` |
| `startable` | `generate-plan` |
| `starting` / `pending` / `generating` | `none` |
| `readyProposed` | `accept-plan` |
| `readyActive` | `continue-plan` |
| `readyCompleted` | `review-completed-plan` |
| `failedRetryable` | `retry` |
| `unavailable` / `notReady` / `notActive` / `error` | `none` (existing manual retry remains as a secondary control where it exists today) |
| `noAssessment` / `safetyHold` / `ineligible` | `none` (follow existing safety/eligibility guidance) |
| `loading` | `none` |

**Rendering rule (FR-036a, no competing actions)**: a Home-level primary CTA *button* is rendered **only** for the non-READY actionable states — `firstRun` (`generate-first-plan`), `startable` (`generate-plan`), `failedRetryable` (`retry`) — where `CoachingPlanView` is not shown. For the READY states (`readyProposed`/`readyActive`/`readyCompleted`), **no Home-level CTA button is rendered**; `CoachingPlanView`'s own built-in action (accept for PROPOSED; continue-chat + action controls for ACTIVE/COMPLETED) IS the single primary action. For READY states the `PrimaryAction` value drives only a short **guidance label**, never a duplicate button. This eliminates the duplicate accept action without modifying `CoachingPlanView` (AD-2/AD-4).

### Continue-chat target (`selectContinueChatTarget`, pure — lives in `home-chat.ts`, AD-10)

Input: `ConversationSummaryDto[]` (active only, sourced from the dedicated `useRecentConversationsQuery(HOME_RECENT_CONVERSATIONS_LIMIT)` — **not** the Spec 005 `useConversationListQuery`; `HOME_RECENT_CONVERSATIONS_LIMIT = 5` is the single deterministic limit). Output: `ConversationSummaryDto | undefined` = `items[0]`, or `undefined` when empty. Deterministic; no client-side sort.

### Validation rules (presentation)

- Exactly one primary action is prominent per state (FR-036a): for non-READY actionable states the plan region renders the single Home-level CTA button (`generate-first-plan`/`generate-plan`/`retry`); for READY states `CoachingPlanView`'s own action is the single dominant action and the Home Dashboard renders **no** competing CTA button (only a guidance label). Secondary chat actions are visually subordinate.
- Rendering order is strict (FR-032/FR-033): P1 coaching status → P2 primary action → P3 continue/start chat → P4 recent conversations. Priority-4 must not displace P1/P2 above the fold.
- `readyCompleted` MUST use "review your completed plan" wording and MUST NOT offer a new-plan action (FR-010a) — enforced by the `review-completed-plan` action mapping and the plan region's render branch.

## State transitions (frontend display only)

Transitions are driven entirely by the next coaching/conversation API response (US10). No client-initiated lifecycle transition exists except the existing mutations (start/accept/update-action), which call the backend and let the response drive the next state:

- `startable`/`firstRun` → (auto-start effect — the **single** generation flow; the explicit start affordance is the same mutation, used only as the pre-auto-start/`failed-retryable` fallback) → `starting` → `pending`/`generating` → `readyProposed` (on `READY`).
- `readyProposed` → (accept mutation) → `readyActive`.
- `readyActive` → (action updates) → `readyCompleted` (when backend reports `COMPLETED`).
- `failedRetryable` → (explicit retry CTA) → `starting` → … ; or → `unavailable` (non-retryable, not reachable today per Assumptions but retained).
- Any state → safety/eligibility redirect on the corresponding backend error code (route-level effect, unchanged).

No transition is taken on terminal states without an explicit user action (FR-011, SC-004).