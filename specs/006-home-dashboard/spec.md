# Feature Specification: Post-Onboarding Home Dashboard

**Feature Branch**: `006-home-dashboard`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "Create a clear post-onboarding home experience that connects the existing coaching plan and chatbot features. The current dashboard does not provide a complete home experience or clear next actions when the coaching plan is unavailable or failed."

## Summary

The Home Dashboard is the **primary authenticated landing page** users reach after login and onboarding — not merely a coaching-plan page. It is the central hub that connects the four things a post-onboarding user cares about: their **coaching plan**, the **chatbot**, their **next action**, and their **recent activity**.

Today the Home Dashboard renders only the coaching-plan state machine and an "open chat" link, so a user with no plan, a failed plan, or no conversations lands on a sparse or unclear screen with no surrounding Home Dashboard context. Spec 006 turns that coaching-plan page into the Home Dashboard: it keeps the existing coaching-plan state model and existing Conversation API exactly as they are, and surrounds them with a Home Dashboard shell that explains the user's current state, recommends the single next action, and offers clear chat entry points.

The Home Dashboard is a read-and-navigate surface only. It consumes existing coaching-plan and Conversation capabilities, invents no new backend APIs or lifecycle states, and remains fully aligned with Spec 004 (conversation AI/RAG) and Spec 005 (frontend chatbot).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See my current coaching state and next action (Priority: P1)

A post-onboarding user who has completed onboarding opens the Home Dashboard — the primary authenticated landing page after login and onboarding. Instead of being dropped into a coaching-plan view with no surrounding context, they land on the Home Dashboard that connects their coaching plan, the chatbot, next actions, and recent activity. It gives them a clear overview of where they are right now: a welcome/header area, the current state of their coaching plan, and the single most important action they should take next. The Home Dashboard surfaces the existing coaching-plan state — no plan, pending, generating, ready-but-not-accepted, active, completed, failed, or unavailable — exactly as the backend reports it, and recommends the matching next action (start a plan, wait for generation, accept the plan, continue an active plan, review a completed plan, retry a failed plan, or read safety/eligibility guidance).

**Why this priority**: This is the foundational Home Dashboard experience. Every other story depends on the Home Dashboard shell existing and correctly reflecting the authoritative coaching-plan state. Without it, the Home Dashboard is still just a coaching-plan widget with no Home Dashboard context or clear next action.

**Independent Test**: Can be fully tested by logging in as a post-onboarding user in each coaching-plan state and verifying the Home Dashboard renders the correct state label, the correct recommended next action, and the welcome/header — without exercising any chat feature.

**Acceptance Scenarios**:

1. **Given** a post-onboarding user with no coaching plan, **When** they open the Home Dashboard, **Then** the Home Dashboard shows a welcome area, a plan card in the "no plan / startable" state, and a recommended next action of "start your coaching plan".
2. **Given** a post-onboarding user whose plan generation is in progress (`PENDING` or `GENERATING`), **When** they open the Home Dashboard, **Then** the Home Dashboard shows the plan card in the "generating" state and a recommended next action of "wait for your plan", and the page does not offer a start/retry action.
3. **Given** a post-onboarding user with a `READY` plan in `PROPOSED` state, **When** they open the Home Dashboard, **Then** the Home Dashboard shows the plan summary and a recommended next action of "accept your plan".
4. **Given** a post-onboarding user with an `ACTIVE` plan, **When** they open the Home Dashboard, **Then** the Home Dashboard shows the plan progress and a recommended next action of "continue your plan".
5. **Given** a post-onboarding user with a `COMPLETED` plan, **When** they open the Home Dashboard, **Then** the Home Dashboard shows the completed plan and a recommended next action of "review your completed plan" (not "continue your plan"), alongside the standing option to continue coaching through chat.

---

### User Story 2 - Start plan generation when no plan exists (Priority: P1)

A user with no coaching plan can start plan generation from the Home Dashboard. The Home Dashboard offers an explicit "start your coaching plan" action in the no-plan state. Triggering it asks the backend to begin generation using the existing coaching-plan generation capability; the Home Dashboard then reflects the pending/generating state and polls for progress only while the backend reports `PENDING` or `GENERATING`.

**Why this priority**: Plan generation is the core product entry point. A user with no plan must be able to begin one directly from the Home Dashboard without navigating elsewhere.

**Independent Test**: Can be tested by using a freshly onboarded account with no plan and verifying the start action is present, triggers generation, and the page transitions to the generating state.

**Acceptance Scenarios**:

1. **Given** a post-onboarding user with no coaching plan, **When** they choose the "start your coaching plan" action, **Then** the Home Dashboard requests plan generation from the existing coaching-plan API and transitions to the pending/generating state.
2. **Given** plan generation has been requested, **When** the backend reports `PENDING` or `GENERATING`, **Then** the Home Dashboard continues to reflect the generating state and does not show a start or retry action.
3. **Given** plan generation is in progress, **When** the backend reports `READY`, **Then** the Home Dashboard transitions to the ready-proposed state with the accept action.

