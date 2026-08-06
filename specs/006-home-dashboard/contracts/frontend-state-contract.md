# Frontend State Contract: Post-Onboarding Home Dashboard

**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

This is **not** a network/API contract. It documents the pure, non-persistent, presentation-only state the Home Dashboard derives from the existing coaching-plan and conversation-list responses (Constitution IV, VIII; FR-035). It is the contract between three focused pure modules — `home-dashboard-state.ts`, `home-primary-action.ts`, `home-chat.ts` (AD-10) — and the view components (`home-dashboard-view.tsx`, `home-plan-region.tsx`, `home-chat-region.tsx`).

## Module: `features/home/home-dashboard-state.ts` (state derivation only — AD-10)

### Types

```ts
import type { ConversationSummaryDto } from '@priora/shared-types';
import type { CoachingDashboardView } from '../coaching/coaching-dashboard-state';

export type HomeDashboardState =
  | CoachingDashboardView        // loading, startable, starting, pending, generating,
                                 // failedRetryable, unavailable, noAssessment, safetyHold,
                                 // ineligible, notReady, notActive, readyProposed,
                                 // readyActive, readyCompleted, error
  | 'firstRun';                  // composite: startable + zero active conversations
```

### Functions (pure, no React, no I/O)

```ts
resolveHomeDashboardView(input: {
  coachingView: CoachingDashboardView;
  conversationsQuery: { status: 'loading' | 'success' | 'error'; items: ConversationSummaryDto[] };
}): HomeDashboardState;
```
- Returns `firstRun` when `coachingView === 'startable'` **and** `conversationsQuery.status === 'success'` **and** `conversationsQuery.items.length === 0`.
- While `conversationsQuery.status` is `'loading'` or `'error'`, returns `startable` (not `firstRun`) — `firstRun` is never asserted on incomplete data (AD-9, partial-failure isolation).
- Otherwise returns `coachingView` unchanged.

## Module: `features/home/home-primary-action.ts` (primary-action rule — AD-10)

### Types

```ts
import type { HomeDashboardState } from './home-dashboard-state';

export type PrimaryAction =
  | 'generate-plan'
  | 'generate-first-plan'
  | 'accept-plan'
  | 'continue-plan'
  | 'review-completed-plan'
  | 'retry'
  | 'none';
```

### Functions (pure, no React, no I/O)

```ts
resolvePrimaryAction(state: HomeDashboardState): PrimaryAction;
```
- Implements the FR-035 mapping (see data-model.md). Returns `none` for waiting/guidance/terminal-non-retryable states. Imports the `HomeDashboardState` type from `home-dashboard-state.ts` (one-directional, no cycle).

## Module: `features/home/home-chat.ts` (continue-chat target rule — AD-10)

### Functions (pure, no React, no I/O)

```ts
import type { ConversationSummaryDto } from '@priora/shared-types';

selectContinueChatTarget(
  activeConversations: ConversationSummaryDto[]
): ConversationSummaryDto | undefined;
```
- Returns `activeConversations[0]` (server-sorted `updatedAt desc, id desc`) or `undefined` when empty. Deterministic; no client-side sort. Imports only `ConversationSummaryDto`.

### Guarantees (all three modules)

- No function reads `Date.now()`, `Math.random()`, network, or storage — fully deterministic and unit-testable.
- No new coaching lifecycle state is introduced (FR-004); `firstRun` is a composite UX state only.
- No backend field is introduced (FR-035); `PrimaryAction` is a frontend presentation rule.
- The state model is **not redesigned** by the three-way split (AD-10): types and functions are unchanged from the single-module design, only relocated into focused files. Dependencies are one-directional (`home-primary-action.ts` → `home-dashboard-state.ts`; `home-chat.ts` → shared-types only) — no cycles. Each file is far under the 300-line limit.
- The view components render regions in the strict FR-032 order. **CTA rendering rule (FR-036a, no competing actions):** a Home-level CTA *button* is rendered only for the non-READY actionable states (`firstRun`/`startable`/`failedRetryable`); for the READY states `CoachingPlanView`'s own built-in action (accept for PROPOSED; continue-chat + action controls for ACTIVE/COMPLETED) is the single primary action and the Home Dashboard renders **no** competing button — `PrimaryAction` drives only a guidance label for READY states.
- **Orchestration, not reimplementation (AD-0):** the contract imports and composes `CoachingPlanView`, the coaching hooks, `useCreateConversationMutation`, and the `ConversationSummaryDto` shape; it does not re-implement the coaching state machine, plan rendering, conversation-list actions, chat state handling, polling, mutations, or routing.

