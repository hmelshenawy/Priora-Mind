# Feature Specification: Frontend Chatbot

**Feature Branch**: `005-frontend-chatbot`

**Feature Directory**: `specs/005-frontend-chatbot`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "We completed Spec 004. Now create Spec 005 for the frontend chatbot using `/speckit.specify` only. The feature should cover: Conversation list; Create and open conversations; Display user and assistant messages; Send messages through the existing NestJS Conversation API; Loading, clarification, insufficient-evidence, and failure states; Citation display; Archive and delete conversations; Retry failed sends using a new idempotency key; Responsive chatbot UI; Integration with the existing therapy/coaching plan flow. Constraints: Do not modify Spec 004; Do not invent new backend APIs; No direct calls to Python RAG, Qdrant, or LLM providers; No streaming; No agents or tools; No summarization; No conversation title editing; No retry endpoint; Keep the MVP simple. Run `/speckit.specify` only. Do not create plan or tasks. Do not start implementation."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start and Open Chat (Priority: P1)

A post-onboarding user opens the chatbot from the current therapy/coaching plan experience, sees their conversation list, creates a new conversation when needed, opens an existing conversation to continue support, and can return to the plan without losing the selected conversation context.

**Why this priority**: The chatbot must be reachable from the core coaching journey before message sending or citations provide value.

**Independent Test**: A qualified user can navigate from the coaching plan experience to the chatbot, view conversations, create one conversation, open or continue an existing conversation, and return to the plan without disrupting the supported coaching flow.

**Acceptance Scenarios**:

1. **Given** a signed-in user whose onboarding and coaching eligibility allow normal conversation use, **When** they choose the chat entry point from the current coaching plan flow, **Then** the chatbot opens with their available conversations or a clear empty state while preserving the user's place in the plan flow.
2. **Given** the user has no conversations, **When** they choose to start a chat, **Then** one new conversation is created through the existing conversation capability and opened for messaging.
3. **Given** the user has conversations, **When** they select one from the list or continue chat from the plan, **Then** the existing conversation opens and shows its message history in chronological reading order.
4. **Given** the user is viewing chat opened from the plan, **When** they return to the plan, **Then** the plan context remains available and the chat conversation can be reopened without starting a new conversation unless the user explicitly starts one.
5. **Given** the user is not eligible for normal conversation use, **When** they attempt to open the chatbot, **Then** they remain in the established onboarding, safety, or coaching-plan guidance flow and do not enter normal chat.

---

### User Story 2 - Send and Read Messages (Priority: P1)

A user sends a message in an open conversation and receives a completed assistant response, a clarification prompt, an insufficient-evidence response, or a safe failure state without the interface implying unsupported therapy or diagnosis.

**Why this priority**: Message exchange is the primary value of the chatbot and must faithfully represent backend outcomes.

**Independent Test**: A user can submit a valid message, see it added to the conversation, observe a loading state, and then see the returned assistant outcome exactly once.

**Acceptance Scenarios**:

1. **Given** an active conversation is open, **When** the user submits a non-empty message, **Then** the message is sent through the existing backend conversation capability and the interface shows progress until the final outcome is known.
2. **Given** the assistant response completes successfully, **When** the conversation updates, **Then** the user sees both their message and the assistant message with clear role distinction and timestamps or equivalent ordering cues.
3. **Given** the assistant needs more context, **When** the response is a clarification outcome, **Then** the interface displays the assistant's clarification question as a completed response and allows the user to answer normally.
4. **Given** the backend reports insufficient evidence, **When** the assistant response is shown, **Then** the interface clearly states that there is not enough grounded information and does not present citations or unsupported advice.
5. **Given** the backend reports a technical failure, **When** the failed outcome is shown, **Then** the user sees a safe failure message and a retry affordance that sends a new message attempt using a new idempotency key.

---

### User Story 3 - Show Citations (Priority: P1)

A user can inspect the source references attached to grounded assistant responses so they understand which approved materials supported the answer.