---

### User Story 3 - Explicitly retry a retryable failed plan (Priority: P2)

A user whose plan generation failed in a retryable way sees a failed state on the Home Dashboard with an explicit "try again" action. The Home Dashboard does not retry generation automatically; the user must trigger the retry themselves. Re-issuing generation through the existing coaching-plan API resets the failed plan and begins a new generation attempt.

**Why this priority**: Failed generation is recoverable but must stay user-controlled. This protects users from autonomous retry loops and respects the constraint that failed generation is never retried automatically.

**Independent Test**: Can be tested by placing an account in a `FAILED` + retryable state and verifying the retry action is present, that no automatic retry occurs, and that triggering it begins a new generation attempt.

**Acceptance Scenarios**:

1. **Given** a post-onboarding user whose plan is `FAILED` and the backend reports the failure as retryable, **When** they open the Home Dashboard, **Then** the Home Dashboard shows a failed/retryable state and an explicit "try again" action.
2. **Given** the Home Dashboard is showing the failed/retryable state, **When** the user does nothing, **Then** no retry occurs and the page does not poll.
3. **Given** the user chooses "try again", **When** the request succeeds, **Then** the Home Dashboard transitions back to the pending/generating state.

---

### User Story 4 - View, accept, continue, and review a plan (Priority: P2)

A user whose plan is ready, active, or completed can view the plan, accept a proposed plan, continue coaching actions on an active plan, and review a completed plan. From the Home Dashboard the user can open the full plan view, accept the plan when the backend supports it (proposed → active), and continue the next available coaching action when the plan is active. When the plan is completed, the Home Dashboard lets the user review the completed plan and continue coaching through chat; it does not use "continue your plan" wording for a completed plan. All actions use the existing coaching-plan capabilities; the Home Dashboard does not introduce new lifecycle transitions and does not offer to generate a replacement plan after completion.

**Why this priority**: Once a plan exists, the user's primary value is engaging with it. This story keeps plan engagement reachable from the Home Dashboard and gives the completed plan a distinct, honest experience.

**Independent Test**: Can be tested by using an account with a ready-proposed plan, an account with an active plan, and an account with a completed plan, and verifying view, accept, continue, and review actions render correctly from the Home Dashboard.

**Acceptance Scenarios**:

1. **Given** a user with a `READY` plan in `PROPOSED` state, **When** they choose "accept your plan", **Then** the Home Dashboard requests acceptance via the existing coaching-plan API and transitions the plan to active.
2. **Given** a user with an `ACTIVE` plan, **When** they choose "continue your plan", **Then** the Home Dashboard opens the plan view and exposes the next available coaching action.
3. **Given** a user with a `COMPLETED` plan, **When** they open the Home Dashboard, **Then** the Home Dashboard shows "review your completed plan" (not "continue your plan"), lets them open the plan view read-only, and offers to continue coaching through chat — and does NOT offer to generate a new plan.
4. **Given** any ready/active/completed plan, **When** the user opens the plan view from the Home Dashboard, **Then** the plan details are rendered from the existing coaching-plan data with no new fields invented.

---

### User Story 5 - Continue an existing conversation (Priority: P1)

A user who already has conversations can continue the most recently updated active conversation directly from the Home Dashboard. The Home Dashboard shows a continue-chat card that targets exactly one conversation, determined deterministically from the existing conversation-list ordering: the active (non-archived) conversation with the greatest last-update timestamp, with ties broken by the backend's fixed secondary ordering. It opens that conversation by URL so that URL-based conversation recovery is preserved. The user can also open the conversation list.

**Why this priority**: Returning users want to pick up where they left off. Continuing a conversation from the Home Dashboard is the primary re-engagement path and must work without losing the Spec 005 URL recovery model.

**Independent Test**: Can be tested by using an account that has several conversations with distinct last-update times and verifying the continue-chat card deterministically targets the single most-recently-updated active conversation and navigates to its conversation URL.

**Acceptance Scenarios**:

1. **Given** a post-onboarding user with one or more active conversations, **When** they open the Home Dashboard, **Then** the continue-chat card targets exactly one conversation — the active conversation with the greatest last-update timestamp — and offers an action to open it.
2. **Given** two conversations share the same last-update timestamp, **When** the continue-chat card chooses a target, **Then** it follows the backend's fixed secondary ordering deterministically rather than picking arbitrarily.
3. **Given** the continue-chat card is shown, **When** the user chooses to continue, **Then** they are navigated to that conversation's URL so that refreshing the page keeps them in the same conversation.
4. **Given** the user wants to browse all conversations, **When** they choose "open conversations", **Then** they are navigated to the existing chat view that contains the conversation list.

---

### User Story 6 - Start a new conversation (Priority: P1)

A user can start a brand-new conversation from the Home Dashboard. The Home Dashboard offers a "start a new conversation" action that creates a conversation through the existing conversation API and navigates the user into the new conversation by URL.

