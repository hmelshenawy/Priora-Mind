# Data Model: Frontend Chatbot

This feature does not introduce new frontend persistence. The frontend models below represent backend-owned data and UI-only state used to render and operate the chatbot.

## Conversation

**Purpose**: User-owned chat container displayed in the conversation list and opened for message history.

**Fields**:

- `id`: stable conversation identifier from backend.
- `title`: optional backend-provided display label; fallback label is rendered when absent.
- `status`: active or archived state as returned by backend.
- `createdAt`: creation timestamp when available.
- `updatedAt`: update timestamp or last activity timestamp when available.
- `lastMessagePreview`: optional display preview when returned by backend.

**Relationships**:

- Has many `ConversationMessage` records.
- Is selected by one active chat view at a time.

**Validation rules**:

- Frontend never trusts conversation ownership; backend authorization remains authoritative.
- Archived conversations are omitted from default list unless the archive-including view is requested.
- Deleted conversations are removed from navigation after successful deletion.

**State transitions**:

- `ACTIVE` -> `ARCHIVED` through archive action.
- `ARCHIVED` -> `ACTIVE` only if existing backend behavior returns an unarchive capability.
- `ACTIVE` or `ARCHIVED` -> deleted through confirmed delete action.

## ConversationMessage

**Purpose**: Displayed user or assistant message inside an open conversation.

**Fields**:

- `id`: stable message identifier from backend.
- `role`: `user` or `assistant`.
- `content`: backend-provided user or assistant text.
- `status`: processing/display state returned by backend, including completed and failed outcomes.
- `route`: backend route when provided for assistant messages.
- `createdAt`: timestamp or equivalent ordering field.
- `sources`: list of `AssistantSource` records for assistant messages.
- `failureCode`: safe backend failure code when provided.
- `failureMessage`: safe user-facing failure content when provided.

**Relationships**:

- Belongs to one `Conversation`.
- Assistant messages may have many `AssistantSource` records.

**Validation rules**:

- Messages are rendered in chronological reading order.
- User and assistant roles are visually and semantically distinguishable.
- Failed, clarification, insufficient-evidence, safety, and completed outcomes are displayed from backend-provided content/status without inventing new assistant claims.

## AssistantSource

**Purpose**: Citation snapshot attached to an assistant message.

**Fields**:

- `sourceId`: backend source identifier when available.
- `chunkId`: backend chunk identifier when available.
- `title`: source title when available.
- `sourceType`: source type when available.
- `sourceFile`: source file when available.
- `section`: citation section when available.
- `heading`: citation heading when available.
- `page`: single page display when available.
- `pageStart`: range start when available.
- `pageEnd`: range end when available.
- `displayOrder`: citation order for rendering.

**Relationships**:

- Belongs to one assistant `ConversationMessage`.

**Validation rules**:

- Render citations only when sources are present.
- Prefer title, section/heading, and page/range metadata when available.
- Fall back to safe source metadata instead of showing an empty citation.

## SendAttempt

**Purpose**: UI state for one user send action.

**Fields**:

- `conversationId`: target conversation.
- `content`: submitted message text.
- `idempotencyKey`: unique key for this attempt.
- `state`: idle, submitting, completed, or failed in UI terms.
- `error`: safe display error when the send request fails before a backend message outcome is available.

**Relationships**:

- Targets one `Conversation`.
- Resolves to a backend user message and assistant message when successful.

**Validation rules**:

- Empty or whitespace-only content is blocked before send.
- Duplicate composer submission is blocked while an attempt is in progress.
- Failed-send retry creates a new `SendAttempt` with a new idempotency key.

## ChatEligibilityState

**Purpose**: User's ability to enter normal conversation from protected routes.

**Fields**:

- `authenticated`: whether the frontend auth guard considers the user signed in.
- `onboardingState`: existing onboarding state when available.
- `safetyHold`: whether existing state indicates safety hold.
- `coachingPlanState`: current plan/generation state when available for navigation context.

**Validation rules**:

- Frontend eligibility gates are UX routing only and are not authorization boundaries.
- Ineligible users remain in existing onboarding, safety, or coaching-plan guidance flows.

## ChatNavigationContext

**Purpose**: UI navigation state for moving between the coaching plan and chatbot.

**Fields**:

- `sourceRoute`: route from which chat was opened, typically dashboard/coaching plan.
- `selectedConversationId`: current conversation id from the URL-addressable selected conversation route, preferably `/[locale]/chat/[conversationId]`.
- `returnRoute`: route used by the chat UI to return to the plan.

**Validation rules**:

- Returning to the plan must preserve the existing plan flow.
- Reopening chat from the plan should continue an existing selected conversation through its URL-addressable conversation id when available, without creating a new conversation unless requested.
- Conversation content recovery comes from backend state, not extra local persistence.