**Why this priority**: Citation visibility supports trust, safety, and evidence-based coaching boundaries.

**Independent Test**: A conversation containing an assistant response with sources renders a visible citation area for that message and hides citation UI when no sources exist.

**Acceptance Scenarios**:

1. **Given** an assistant message includes one or more sources, **When** the message is displayed, **Then** each source is available as a readable citation with the best available title, section, page, or fallback source information.
2. **Given** a source includes page range or section metadata, **When** the citation is displayed, **Then** the user can distinguish that location from other sources.
3. **Given** a message is a clarification, insufficient-evidence response, static response, safety response, or technical failure, **When** it has no sources, **Then** the interface does not show an empty or misleading citation section.

---

### User Story 4 - Manage Conversations (Priority: P2)

A user can archive conversations they no longer want in the main list and permanently delete conversations they intentionally remove.

**Why this priority**: Conversation management supports user control and privacy while remaining secondary to the core chat flow.

**Independent Test**: A user can archive a conversation so it leaves the default list, optionally view archived conversations, and delete an owned conversation after confirmation.

**Acceptance Scenarios**:

1. **Given** a conversation appears in the default list, **When** the user archives it, **Then** it no longer appears in the default list and the user receives clear confirmation of the state change.
2. **Given** the user views archived conversations, **When** an archived conversation is available, **Then** they can open it for reading according to the existing conversation rules.
3. **Given** the user chooses to delete a conversation, **When** they confirm the destructive action, **Then** the conversation is removed from the interface and cannot be opened again.
4. **Given** archive or delete fails, **When** the operation completes with an error, **Then** the interface preserves the prior visible state and shows a safe, understandable failure message.

---

### User Story 5 - Use Chat on Common Screens (Priority: P2)

A user can comfortably use the chatbot on desktop and mobile-sized screens without losing access to conversation navigation, messages, citations, or the message composer.

**Why this priority**: The PRD requires responsive UI and the chatbot is a core post-onboarding interaction.

**Independent Test**: The same chat tasks can be completed on desktop and mobile viewport sizes with readable content and reachable controls.

**Acceptance Scenarios**:

1. **Given** the user opens chat on a desktop-sized screen, **When** conversations and messages are available, **Then** the list, active conversation, citations, and composer are all usable without overlap.
2. **Given** the user opens chat on a mobile-sized screen, **When** they switch between conversation list and active conversation, **Then** navigation remains clear and the composer remains reachable.
3. **Given** a message or citation is long, **When** it is displayed on any supported screen size, **Then** text remains readable and controls remain accessible without horizontal scrolling of the page.

### Edge Cases