**Why this priority**: Starting a new conversation is a core chat entry point and a primary alternative to continuing an existing one. It must be reachable from the Home Dashboard.

**Independent Test**: Can be tested by using any post-onboarding account and verifying the start-new-conversation action creates a conversation and navigates the user to it.

**Acceptance Scenarios**:

1. **Given** a post-onboarding user, **When** they choose "start a new conversation" from the Home Dashboard, **Then** a new conversation is created via the existing conversation API and the user is navigated to that new conversation's URL.
2. **Given** the new conversation has been created, **When** the user lands on it, **Then** URL-based conversation recovery applies to the new conversation like any other.

---

### User Story 7 - Ineligible or safety-held user receives existing guidance (Priority: P2)

A user who is not eligible for normal coaching — because they have not completed the required onboarding step, have no scored assessment result, or are safety-held — does not see normal coaching actions on the Home Dashboard. Instead, they receive the existing guidance: redirection to the correct unfinished onboarding step, the existing no-assessment guidance, or the existing safety-hold routing. The Home Dashboard does not invent new eligibility rules or safety copy.

**Why this priority**: Safety and eligibility boundaries are non-negotiable. The Home Dashboard must never offer coaching actions that the backend would reject, and must defer to the existing safety/eligibility surfaces.

**Independent Test**: Can be tested by using accounts in each ineligible state and verifying the Home Dashboard redirects or shows the existing guidance and offers no plan-generation or accept action.

**Acceptance Scenarios**:

1. **Given** a user who has not completed an onboarding step required to enter coaching, **When** the coaching API reports the onboarding block, **Then** the Home Dashboard redirects to the correct unfinished onboarding step exactly as the existing coaching flow does.
2. **Given** a user with no scored assessment result, **When** the coaching API reports the missing result, **Then** the Home Dashboard shows the existing no-assessment guidance and offers no plan-generation action.
3. **Given** a user who is safety-held, **When** the coaching API reports the safety hold, **Then** the Home Dashboard routes to the existing safety-hold surface and offers no normal coaching action.

---

### User Story 8 - Works on desktop, mobile, English, and Arabic/RTL (Priority: P2)

The Home Dashboard works across desktop and mobile screen sizes and in both English and Arabic, with Arabic rendered right-to-left. Layouts reflow responsively and all Home Dashboard content — the welcome area, plan card, continue-chat card, start-new-conversation action, and any recent conversations — is localized and mirrored for RTL.

**Why this priority**: The product supports Arabic and English and mobile users. The Home Dashboard is the most-visited screen and must meet the existing localization and responsive standards.

**Independent Test**: Can be tested by rendering the Home Dashboard at mobile and desktop widths in both locales and verifying layout reflow, complete translations, and correct RTL mirroring.

**Acceptance Scenarios**:

1. **Given** the locale is Arabic, **When** the user opens the Home Dashboard, **Then** all Home Dashboard content is translated and laid out right-to-left.
2. **Given** a mobile-width viewport, **When** the user opens the Home Dashboard, **Then** the Home Dashboard content reflows to a single-column layout without horizontal overflow.

---

### User Story 9 - First-time user with no plan and no conversations (Priority: P2)

A brand-new post-onboarding user who has no coaching plan and no conversations lands on a Home Dashboard that does not look empty or broken. The Home Dashboard recognizes the first-time condition — no plan and no conversations together — and presents a dedicated first-run experience with clear, welcoming recommended actions: "generate your first coaching plan" and "start your first conversation". This is a first-run UX state, not an error state; the Home Dashboard never shows a generic empty/error screen for this condition.

**Why this priority**: The first session is the highest-risk moment for retention. A blank or error-like Home Dashboard for a legitimately empty new account is the worst first impression. This story guarantees the empty-but-valid state is handled as intentional onboarding guidance.

**Independent Test**: Can be tested by using a freshly onboarded account with no plan and no conversations and verifying the Home Dashboard shows the first-run state with both recommended actions and no error messaging.

**Acceptance Scenarios**:

1. **Given** a post-onboarding user with no coaching plan and no conversations, **When** they open the Home Dashboard, **Then** the Home Dashboard shows a first-run state with "generate your first coaching plan" and "start your first conversation" as the recommended actions.
2. **Given** the first-run state is shown, **When** the user views it, **Then** no error, "nothing here", or failed-state messaging is displayed; the state is presented as a normal starting point.
3. **Given** the first-run state is shown, **When** the user chooses "generate your first coaching plan", **Then** the existing plan-generation flow begins; and **When** the user chooses "start your first conversation", **Then** a new conversation is created via the existing conversation API and the user is navigated to it.
4. **Given** a user has an existing coaching plan but no conversations, **When** they open the Home Dashboard, **Then** the plan status and primary action render normally and the chat region presents chat as an available capability not yet started, encouraging the user to start their first conversation — without any empty or error messaging.
5. **Given** a user has no plan but does have conversations, **When** they open the Home Dashboard, **Then** the Home Dashboard shows the no-plan/startable state and the continue-chat entry point rather than the combined first-run state.