## View component contract (props summary)

### `HomeDashboardView` (orchestrator)

Consumes (via hooks): `useCoachingPlanQuery` (reused unchanged), `useRecentConversationsQuery(HOME_RECENT_CONVERSATIONS_LIMIT)` (NEW, dedicated key, `retry: false`, no `refetchInterval`), and the reused mutations `useStartGenerationMutation`, `useAcceptPlanMutation`, `useUpdateActionStatusMutation`, `useCreateConversationMutation`. It does **not** consume `useConversationListQuery` (the Spec 005 sidebar's hook) and does **not** re-implement any coaching/chat logic. Renders `<HomePlanRegion/>` then `<HomeChatRegion/>` inside a `<main>` with a welcome header, in FR-032 order. Mounts a `useEffect` that scrolls `#coaching-plan` into view on hash change (and on initial mount when a hash is present) for reliable Plan-anchor navigation (AD-5). Each region renders its own loading/empty/error surface so a failure in one query never blocks the other (AD-9).

### `HomePlanRegion`

Props: the coaching query state (`data`, `error`), the resolved `HomeDashboardState`, the `PrimaryAction`, mutation handles (`onStart`, `onAccept`, `onUpdateAction`, `onRefetch`), pending flags, and `CoachingPlanView` labels. Always renders the synchronous wrapper `<section id="coaching-plan">` (anchor target present from first paint for every state). For READY states renders `<CoachingPlanView/>` (reused, **not modified**) and **no** Home-level CTA button — `CoachingPlanView`'s own action is the primary; `PrimaryAction` drives only a guidance label. For non-ready actionable states renders a compact `StateCard` plus the single Home-level CTA button (`generate-first-plan`/`generate-plan`/`retry`).

### `HomeChatRegion`

Props: `continueTarget: ConversationSummaryDto | undefined`, `recent: ConversationSummaryDto[]`, `conversationsQueryStatus: 'loading' | 'success' | 'error'`, `onContinue(id)`, `onStartNew()`, `onOpenList()`, `onRetryConversations()`, labels. Renders the continue-chat card (FR-017), start-new-conversation (FR-019), open-conversations (FR-018), recent list (FR-023, read-only), and the FR-002b "start your first conversation" prompt when a plan exists but `continueTarget` is undefined. Renders its **own** loading/empty/error surface (AD-9): a loading skeleton while the query loads, a query-error card with a manual retry (`onRetryConversations` → `refetch()`) on error — never hiding the plan region.

### `AppShell` (`features/home/app-shell.tsx`) — AD-11

Props: `{ children: ReactNode }`. Renders `<TopNav/>` above `{children}` and **nothing else**. It deliberately does **NOT** impose a page container, `min-h-screen`, or a `<main>` landmark: the dashboard page and the chat page each own their own `<main>`/container/height, and the chat page's root is `<main className="min-h-screen …">` (Spec-005-preserved) — wrapping it in a shared min-height/container would change chat's layout and violate the no-Spec-005-change constraint. So `AppShell` is effectively `<TopNav/> + {children}`. **Composed only by two co-located layouts** — `app/[locale]/(protected)/dashboard/layout.tsx` and `app/[locale]/(protected)/chat/layout.tsx` (the latter covers `/chat` and `/chat/[conversationId]`), each rendering `<AppShell>{children}</AppShell>` — so the chrome never appears on Assessment, Onboarding, Safety, Profile, Settings, or future protected pages, and no existing `page.tsx` is edited to add it. No routing layer is added and URLs are unchanged.

### `TopNav` (`home-top-nav.tsx`)

Props: none (reads `usePathname` **plus the URL hash** — via a client effect, since `usePathname` excludes the hash — to mark the active link: Home active on `/dashboard` without `#coaching-plan`, Plan active on `/dashboard#coaching-plan`, Chat active on `/chat*`). Renders an accessible `<nav>` with Home (`/dashboard`), Plan (`/dashboard#coaching-plan`), Chat (`/chat`) links via the locale-aware `Link`. `aria-current="page"` on the active link. **Rendered only by `AppShell`** (and therefore only present on the Home/Plan/Chat boundary above). Plan-anchor scroll reliability is handled by `HomeDashboardView`'s hash `useEffect` (the plan region wrapper `<section id="coaching-plan">` is always rendered synchronously), not by relying on the browser's native hash scroll (AD-5).