- A user opens chat while conversations are still loading.
- The conversation list is empty.
- Conversation list loading fails.
- Conversation creation succeeds but opening the conversation view fails.
- A message send is attempted with empty or whitespace-only content.
- A message send is in progress and the user attempts to send another message from the same composer.
- The backend returns a stored failed result for a repeated idempotency key.
- The user retries a failed send and the new attempt also fails.
- A conversation is archived or deleted while it is currently open.
- A conversation has no messages yet.
- A conversation has many messages or many conversations are available.
- Assistant responses contain no citations, one citation, multiple citations, missing page metadata, or page ranges.
- The user loses authentication or eligibility while viewing chat.
- The user navigates away during loading and later returns.
- The user refreshes the page, revisits the chatbot, or reopens a conversation from the plan.
- Arabic and English content may appear in conversations, and layout must remain readable in both text directions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The frontend MUST provide a chatbot entry point from the existing therapy/coaching plan flow for users who are eligible for normal conversations.
- **FR-002**: The frontend MUST prevent or redirect ineligible users according to the established onboarding, safety, and coaching-plan flows rather than showing normal chat.
- **FR-003**: The frontend MUST display the authenticated user's conversation list with clear loading, empty, loaded, and failure states.
- **FR-004**: The frontend MUST allow the user to create a new conversation using the existing backend conversation capability and open it after creation succeeds.
- **FR-005**: The frontend MUST allow the user to open an existing conversation and display its messages in chronological reading order.
- **FR-006**: The frontend MUST distinguish user messages from assistant messages using accessible visual and textual cues.
- **FR-007**: The frontend MUST display assistant response outcomes for completed answers, clarification questions, insufficient-evidence responses, safety responses, and technical failures without inventing additional assistant content.
- **FR-008**: The frontend MUST send user messages only through the existing backend conversation capability and MUST NOT call retrieval services, vector stores, language-model providers, agents, or tools directly.
- **FR-009**: The frontend MUST use an idempotency key for each send-message attempt.
- **FR-010**: The frontend MUST retry a failed send only by creating a new send-message attempt with a new idempotency key; it MUST NOT depend on a dedicated retry endpoint.
- **FR-011**: The frontend MUST not retry a successful completed response, clarification response, insufficient-evidence response, or stored failed result with the same idempotency key as if it were new work.
- **FR-012**: The frontend MUST show a message-level loading or pending state while a send is in progress and MUST resolve it to the final returned message state.
- **FR-013**: The frontend MUST block empty or whitespace-only submissions before sending.
- **FR-014**: The frontend MUST avoid duplicate sends from repeated composer actions while the current submission is in progress.
- **FR-015**: The frontend MUST display citations attached to assistant messages using available source title, source type or file, section or heading, page or page range, and fallback metadata when page details are missing.
- **FR-016**: The frontend MUST hide citation UI for messages that have no sources.
- **FR-017**: The frontend MUST allow users to archive an owned conversation using the existing backend conversation capability and remove it from the default visible list after success.
- **FR-018**: The frontend MUST allow users to access archived conversations when the existing backend conversation capability returns them for an archive-including view.
- **FR-019**: The frontend MUST allow users to delete an owned conversation only after explicit confirmation.
- **FR-020**: The frontend MUST remove a deleted conversation from local navigation after success and show a safe error if deletion fails.
- **FR-021**: The frontend MUST NOT provide conversation title editing in the MVP.
- **FR-022**: The frontend MUST NOT provide streaming responses, response summarization, agent/tool controls, voice controls, or direct provider settings in the MVP chatbot.
- **FR-024**: The frontend MUST render safe user-facing failure messages without exposing internal diagnostics, prompts, provider details, stack traces, secrets, or raw service errors.
- **FR-025**: The frontend MUST support responsive use on desktop and mobile-sized screens for conversation list, active conversation, message composer, message states, and citations.
- **FR-026**: The frontend MUST support readable Arabic and English conversation content and respect the existing language and text-direction experience.
- **FR-027**: The frontend MUST keep the MVP scoped to the existing conversation lifecycle and message capabilities from Spec 004 and MUST NOT require new backend APIs.
- **FR-028**: The frontend MUST allow users to move from the current therapy/coaching plan to the chatbot, return to the plan, and continue an existing conversation from the plan without introducing new AI capabilities or backend APIs.
- **FR-029**: The frontend MUST recover an existing conversation after page refresh, chatbot revisit, or reopening the conversation by using the existing backend conversation state; it MUST NOT introduce additional local persistence beyond the existing application architecture.

### Key Entities *(include if feature involves data)*