---

### User Story 10 - Returning user after time away (Priority: P2)

A user who has been away from the product returns and opens the Home Dashboard. Without any local memory of their previous session, the Home Dashboard reconstructs the latest state entirely from the existing APIs and immediately shows: their current coaching-plan status, the primary next action for that status, the most recently updated active conversation when one exists, and recent conversations when supported. The returning experience is the same Home Dashboard experience as any other visit — there is no separate "welcome back" surface, no summaries, no notifications, no recommendations, and no long-term memory.

**Why this priority**: Returning users are the core retention audience. They must land on a Home Dashboard that already reflects their real current state and next action, with no reconstruction gap and no invented history.

**Independent Test**: Can be tested by using an account with an existing plan and conversations, closing the session, and reopening the Home Dashboard; verifying it immediately shows the current plan status, the primary next action, the most-recently-updated active conversation, and recent conversations — all from live API responses and with no persisted local state.

**Acceptance Scenarios**:

1. **Given** a returning user with an existing coaching plan and conversations, **When** they open the Home Dashboard, **Then** it immediately shows their current coaching-plan status and the primary next action for that status, both reconstructed from the existing coaching-plan API.
2. **Given** a returning user with at least one active conversation, **When** the Home Dashboard loads, **Then** it shows the continue-chat entry point targeting the most recently updated active conversation, reconstructed from the existing conversation-list API.
3. **Given** a returning user, **When** recent conversations are supported on the current viewport, **Then** the Home Dashboard shows the recent-conversations list from the existing conversation-list API.
4. **Given** a returning user, **When** they open the Home Dashboard, **Then** no local persistence, summaries, notifications, recommendations, or long-term memory are used; every displayed value comes from a current API response.

---

### Edge Cases

- **No coaching plan exists**: Home Dashboard shows the no-plan/startable state with the start action; generation is requested only through the existing flow.
- **No coaching plan AND no conversations (first-run)**: Home Dashboard shows the dedicated first-run state with "generate your first coaching plan" and "start your first conversation"; it is not rendered as an error or empty screen.
- **Plan generation is pending or generating**: Home Dashboard shows the generating state and polls only while the backend reports `PENDING` or `GENERATING`; no start/retry action is offered.
- **The plan is terminally failed / unavailable (non-retryable)**: Home Dashboard shows the unavailable state, offers no retry action, and does not poll.
- **`PLAN_UNAVAILABLE` with `retryable: true`**: Home Dashboard shows the failed-retryable state with an explicit retry action and does not poll.
- **Explicit retry succeeds but a later status check fails**: after the user retries, the page returns to polling; if a later status check reports failure again, the page returns to the failed-retryable state and allows another explicit retry without entering a polling loop.
- **Backend returns 401**: the existing authentication-refresh behavior applies; if the session cannot be restored, the user is redirected to login (existing behavior, unchanged).
- **Backend returns 403**: `EMAIL_NOT_VERIFIED` and `ONBOARDING_STEP_BLOCKED` are handled by the existing redirect behavior; no normal coaching action is offered.
- **Backend returns 404**: `PLAN_NOT_FOUND` is handled by the existing no-plan flow; `RESULT_NOT_FOUND` shows the existing no-assessment guidance; a missing targeted conversation is handled by the existing chat-view error state.
- **Backend returns 409**: `PLAN_NOT_READY`, `PLAN_NOT_ACTIVE`, `SAFETY_HOLD`, and `ACTION_CONFLICT` are handled by their existing flows; the Home Dashboard does not invent new handling.
- **Backend returns 429 or 5xx (500/503)**: transient errors are retried only within the existing bounded retry behavior; persistent 5xx shows the existing error state with a manual retry option; terminal `PLAN_UNAVAILABLE` is not polled.
- **The user has no conversations**: the continue-chat card is hidden or shows a "start your first conversation" entry point; the Home Dashboard does not error. If the user also has an existing plan, the plan region renders normally and chat is presented as a not-yet-started capability (per FR-002b); if the user also has no plan, the first-run state applies instead.
- **The user has a `COMPLETED` plan and wants to keep coaching**: the Home Dashboard offers "review your completed plan" and "continue coaching through chat"; it does NOT offer to generate a new plan, because the existing backend does not support creating a replacement plan for the same assessment result.
- **The user has archived or deleted the previously selected conversation**: the continue-chat card targets only active (non-archived) conversations; if the targeted conversation no longer exists when opened, the existing chat-view error state is shown without crashing the Home Dashboard.
- **The user refreshes the Home Dashboard**: the Home Dashboard reconstructs its state from the existing APIs; no local persistence is added, and URL-based conversation recovery is not disturbed.
- **Authentication or eligibility changes while the page is open**: the next coaching/conversation API response drives the rendered state; the Home Dashboard does not cache a stale plan or eligibility decision that overrides the backend.
- **No polling loop after terminal errors**: once a terminal failed/unavailable state is reached, the Home Dashboard stops polling and waits for an explicit user action.

