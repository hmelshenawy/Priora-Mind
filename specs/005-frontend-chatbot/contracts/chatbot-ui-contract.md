# Contract: Frontend Chatbot UI and Existing Conversation API Consumption

This contract describes how the Spec 005 frontend consumes existing Spec 004 conversation capabilities. It does not define new backend APIs.

## Route Contract

### Protected Chat Route

- Route: localized protected chatbot routes under the existing post-onboarding area, with `/[locale]/chat` for list/new state and preferably `/[locale]/chat/[conversationId]` for selected conversation state.
- Entry: current therapy/coaching plan/dashboard flow exposes a chat entry action.
- Return: chat view exposes a return-to-plan action that restores the existing plan flow.
- Continue: plan flow can reopen an existing conversation by navigating to the URL-addressable selected conversation route.

### Route Rules

- Ineligible users are redirected or kept in existing onboarding, safety, or coaching-plan guidance.
- Refreshing, revisiting, or directly opening `/[locale]/chat/[conversationId]` reloads conversation list/detail from backend state.
- URL state identifies the selected conversation; temporary client component state alone is not sufficient for conversation recovery and full message history must not be persisted locally.

## Consumed Conversation Capabilities

The frontend consumes only the existing backend conversation capabilities from Spec 004:

- Create conversation.
- List conversations, with default active view and archive-including view when supported by existing backend behavior.
- Retrieve one conversation and its messages.
- Archive or unarchive conversation when supported by existing backend behavior.
- Delete conversation after user confirmation.
- Send message to a conversation with an idempotency key.

## Prohibited Calls

The frontend must not call:

- Python RAG service.
- Qdrant or any vector database.
- LLM providers.
- Agent or tool endpoints.
- Streaming endpoints or event channels for this MVP.
- Summarization endpoints.
- Conversation title-editing endpoints.
- Dedicated retry endpoints.

## Message Send Contract

### Request Behavior

- User submits non-empty message content from an active conversation.
- Frontend creates a fresh idempotency key for each send attempt.
- Frontend blocks repeated composer submission while the attempt is in progress.
- Retry after failed send creates a new attempt with a new idempotency key.

### Response Behavior

- Successful send returns persisted user and assistant messages according to Spec 004.
- Frontend displays the backend final state without inventing assistant content.
- Reusing an idempotency key may return a stored result; the frontend must not treat this as new work.

## UI State Contract

The chatbot must represent these states distinctly:

- Conversation list loading.
- Conversation list empty.
- Conversation list loaded.
- Conversation list failure.
- Conversation detail loading.
- Conversation detail empty.
- Message send in progress.
- Completed assistant answer.
- Clarification response.
- Insufficient-evidence response.
- Safety response.
- Technical failure response.
- Archived conversation.
- Deleted conversation.

## Citation Contract

- Render citations only for assistant messages with sources.
- Show source title when available.
- Show section, heading, page, or page range when available.
- Use safe fallback metadata when page details are missing.
- Do not show an empty citation area for messages without sources.
- Do not fetch citation details from RAG or other non-conversation services.

## Responsive and Accessibility Contract

- Desktop layout keeps conversation list, active conversation, citations, and composer usable without overlap.
- Mobile layout provides clear navigation between list and active conversation.
- Composer remains reachable on mobile.
- Message roles, buttons, confirmation dialogs, loading states, and errors use accessible labels and focus behavior.
- Arabic and English content remain readable; RTL behavior is tested for navigation, composer, message thread, and citations.