- **Conversation**: A user-owned chat container shown in the conversation list and opened for message history. Key user-facing attributes include identifier, display label or fallback label, archived state, creation or update recency, and whether it is currently selected.
- **Conversation Message**: A displayed user or assistant message within a conversation. Key user-facing attributes include role, content, final state, ordering information, and any safe failure or clarification status.
- **Assistant Source / Citation**: A source reference attached to an assistant message. Key user-facing attributes include source title, source type or file, section or heading, page or page range when available, fallback metadata, and display order.
- **Send Attempt**: A single user action to send message content to a conversation. It includes the submitted content, an idempotency key, in-progress state, and final outcome.
- **Chat Eligibility State**: The user's current ability to enter normal conversation based on existing authentication, onboarding, safety, and coaching-plan status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Frontend integration tests verify that the chatbot lists, creates, retrieves, archives, deletes, and sends messages only through the existing Conversation API capabilities from Spec 004.
- **SC-002**: Frontend routing or navigation tests verify that a user can open chat from the current therapy/coaching plan, return to the plan, and continue an existing conversation from the plan without creating a new backend capability.
- **SC-003**: Frontend tests verify that refreshing the page, revisiting the chatbot, or reopening an existing conversation restores conversation history from existing backend conversation state.
- **SC-004**: Frontend tests verify that all backend response states from Spec 004 are represented distinctly in the interface, including loading, completed answer, clarification, insufficient evidence, technical failure, archived, deleted, empty list, and list-load failure.
- **SC-005**: Frontend tests verify that failed-send retry creates a new send attempt with a new idempotency key and does not call a dedicated retry endpoint.
- **SC-006**: Frontend tests verify that citations render when provided, page or section metadata is shown when available, fallback metadata is shown when needed, and messages without sources do not show misleading citation UI.
- **SC-007**: The frontend communicates exclusively with the existing Conversation API and never directly with Python RAG, Qdrant, or LLM providers.
- **SC-008**: Responsive layout tests verify that conversation list, active conversation, citations, and composer function correctly on desktop and mobile-sized layouts.
- **SC-009**: Existing frontend tests, type checking, linting, and production build all succeed with the chatbot feature included.

## Assumptions

- Spec 004 provides the existing backend conversation capabilities for create, list, retrieve, archive, delete, and send-message behavior consumed by this frontend feature.
- Chat availability follows the existing authenticated, post-onboarding, non-safety-hold eligibility rules rather than introducing a new frontend authority.
- Navigation between the therapy/coaching plan and chatbot preserves user context through existing routing and server state patterns; it does not add AI behavior, backend behavior, or separate local persistence.
- Conversation display labels use existing backend-provided titles or a simple fallback label; users cannot edit titles in the MVP.
- Delete is treated as a destructive action requiring confirmation; archive is reversible only through existing backend-supported behavior.
- Retry means submitting the same message content again as a new send attempt with a new idempotency key; no separate retry endpoint or backend reprocessing command is introduced.
- The MVP does not add message search, conversation sharing, attachments, voice, streaming, summaries, agents, tools, or provider controls.
- The frontend displays backend-provided assistant content and status; it does not synthesize coaching, therapeutic, or evidence claims on its own.

## Reference Alignment *(mandatory)*

- **PRD.md**: Aligns with the AI Chat, personalized coaching, evidence-based support, conversation deletion, responsive UI, privacy, and safety requirements while preserving MVP exclusions for medical diagnosis, medication advice, voice/video, and replacing licensed therapists. The PRD mentions streaming AI responses, but this MVP explicitly defers streaming per the user constraint and Spec 004's synchronous conversation contract.
- **SAD.md**: Aligns with the frontend-to-backend boundary, module ownership, authenticated service boundaries, and the rule that frontend clients must not call the RAG service, vector store, or model providers directly. This spec consumes existing conversation capabilities and does not move retrieval, generation, safety, or persistence into the frontend.
- **Frontend_Architecture.md**: Aligns with protected post-onboarding routes, feature-based chat responsibilities, service-layer API communication, loading/error/empty states, route guards, responsive design, reusable chat UI, and Arabic/English support. The architecture document mentions streaming chat as a future direction, but this MVP resolves the conflict by requiring non-streaming chatbot behavior only.
- **Conflicts / Gaps**: No Spec 004 changes are required. The main reference gap is that older product and frontend references mention streaming and summaries, while this feature explicitly excludes streaming and summarization for MVP. This spec resolves the gap by treating them as future enhancements, not requirements for Spec 005.