## Requirements *(mandatory)*

### Functional Requirements

#### Home Dashboard shell

- **FR-001**: The system MUST provide a single protected post-onboarding Home Dashboard at the existing dashboard route that is the **primary authenticated landing page after login and onboarding**, acting as the central hub connecting the coaching plan, the chatbot, next actions, and recent activity. It MUST be reachable only after the existing authentication and onboarding guards pass.
- **FR-002**: The Home Dashboard MUST present a welcome/header area and exactly one primary recommended action for the current state, derived deterministically from the current coaching-plan state (see FR-035).
- **FR-002a**: When the Home Dashboard has no coaching plan and no conversations, it MUST show the first-run state with "generate your first coaching plan" and "start your first conversation" as recommended actions. This MUST be presented as a normal starting state, never as an error, "empty", or failed state.
- **FR-002b**: When the Home Dashboard has an existing coaching plan but no conversations, it MUST render the plan status and primary action normally and present chat as an available capability that has not yet been started, encouraging the user to start their first conversation. This MUST NOT be rendered as an empty or error state; only the chat region reflects "not started yet", while the coaching-plan region reflects the real plan state.
- **FR-003**: The Home Dashboard MUST render one of the following Home Dashboard states, and only these, driven entirely by the existing coaching-plan API response together with the existing conversation-list response: loading, first-run (no plan AND no conversations), no-plan/startable, starting, pending, generating, failed-retryable, unavailable, no-assessment, safety-held, ineligible, not-ready, not-active, ready-proposed, ready-active, ready-completed, and error.
- **FR-004**: The frontend MUST NOT define new coaching-plan lifecycle states beyond those the backend already returns; the Home Dashboard MUST map the existing `generationStatus` (`PENDING`, `GENERATING`, `READY`, `FAILED`) and `planStatus` (`PROPOSED`, `ACTIVE`, `COMPLETED`) values to the Home Dashboard states without inventing new ones. The `first-run` state is a composite UX state derived from the absence of both a plan and conversations; it is NOT a new coaching-plan lifecycle state.

#### Coaching-plan status and actions

- **FR-005**: The Home Dashboard MUST consume only the existing coaching-plan capabilities (start/get current plan, accept plan, update coaching action) and MUST NOT add new coaching-plan endpoints.
- **FR-006**: In the no-plan state, the Home Dashboard MUST offer an explicit action to start plan generation using the existing start capability.
- **FR-007**: In the failed-retryable state, the Home Dashboard MUST offer an explicit user-triggered retry action and MUST NOT retry generation automatically.
- **FR-008**: In the unavailable (non-retryable) state, the Home Dashboard MUST NOT offer a retry action and MUST NOT poll.
- **FR-009**: In the ready-proposed state, the Home Dashboard MUST offer an accept action using the existing accept capability and an action to open the plan view.
- **FR-010**: In the ready-active state, the Home Dashboard MUST offer an action to continue the plan (open the plan view and expose the next available coaching action) using the existing update-action capability.
- **FR-010a**: In the ready-completed state, the Home Dashboard MUST offer an action to review the completed plan (open the plan view) and the standing option to continue coaching through chat. It MUST use "review your completed plan" wording, NOT "continue your plan", and MUST NOT offer to generate a new plan, because the existing coaching-plan API does not support creating a replacement plan while the current assessment result is unchanged.
- **FR-011**: The Home Dashboard MUST poll for plan progress only while the backend reports `PENDING` or `GENERATING`, and MUST stop polling on any terminal state (including `READY`, `FAILED`, and unavailable) and on errors that the existing retry policy does not retry.
- **FR-012**: The Home Dashboard MUST NOT automatically retry failed generation; only an explicit user action may begin a new generation attempt.

#### Eligibility and safety

- **FR-013**: When the coaching API reports an onboarding block, the Home Dashboard MUST redirect to the correct unfinished onboarding step using the existing routing, exactly as the current coaching flow does.
- **FR-014**: When the coaching API reports a safety hold, the Home Dashboard MUST route to the existing safety-hold surface and MUST NOT offer normal coaching actions.
- **FR-015**: When the coaching API reports a missing scored assessment, the Home Dashboard MUST show the existing no-assessment guidance and MUST NOT offer plan generation.
- **FR-016**: The Home Dashboard MUST NOT introduce new eligibility rules, safety copy, or risk levels; it MUST reuse the existing safety and eligibility behavior.

#### Chat integration

- **FR-017**: The Home Dashboard MUST provide a continue-chat entry point that targets exactly one conversation, selected deterministically from the existing conversation-list capability: the active (non-archived) conversation with the greatest last-update timestamp, with ties broken by the backend's fixed secondary ordering. The Home Dashboard MUST NOT use ambiguous terms like "latest conversation"; it MUST resolve to a single, repeatable target.
- **FR-018**: The Home Dashboard MUST provide an action to open the existing conversation list, which lives inside the existing chat view.
- **FR-019**: The Home Dashboard MUST provide a "start a new conversation" action that creates a conversation via the existing conversation API and navigates the user to that conversation's URL.
- **FR-020**: Navigation between the Home Dashboard, the plan view, and chat MUST use URL-based routes so that URL-based conversation recovery from Spec 005 is preserved; the Home Dashboard MUST NOT introduce in-memory or local-persistence-based conversation state that overrides the URL.
- **FR-021**: The chat view MUST continue to provide its existing return path back to the Home Dashboard.
- **FR-022**: The Home Dashboard MUST NOT call the RAG service, the vector store, the LLM provider, or any Python service directly; it MUST consume only the existing frontend API client.

#### Top-level navigation

- **FR-022a**: The three primary post-onboarding experiences — the Home Dashboard, the Coaching Plan view, and Chat — MUST expose a consistent top-level navigation affordance so a user can always move between them without relying on browser back/forward controls. This is a UX requirement only: it MUST reuse the existing `/dashboard`, plan-view, and `/chat` routes (no new routes), MUST NOT redesign navigation, and MUST NOT require any backend work.

#### Home Dashboard content

- **FR-023**: The Home Dashboard SHOULD show a small set of recent conversations sourced from the existing conversation-list capability, requested with a bounded `limit` to avoid over-fetching (the existing backend list endpoint supports a `limit` query parameter and returns conversations newest by last update, so a recent-activity list is efficient to obtain). The list MUST use only data the existing API returns and MUST NOT include analytics, streaks, progress scores, notifications, or recommendation data the API does not provide. (MAY is not used here because the capability already exists and is efficient to consume; SHOULD allows the implementation to omit the list only on very small viewports where space does not permit it.)
- **FR-024**: The Home Dashboard MUST NOT invent conversation summaries; recent-conversation display is limited to fields the existing conversation summary already exposes (title, status, timestamps).
- **FR-025**: The Home Dashboard MUST treat backend responses as authoritative; it MUST NOT store coaching-plan or conversation state locally to override the backend.

#### Error handling

- **FR-026**: The Home Dashboard MUST handle HTTP 401, 403, 404, 409, 429, 500, and 503 from the coaching and conversation APIs by mapping them to the existing error states; it MUST NOT enter a polling loop after a terminal error.
- **FR-027**: When a continue-chat target conversation is missing or archived at open time, the Home Dashboard MUST defer to the existing chat-view error state and MUST NOT crash.

#### Localization and responsiveness

- **FR-028**: The Home Dashboard MUST be fully localized in English and Arabic and MUST render right-to-left when Arabic is active, using the existing localization and RTL setup.
- **FR-029**: The Home Dashboard MUST reflow responsively across desktop and mobile widths using the existing design system and responsive patterns.

#### Non-modification

- **FR-030**: The Home Dashboard MUST NOT change Spec 004 (conversation AI/RAG) or Spec 005 (frontend chatbot) behavior, including chat routes, URL recovery, message handling, and the conversation-list sidebar.
- **FR-031**: The Home Dashboard MUST NOT add streaming, autonomous agents, tools, conversation summaries, autonomous plan generation, or local plan/conversation persistence.

#### Home Dashboard information hierarchy

- **FR-032**: The Home Dashboard MUST follow this rendering order as the intended visual priority, which guides future implementation without prescribing exact layout:
  - **Priority 1 — Current coaching status**: the plan state and, when present, the plan summary/progress.
  - **Priority 2 — Primary recommended action**: the single primary action the user should take next for the current coaching state (see FR-035).
  - **Priority 3 — Continue or start chat**: the continue-chat entry point (when an active conversation exists) and the start-new-conversation action.
  - **Priority 4 — Recent conversations**: the recent-conversations list.
- **FR-033**: Rendering order is strict: lower-priority content MUST NOT visually dominate higher-priority content. In particular, recent conversations (Priority 4) and any secondary chat actions MUST NOT displace or compete with the coaching status (Priority 1) or the primary recommended action (Priority 2) above the fold on any supported viewport.
- **FR-034**: The Home Dashboard MUST NOT add analytics, streaks, notifications, achievements, AI recommendations, progress percentages beyond what the existing coaching-plan data already exposes, summaries, or any new APIs. This reinforces FR-023, FR-024, FR-025, and FR-031 and keeps the Home Dashboard within MVP discipline.
- **FR-035**: The Home Dashboard MUST designate exactly one available action as the **primary recommended action** for the current state, or none when the state has no actionable primary step. This is a deterministic frontend presentation rule derived entirely from the existing coaching-plan state; it MUST NOT introduce a new backend field. The state → primary-action mapping is:
  - No plan / startable → **Generate coaching plan** (start plan generation).
  - First-run (no plan and no conversations) → **Generate your first coaching plan** (the chat-first action is secondary).
  - Pending / generating → **No primary action**; show the waiting state only.
  - Ready / proposed → **Accept plan**.
  - Active → **Continue plan**.
  - Completed → **Review completed plan** (continue-chat is secondary; no new-plan action, per FR-010a).
  - Failed / retryable → **Try again** (explicit retry).
  - Unavailable (non-retryable) / not-ready / not-active / error → **No primary action**; show the existing unavailable/error guidance with any existing manual retry, without offering a coaching CTA.
  - Safety-held / ineligible / no-assessment → **No primary action**; follow the existing safety/eligibility guidance (per FR-013–FR-016).
- **FR-036**: Secondary actions — continue chat, start a new conversation, open the conversation list, and open recent conversations — MUST NOT compete visually with the primary recommended action. When a primary action exists for the current state, it MUST be presented as the single most prominent action; secondary actions may be present but must be visually subordinate.
- **FR-036a**: At any moment the Home Dashboard MUST present exactly one visually dominant primary focus. In practice: only one primary CTA may be prominent; the coaching-plan region and the chat region MUST never compete equally for attention; secondary actions MUST remain visually subordinate; and multiple equally prominent cards or actions MUST be avoided. This is a presentation guideline only and does not prescribe specific UI components or layouts.

### Key Entities *(include if feature involves data)*

- **CoachingPlan state**: The current plan's `generationStatus` and `planStatus`, as returned by the existing coaching-plan API. The Home Dashboard reads but does not own this state.
- **ConversationSummary**: The existing conversation list item (id, title, status, timestamps, last message time). The Home Dashboard reads the most recently updated active item to populate the continue-chat card and any recent-conversations display.
- **Recommended next action**: A presentation-only, non-persistent label derived from the current coaching-plan state; it exists only on the Home Dashboard and is not a new backend entity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The Home Dashboard consumes only the existing coaching-plan capabilities (start/get, accept, update action) and the existing Conversation API (list, create, get); no new backend endpoint is added.
- **SC-002**: Every existing coaching-plan state — no plan, pending, generating, ready-proposed, ready-active, ready-completed, failed-retryable, unavailable, no-assessment, safety-held, ineligible, not-ready, not-active — renders on the Home Dashboard with the correct label and the correct recommended next action, verifiable against the backend response for each state.
- **SC-003**: A retryable failed plan (`PLAN_UNAVAILABLE` with `retryable: true`) renders an explicit user-triggered generation/retry action, and no automatic retry occurs.
- **SC-004**: After a terminal failure or unavailable state is reached, the Home Dashboard issues no further polling requests until the user explicitly acts, verifiable by observing no repeated plan-status requests in the terminal state.
- **SC-005**: An existing conversation can be continued from the Home Dashboard, and the user lands on that conversation's URL with URL-based recovery intact (a refresh keeps them in the same conversation).
- **SC-006**: A new conversation can be started from the Home Dashboard, and the user lands on the new conversation's URL.
- **SC-007**: Navigation from the Home Dashboard → plan view, the Home Dashboard → chat, plan → chat, and chat → the Home Dashboard all work, and returning to a conversation URL after navigating away restores the same conversation.
- **SC-008**: An ineligible or safety-held user is redirected to the existing onboarding/safety surface or shown the existing no-assessment guidance, and is never offered a plan-generation, accept, or continue action.
- **SC-009**: The Home Dashboard renders completely in English and Arabic with correct RTL mirroring for Arabic, and reflows without horizontal overflow at mobile and desktop widths.
- **SC-010**: The Home Dashboard makes no direct call to the RAG service, vector store, LLM provider, or any Python service, verifiable by inspecting the Home Dashboard's data sources.
- **SC-011**: Lint, type checking, and the production build pass with the Home Dashboard in place, and the existing Spec 004 and Spec 005 tests continue to pass unchanged.
- **SC-012**: No out-of-scope capability (streaming, agents, tools, conversation summaries, autonomous plan generation, local persistence, analytics, streaks, progress scores, notifications, or recommendations) is present in the Home Dashboard.
- **SC-013**: For every coaching state, the Home Dashboard renders exactly one primary recommended action matching the FR-035 mapping (or no primary action for waiting/guidance states), and secondary chat actions do not visually compete with it, verifiable by inspecting the rendered primary action per state.
- **SC-014**: A returning user's Home Dashboard immediately reflects the current coaching-plan status, the primary next action, the most-recently-updated active conversation when one exists, and recent conversations when supported — all from live API responses with no local persistence, summaries, notifications, or recommendations.

## Assumptions

- The existing `/dashboard` route remains the post-onboarding Home Dashboard; Spec 006 builds the Home Dashboard shell around the existing coaching-plan state machine rather than introducing a new route.
- The existing coaching-plan auto-start-on-no-plan behavior from Spec 002 is preserved unchanged; the explicit "start" action required by this spec is satisfied by the existing startable-state action and the retry action, and is not used to remove or replace the existing no-plan flow. (This avoids modifying Spec 002 behavior, which is out of scope.)
- The backend currently returns `retryable: true` for every `PLAN_UNAVAILABLE` failure; the unavailable (non-retryable) Home Dashboard state is retained to represent the backend contract accurately and for forward compatibility, even though it is not reachable with the current backend.
- The existing coaching-plan API does NOT support generating a replacement plan after a plan reaches `COMPLETED` while the user's assessment result is unchanged. `startOrGet` returns the existing current plan when the assessment `resultId` matches the plan's `sourceResultId`; a new plan is only created when there is no current plan or the assessment result has changed (which requires an assessment retake, itself out of MVP scope per the PRD). Therefore the completed-plan experience offers review + continue-chat, not new-plan generation — this is an architecture limit, not a spec choice.
- "Recent conversations" is efficient to obtain because the existing `GET /conversations` endpoint supports a bounded `limit` query parameter and returns conversations newest by last update with cursor pagination; no new API is required to support the recent-activity region.
- "Most relevant existing conversation" is interpreted as the most recently updated active (non-archived) conversation, derived from the existing conversation-list ordering (newest by last update). No recommendation engine or relevance ranking is introduced.
- "Open the conversation list" navigates to the existing chat view, because the conversation list currently lives as a sidebar inside the chat view rather than as a dedicated route; no new conversation-list route is introduced.
- Starting a new conversation uses the existing create-conversation capability and then navigates to the new conversation's URL, matching the current chat-view pattern.
- The existing chat view already provides a return path to the plan view / Home Dashboard; Spec 006 ensures that path leads to the Home Dashboard.
- Error and polling behavior for coaching-plan states follows the existing bounded retry and polling policy (poll only while pending/generating; do not retry terminal/unavailable errors); Spec 006 preserves these rather than redefining them.
- Transient HTTP 429/5xx errors are retried only within the existing bounded retry policy; this spec does not introduce new retry budgets.

## Reference Alignment *(mandatory)*

- **PRD.md**: This feature aligns with the core user journey (generate coaching plan → start coaching → chat with AI → review progress) and the MVP scope (coaching plan, sessions, AI chat, safety, progress tracking). The Home Dashboard is the post-onboarding hub that makes that journey navigable. It respects the non-goals (no diagnosis, no medication advice, no voice/payments/therapist marketplace) and product principles (safety before coaching, privacy first, personalization over generic advice) by deferring all coaching and safety decisions to the existing backend and by inventing no analytics or recommendation data.
- **SAD.md**: This feature aligns with the modular-monolith ownership model: coaching-plan lifecycle is Coaching-owned (two-status `generationStatus`/`planStatus` model), safety classification is Safety-owned, and the frontend must not call the RAG service, Qdrant, or the LLM provider directly. The Home Dashboard consumes only the existing Coaching and Conversation API contracts and introduces no new backend entities, lifecycle states, or safety logic. It preserves the `FAILED`-is-never-a-plan-lifecycle-status rule by mapping `FAILED` generation to a Home Dashboard display state, not a plan lifecycle state.
- **Frontend_Architecture.md**: This feature aligns with the feature-first structure (reuse `features/coaching` and `features/chat`), the API-only-through-service-layer rule (no direct fetch from components), TanStack Query for server state, the existing design-system components (Card, Button, Badge, Progress), and the English/Arabic + RTL setup. The documented `/dashboard` route is described as the "coaching-plan experience"; Spec 006 extends it into the Home Dashboard that wraps the existing coaching-plan state machine and adds chat entry points, without changing the protected-route guard chain or the `/chat` and `/chat/[conversationId]` routes from Spec 005.
- **Conflicts / Gaps**: (1) Frontend_Architecture §7 describes `/dashboard` as only a coaching-plan experience; Spec 006 extends it into the primary authenticated Home Dashboard with chat entry points — resolved by keeping the existing coaching state machine intact and adding surrounding Home Dashboard content, and by redefining `/dashboard` in this spec as the primary post-onboarding landing page (consistent with Frontend_Architecture §7, which lists `/dashboard` as the protected post-onboarding route). (2) There is no dedicated conversation-list route and no single "most-recent conversation" endpoint; resolved by using the existing `GET /conversations` list (newest by last update) with a bounded `limit` to derive the continue-chat target deterministically, and by navigating to the existing chat view for the full list. (3) The backend currently always returns `retryable: true` for `PLAN_UNAVAILABLE`, so the unavailable (non-retryable) Home Dashboard state is retained for contract accuracy but is not reachable today; resolved by keeping the state in the model and guarding it with `retryable` rather than hard-coding. (4) A "generate a new coaching plan after completion" action was considered for the completed-plan experience and **intentionally rejected**: the existing `startOrGet` capability only creates a new plan when the assessment result has changed (or there is no plan), and assessment retakes are out of MVP scope — so no existing backend capability supports it and inventing one is forbidden by the constraints. The completed-plan experience is therefore limited to review + continue-chat. No other conflicts or gaps.