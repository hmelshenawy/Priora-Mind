# Feature Specification: Conversation AI and RAG Orchestration

**Feature Branch**: `004-conversation-ai-rag`

**Feature Directory**: `specs/004-conversation-ai-rag`

**Created**: 2026-08-02

**Status**: Draft - Ready for Planning; Implementation Not Started

**Input**: Build the backend conversation and AI orchestration foundation, connect it to the existing Python RAG retrieval service, and verify the complete backend-to-RAG integration. The backend owns conversation lifecycle, message persistence, routing, safety coordination, prompt construction, LLM calls, grounding, citations, and saved assistant answers. The Python service remains retrieval-only and must not own conversations, prompts, or generation.

## 1. Feature Overview

Priora Mind is a coaching and mental-wellness product, not a medical, psychiatric, psychological, diagnostic, or emergency service. Specs 001-003 established authenticated onboarding and assessment, deterministic safety routing, AI-personalized coaching plans, and a Python retrieval service for approved CBT/coaching knowledge. Spec 004 adds the backend foundation for user conversations and grounded AI answers.

This feature introduces a backend-owned Conversations module and a logically separate backend AI module. The Conversations module owns conversation records, message records, user ownership, idempotency, state transitions, and the API consumed by the future frontend chatbot in Spec 005. The AI module owns message routing, ambiguous follow-up rewriting, prompt building, provider-neutral LLM calls, grounding policy, citation mapping, provider-error normalization, and orchestration support. The Safety module remains the owner of deterministic safety classification and approved safety responses.

The MVP routing policy is deliberately simple and extensible:

- `SAFETY`: deterministic safety route that takes precedence over every other route.
- `SYSTEM_COMMAND`: backend-supported command or lifecycle action that does not require retrieval or generation.
- `STATIC_RESPONSE`: simple greeting, thanks, or bounded product-scope response that does not require retrieval or generation.
- `RAG`: every remaining real question, coaching message, psychological message, or ambiguous follow-up by default.

There is no LLM intent classifier, no general `LLM_ONLY` route, no tools/agents, and no separate AI microservice in this MVP. The router and provider contracts must remain open to adding `LLM_ONLY`, a classifier, tools, or additional knowledge sources later without rewriting conversation persistence or ownership.

The intended runtime architecture is:

```text
Frontend (future Spec 005)
        ↓
Backend
├── Conversations Module
├── AI Module
│   ├── Message Router
│   ├── Prompt Builder
│   ├── LLM Provider abstraction
│   ├── Grounding policy
│   └── Citation mapping
└── RAG Client
        ↓
Python Retrieval Service
├── ingestion
├── chunking
├── embeddings
└── Qdrant search
```

## Clarifications

### Session 2026-08-02

- Q: Who may use normal conversation APIs in the MVP? → A: Only users with completed onboarding and not in `SAFETY_HOLD` may use normal conversation APIs.

## 2. Scope

In scope:

- Backend conversation lifecycle: create, list, retrieve, send message, archive/unarchive, and hard-delete a user's own conversations.
- Conversation and message persistence with user ownership, tenant isolation, ordering, pagination, message roles, message route, processing state, timestamps, idempotency key, failure code, and sanitized failure details.
- Backend AI orchestration for one synchronous MVP send-message flow: persist user message, evaluate safety first, route, retrieve evidence when required, build a grounded prompt, call the configured LLM provider, map citations, persist assistant message, and return the final response.
- Integration with the existing deterministic Safety module and approved safety copy/resource behavior from Spec 001.
- RAG client contract derived from the current Python service while documenting the required compatibility work to support conversational RAG.
- Provider-neutral LLM abstraction with configuration, timeout, normalized errors, and deterministic fakes for automated tests.
- Grounding and citation enforcement for knowledge-dependent answers.
- Backend API contracts for future Spec 005 frontend consumption.
- Backend-to-Python-RAG integration tests with controlled fixtures.
- Essential privacy, safe structured logging, and correlation IDs.

Explicit non-goals:

- Frontend chatbot UI; this is Spec 005.
- Streaming responses in the MVP, although the response model must leave an extension point.
- Voice input/output.
- Agentic tools or tool execution.
- LLM-based message routing or an LLM intent classifier.
- General ungrounded chatbot route or `LLM_ONLY` route.
- Conversation summarization, long-term memory, or session-summary persistence.
- Extracting AI to a separate deployable microservice.
- Changing RAG ingestion, chunking, embeddings, or Qdrant storage unless required to unblock the existing search contract.
- Completing the full coaching-plan lifecycle beyond preserving Specs 002-003 behavior.
- New clinical logic, diagnosis, therapy, medication guidance, or emergency-care behavior beyond the approved Spec 001 safety baseline.

## 3. Assumptions

A1 - Authenticated, verified users only: Conversation endpoints follow the existing protected-route pattern. The backend resolves ownership from the authenticated user and never trusts client-supplied user identifiers.

A2 - Conversations are post-onboarding product behavior: Normal conversation APIs are available only to authenticated, email-verified users whose onboarding is `COMPLETED` and who are not in `SAFETY_HOLD`. This eligibility check reuses the existing onboarding/safety state rather than adding a new authority. Users who are incomplete or in `SAFETY_HOLD` remain in the established onboarding/safety flows and do not enter normal conversation processing.

A3 - Conversation lifecycle is minimal: A conversation can be active or archived. Archive is reversible and hides the conversation from default list results. Delete is a hard delete that removes the conversation and messages through the project's established cascade/retention behavior. Rename/title-update after creation, a `DELETED` lifecycle state, sharing, and multi-user conversations are deferred.

A4 - Send-message MVP is synchronous: The API returns both persisted user and assistant messages in one response. Streaming and async background generation are deferred, but message states preserve a future extension point for streaming or queued processing.

A5 - Message states use a conversation-specific state model: `PENDING`, `PROCESSING`, `COMPLETED`, and `FAILED` are adopted for message processing because no existing message state model exists. Successfully handled safety messages use `status = COMPLETED` and `route = SAFETY`; the safety outcome is stored in the relevant safety metadata/evaluation record.

A6 - RAG is the default knowledge route: After safety, system-command, and static-response checks, remaining substantive messages route to RAG. This prevents unsupported psychological, therapeutic, educational, or CBT claims when retrieval is weak.

A7 - Evidence sufficiency is backend-owned: The backend decides whether retrieved chunks are sufficient to support generation based on the configured result count, relevance scores, and chunk validity. The Python service may apply its own thresholding, but it does not decide whether the LLM may answer.

A8 - Existing RAG contract mismatch is material but not a product ambiguity: Spec 003 documents `/v1/retrieval/query`, the existing backend client calls `/v1/retrieval/query`, and the implemented Python service currently exposes `/v1/search`. Spec 004 treats the implemented Python `/v1/search` contract as the authoritative current subset for conversation MVP integration and requires the backend RAG client to adapt to it or the Python service to add a compatible conversational endpoint during implementation planning.

A9 - LLM provider starts from existing configuration direction: The initial provider is configuration-driven using the existing provider-neutral direction in SAD.md (`OpenAI / Ollama` abstraction) and current backend AI config defaults (`disabled` unless configured). Automated tests use deterministic fakes and never call a live paid provider.

A10 - Conversation context is bounded: The MVP uses recent messages only, not long-term memory or summaries. Clear standalone messages use the original user text as the retrieval query. Only messages matched by deterministic backend follow-up rules use recent history and the configured LLM provider to produce a standalone retrieval query. Conversation summaries are a future extension point and are not implemented now.

A11 - Citation persistence is per assistant message: Sources are saved with the assistant message, not as independent knowledge-base records. RAG remains the source of chunk metadata; the backend persists the citation snapshot needed to render and audit the answer.

A12 - Privacy boundary to external providers: Only the minimum necessary conversation history, standalone retrieval query, selected retrieved chunks, and instructions are sent to the LLM provider. Safety classification details, raw assessment answers, secrets, and unrelated user data are not sent.

## 4. Prioritized User Stories and Acceptance Scenarios

User stories are ordered by priority and are independently testable. Acceptance scenarios use Given/When/Then and avoid relying on the future frontend.

### User Story 1 - Create and view conversations (Priority: P1)

An authenticated user creates a conversation, sees it in their conversation list, and retrieves its messages without seeing any other user's data.

**Why this priority**: Conversation ownership and persistence are prerequisites for every AI interaction and for Spec 005's UI.

**Independent Test**: Using authenticated API calls, a user creates one conversation, lists conversations, retrieves that conversation, and confirms another user cannot access it.

**Acceptance Scenarios**:

1. **Given** an authenticated verified user whose onboarding is `COMPLETED` and who is not in `SAFETY_HOLD`, **When** they create a conversation with an optional title, **Then** a conversation is created for that user with an active lifecycle state and creation/update timestamps.
2. **Given** the user has multiple conversations, **When** they list conversations, **Then** only their non-archived conversations are returned by default, ordered by most recently updated first and paginated.
3. **Given** the user retrieves one conversation, **When** messages exist, **Then** messages are returned in chronological order with stable pagination metadata.
4. **Given** another authenticated user supplies the conversation id, **When** they attempt to retrieve, send to, archive, unarchive, or delete it, **Then** the backend rejects the request and returns no conversation or message content.

**Failure / Safety Scenarios**:

- Missing, expired, or unverified authentication returns the standard auth error and no conversation data.
- Incomplete onboarding or `SAFETY_HOLD` returns the established onboarding/safety routing response and no normal conversation is created or processed.
- An archived conversation is omitted from default list results but can be requested with an explicit archive-including filter by its owner.
- Repeated create requests may create separate conversations; create-conversation idempotency is deferred because send-message idempotency is the MVP duplication risk.

### User Story 2 - Send a message and receive a persisted assistant response (Priority: P1)

The user sends a message to an owned conversation and receives both the persisted user message and the persisted assistant response with route, status, timestamps, and sources.

**Why this priority**: This is the core backend capability that the future chat UI consumes.

**Independent Test**: Send a valid message through the API using fake safety/RAG/LLM dependencies and verify the two message records and API response.

**Acceptance Scenarios**:

1. **Given** an authenticated owner whose onboarding is `COMPLETED`, who is not in `SAFETY_HOLD`, and who has an active conversation, **When** they send a valid non-empty message with an idempotency key, **Then** the user message is persisted before routing and the response includes that user message.
2. **Given** processing completes successfully, **When** the assistant answer is returned, **Then** the assistant message is persisted with `role = assistant`, `status = COMPLETED`, the selected route, content, timestamps, and sources array.
3. **Given** the same idempotency key is retried for the same conversation and user, **When** the first request already reached any stored final result including `COMPLETED` or `FAILED`, **Then** the backend returns the original stored user/assistant message pair and does not create duplicate messages or reprocess the message.
4. **Given** two different idempotency keys are submitted, **When** both messages are valid, **Then** each creates a distinct user message and at most one assistant message per user message.

**Failure / Safety Scenarios**:

- If technical retrieval or generation failure occurs after the user message is saved, the user message remains `COMPLETED`, the assistant message is saved as `FAILED` with a safe technical failure response, and sanitized failure metadata is recorded.
- If the database cannot save the user message, the request fails before retrieval or LLM calls begin.

### User Story 3 - Answer knowledge and coaching questions using RAG with sources (Priority: P1)

A knowledge, coaching, or psychological support question routes to RAG by default, uses retrieved approved evidence, produces a grounded answer, and includes source citations.

**Why this priority**: Priora Mind's AI answers must be evidence-grounded and bounded; ungrounded psychological claims are not allowed.

**Independent Test**: Use a controlled RAG fixture returning relevant chunks and a fake LLM that cites those chunks; verify persisted answer and citations match the returned chunks.

**Acceptance Scenarios**:

1. **Given** a substantive coaching question, **When** safety does not block it and it is not a system command or static response, **Then** the selected route is `RAG`.
2. **Given** RAG returns sufficient relevant chunks, **When** the prompt is built, **Then** the LLM receives separated instructions, bounded recent conversation history, the current user message, the standalone retrieval query, and only the retrieved chunk texts/metadata selected for this answer.
3. **Given** the LLM answer cites supplied chunks, **When** citation mapping runs, **Then** each persisted source maps to a chunk actually supplied to the LLM and includes stable citation metadata for the API response.
4. **Given** the assistant message is returned, **When** Spec 005 consumes it, **Then** it can render answer text and sources without additional backend redesign.

**Failure / Safety Scenarios**:

- Retrieved document text is treated as untrusted content; instructions inside retrieved chunks are not followed as system or developer instructions.
- Missing page metadata does not block citation display; the source falls back to title/file/section/chunk metadata.

### User Story 4 - Resolve follow-up questions using recent conversation context (Priority: P1)

The user asks an ambiguous follow-up such as "why?", "explain more", or "what should I do?". Deterministic backend rules identify it as dependent on prior context; if sufficient recent context exists, the AI module rewrites it into a standalone retrieval query before RAG search.

**Why this priority**: Conversational usefulness requires follow-ups to retrieve the right evidence without adding long-term memory or summaries.

**Independent Test**: Seed a conversation with prior messages, send clear and ambiguous message fixtures, and verify clear messages use original text, ambiguous messages with enough context store a rewritten query and call RAG, insufficient-context messages ask a clarification, and technical rewrite failures do not call RAG.

**Acceptance Scenarios**:

1. **Given** the user sends a clear standalone message, **When** retrieval is needed, **Then** the backend uses the original user text as the retrieval query without rewriting it.
2. **Given** deterministic backend rules identify an ambiguous follow-up and recent conversation history establishes a topic, **When** the message is processed, **Then** the AI module uses the configured LLM provider to build a standalone retrieval query that preserves the user's intent and topic, then continues to RAG.
3. **Given** a standalone query is built, **When** the message is persisted, **Then** the original user message remains unchanged and the rewritten retrieval query is stored as processing metadata for audit/debugging.
4. **Given** deterministic backend rules identify an ambiguous follow-up but recent history is insufficient to determine the user's meaning, **When** the message is processed, **Then** the backend returns a clarification question, persists `status = COMPLETED`, records route `RAG` and reason `INSUFFICIENT_CONTEXT` in existing processing metadata, and does not call RAG.
5. **Given** ambiguous follow-up rewriting fails technically because of timeout, provider failure, or malformed output, **When** the message is processed, **Then** the backend persists `status = FAILED`, records route `RAG`, processing stage `FOLLOW_UP_REWRITE`, and sanitized reason in existing processing metadata, returns the defined safe technical fallback, and does not call RAG.
6. **Given** prior assistant messages have sources, **When** a follow-up is rewritten, **Then** previous sources may inform context but are not re-cited unless their chunks are retrieved again or explicitly supplied to the LLM for the current answer.

**Failure / Safety Scenarios**:

- Follow-up detection is deterministic backend logic, not LLM classification. The rules may identify very short dependent questions such as "why?", "how?", or "then what?", pronouns or references without a clear subject, explicit references to previous discussion, or messages that do not contain enough standalone meaning for retrieval.
- The LLM rewrite provider must not decide the main route or classify a message as `SAFETY`, `SYSTEM_COMMAND`, `STATIC_RESPONSE`, or `RAG`.
- Insufficient context and technical rewrite failure are distinct: insufficient context returns a `COMPLETED` clarification with route `RAG` and reason `INSUFFICIENT_CONTEXT`; technical rewrite failure returns `FAILED` with route `RAG`, processing stage `FOLLOW_UP_REWRITE`, and the defined safe technical fallback.

### User Story 5 - Insufficient retrieval prevents unsupported claims (Priority: P1)

When retrieval is empty or weak, the assistant returns a completed insufficient-evidence response. When RAG is unavailable, times out, or returns malformed data, the assistant returns a failed safe technical response. Neither path invents therapeutic, psychological, or educational claims.

**Why this priority**: Evidence-grounded and bounded AI is a launch-critical safety requirement.

**Independent Test**: Configure RAG to return empty/low-score results and verify the LLM is not called for a knowledge-dependent answer.

**Acceptance Scenarios**:

1. **Given** a knowledge-dependent user message, **When** RAG returns no chunks, **Then** the assistant response states that there is not enough grounded information to answer, has `status = COMPLETED`, and does not call the LLM for an unsupported answer.
2. **Given** RAG returns chunks below the configured sufficiency threshold, **When** grounding policy evaluates them, **Then** the response follows the same `COMPLETED` insufficient-evidence path.
3. **Given** insufficient evidence, **When** the assistant message is persisted, **Then** it has route `RAG`, status `COMPLETED`, an empty sources array, and no unsupported claim.
4. **Given** the user retries the same message, **When** the idempotency key matches, **Then** the same insufficient-evidence assistant message is returned without duplicate retrieval or generation.

**Failure / Safety Scenarios**:

- RAG timeout, unavailable service, or malformed response is not treated as insufficient evidence; the assistant message has `status = FAILED`, route `RAG`, a safe technical failure response, and sanitized failure metadata.

### User Story 6 - Safety messages follow the established safety path (Priority: P1)

Messages indicating high risk or crisis follow the existing deterministic safety system before retrieval or generation.

**Why this priority**: Safety takes precedence over coaching and AI generation.

**Independent Test**: Send messages matching existing safety fixtures and verify safety route, persisted state, approved copy, and no RAG/LLM calls.

**Acceptance Scenarios**:

1. **Given** a message triggers deterministic safety classification, **When** routing begins, **Then** `SAFETY` takes precedence over system-command, static-response, follow-up detection, and RAG routes.
2. **Given** the safety level requires high-risk or crisis behavior, **When** the response is generated, **Then** it uses the approved deterministic safety response and does not depend on RAG or the LLM.
3. **Given** safety routing is successfully handled, **When** messages are persisted, **Then** the assistant message has `status = COMPLETED`, route `SAFETY`, and the safety outcome is stored in the relevant metadata/evaluation record.
4. **Given** safety-sensitive content is processed, **When** logs and traces are emitted, **Then** raw message content, safety reasons, and sensitive labels are not exposed in normal application logs.

**Failure / Safety Scenarios**:

- Technical Safety Check failure fails closed: if safety evaluation cannot complete because of timeout, provider/dependency failure, or malformed response, the assistant message is persisted with `status = FAILED`, route/stage `SAFETY`, and sanitized failure metadata; the fixed fallback advises the user to contact emergency services or a trusted nearby person if they are in immediate danger. Processing must not continue to commands, greetings, follow-up detection/rewrite, RAG retrieval, or normal LLM generation.
- This feature is not a replacement for professional diagnosis, emergency care, or therapy; safety copy must retain the established service boundaries.

### User Story 7 - Backend remains reliable when RAG or LLM fails (Priority: P1)

The backend handles retrieval and generation failures without losing user messages, duplicating assistant messages, leaking internals, or producing unsafe answers.

**Why this priority**: External dependencies are expected to fail; the conversation system must remain consistent.

**Independent Test**: Simulate RAG timeout, RAG unavailable, LLM timeout, LLM unavailable, invalid provider output, and retry after failure.

**Acceptance Scenarios**:

1. **Given** RAG is unavailable, times out, or returns malformed data, **When** a RAG-routed message is processed, **Then** the backend persists exactly one assistant message with `status = FAILED`, route `RAG`, a safe technical failure response, and sanitized failure metadata.
2. **Given** the LLM provider is unavailable or times out after sufficient retrieval, **When** generation fails, **Then** the user message remains persisted and exactly one assistant failure message is persisted for that user message.
3. **Given** the provider returns malformed, empty, unsafe, or uncited output, **When** validation runs, **Then** the output is rejected and not saved as a completed grounded answer.
4. **Given** a retry occurs after a stored failure, **When** the same idempotency key is used, **Then** the original failed result is returned without reprocessing; retrying failed processing in the MVP requires a new idempotency key.

**Failure / Safety Scenarios**:

- Internal diagnostic details, provider stack traces, prompts, and secrets are not exposed in user-facing errors or persisted failure metadata.

### User Story 8 - Static and system-command routes avoid unnecessary AI calls (Priority: P2)

Simple greetings, thanks, and supported backend/system commands are handled without calling RAG or the LLM.

**Why this priority**: This reduces cost, avoids unnecessary data sharing, and proves routing is deterministic before adding future complexity.

**Independent Test**: Send greeting, thanks, and system-command fixtures and verify no RAG/LLM calls occur.

**Acceptance Scenarios**:

1. **Given** the user says a simple greeting, **When** routing runs and no safety issue is detected, **Then** the assistant returns a bounded static response with route `STATIC_RESPONSE` and no RAG or LLM call.
2. **Given** the user says thanks, **When** routing runs and no safety issue is detected, **Then** the assistant returns a short static acknowledgement with no RAG or LLM call.
3. **Given** the user requests a supported backend command such as conversation help or scope information, **When** routing runs, **Then** route `SYSTEM_COMMAND` handles it without RAG or LLM.
4. **Given** text is ambiguous between greeting and safety concern, **When** routing runs, **Then** safety evaluation still occurs first and wins if triggered.

## 5. Independently Testable Acceptance Scenarios (Cross-Cutting)

AC-X1: Conversation ownership is independently testable: no authenticated user can list, retrieve, modify, delete, or send messages to another user's conversation.

AC-X1a: Conversation eligibility is independently testable: incomplete onboarding and `SAFETY_HOLD` users cannot create normal conversations or send normal conversation messages.

AC-X2: Idempotency is independently testable: repeated send-message requests with the same user, conversation, and idempotency key return the original stored result, including a stored failure, and produce one user message and one assistant message.

AC-X3: Routing order is independently testable: safety runs first; system-command and static-response fixtures do not call RAG/LLM; greetings and backend commands are handled before deterministic follow-up detection; all other substantive messages route to RAG.

AC-X4: Grounding is independently testable: sufficient retrieved chunks produce an LLM prompt containing only the selected chunks, and citations in the saved assistant message match those chunks.

AC-X5: Retrieval outcomes are independently testable: empty/weak retrieval returns a `COMPLETED` insufficient-evidence response, while timeout/unavailable/malformed RAG returns a `FAILED` safe technical response. Neither path produces unsupported psychological, therapeutic, or educational claims.

AC-X6: Follow-up rewriting is independently testable: clear standalone messages use original user text as the retrieval query; only messages matched by deterministic follow-up rules are sent to the LLM rewrite provider; ambiguous follow-ups with enough recent history store an LLM-rewritten standalone retrieval query; insufficient context returns a `COMPLETED` clarification with route `RAG` and reason `INSUFFICIENT_CONTEXT`; technical rewrite failure returns `FAILED` with route `RAG` and processing stage `FOLLOW_UP_REWRITE`; the original message remains unchanged.

AC-X7: Safety precedence is independently testable: safety fixtures produce deterministic safety responses with no RAG or LLM dependency.

AC-X8: Failure consistency is independently testable: RAG/LLM failures leave persisted messages in known states and do not create duplicate assistant messages on retry.

AC-X9: Citation API stability is independently testable: every returned source object has stable identifiers and display metadata suitable for Spec 005 rendering.

## 6. Edge Cases

- Empty, whitespace-only, oversized, or invalid message content is rejected before persistence.
- Incomplete onboarding or `SAFETY_HOLD` blocks normal conversation creation and message sending before user-message persistence or AI/RAG processing begins.
- Concurrent sends to the same conversation preserve message ordering by persisted creation time and stable message id.
- Retried requests with missing or different idempotency keys are not treated as duplicates; a new idempotency key is the MVP retry mechanism for failed processing.
- A deleted conversation is hard-deleted through established cascade/retention behavior and is no longer retrievable; an archived conversation remains retrievable by the owner and can be unarchived.
- Conversation history is too long for provider limits; only the bounded recent context is sent, with older content excluded.
- Follow-up question cannot be resolved from recent context; the assistant asks for clarification, records route `RAG` and reason `INSUFFICIENT_CONTEXT`, and does not call RAG.
- Follow-up rewrite fails technically because of timeout, provider failure, or malformed output; the assistant message is `FAILED`, route is `RAG`, processing stage is `FOLLOW_UP_REWRITE`, a safe technical fallback is returned, and RAG is not called.
- RAG returns duplicate chunks, missing required metadata, invalid scores, or chunks not approved/current; invalid chunks are excluded or the response is treated as insufficient.
- Retrieved chunk spans multiple pages; citation uses `page_start`/`page_end` where present and display may show a page range.
- Retrieved chunk has no page metadata; citation falls back to title, file, section, heading, chunk index, and source id.
- LLM returns citations for chunks not supplied to the prompt; answer is rejected.
- LLM returns uncited claims for knowledge-dependent content; answer is rejected or converted to a safe failure response.
- Safety Check cannot complete because of timeout, dependency/provider failure, or malformed response; processing fails closed at route/stage `SAFETY` without commands, greetings, follow-up rewriting, RAG, or normal generation.
- Sensitive content appears in user messages; normal logs must redact content and expose only safe metadata.

## 7. Functional Requirements

Stable IDs. Each requirement is testable. "MUST" denotes a non-negotiable requirement.

### Conversation Lifecycle and Ownership

- **FR-001**: The backend MUST allow an authenticated, email-verified user whose onboarding is `COMPLETED` and who is not in `SAFETY_HOLD` to create a conversation owned by that user, with optional title and an active lifecycle state.
- **FR-002**: The backend MUST list only the authenticated user's conversations by default, ordered by most recently updated first, with cursor or page-based pagination and an explicit option to include archived conversations.
- **FR-003**: The backend MUST retrieve one owned conversation and its messages with chronological message ordering and stable pagination.
- **FR-004**: The backend MUST support owner-only archive/unarchive and hard delete behavior. Archive hides from default lists and is reversible; delete removes the conversation and messages according to established cascade/retention behavior.
- **FR-005**: The backend MUST enforce user ownership on create/list/retrieve/archive/unarchive/hard-delete/send operations and MUST NOT trust client-supplied user identifiers.
- **FR-006**: Conversation operations MUST reject archived conversations for new message sends unless planning explicitly defines an unarchive-before-send behavior. Hard-deleted conversations are not retrievable and must behave as not found.
- **FR-006a**: Normal conversation create/list/retrieve/archive/unarchive/hard-delete/send operations MUST require onboarding `COMPLETED` and not `SAFETY_HOLD`, reusing the existing onboarding/safety state authority. Ineligible users MUST receive the established onboarding/safety routing response and MUST NOT enter normal conversation AI orchestration.

### Message Persistence and Idempotency

- **FR-007**: The backend MUST persist the user message before safety, retrieval, or LLM generation begins.
- **FR-008**: Message records MUST include role (`user`, `assistant`, and optionally `system` for future internal use), content, route where applicable, processing state, timestamps, idempotency key for user sends, failure code, sanitized failure detail, and owner/conversation references.
- **FR-009**: Message processing states MUST include `PENDING`, `PROCESSING`, `COMPLETED`, and `FAILED`, unless planning identifies an existing stronger state model before implementation.
- **FR-010**: Send-message idempotency MUST prevent duplicate user messages and duplicate assistant messages for the same authenticated user, conversation, and idempotency key.
- **FR-011**: The backend MUST persist at most one assistant response for each user message. Reusing the same idempotency key MUST return the original stored result, including a stored failure, and MUST NOT reprocess the message.
- **FR-012**: If processing fails after the user message is saved, the persisted record(s) MUST expose a stable failed or safe-fallback state without losing the original user message.
- **FR-012a**: Retrying failed processing in the MVP MUST use a new idempotency key. A dedicated retry endpoint is out of scope.

### Message Routing and AI Orchestration

- **FR-013**: The router MUST evaluate routes in this order: validate user/conversation ownership, persist user message, safety check, system-command detection, static greeting/thanks detection, deterministic follow-up detection for retrieval-query selection, RAG by default.
- **FR-014**: The initial route enum MUST be limited to `SAFETY`, `SYSTEM_COMMAND`, `STATIC_RESPONSE`, and `RAG`.
- **FR-015**: The MVP MUST NOT introduce an LLM intent classifier, `LLM_ONLY` route, tool/agent route, or separate AI microservice.
- **FR-016**: The router/provider contracts MUST allow future addition of `LLM_ONLY`, classifier routing, tools, or alternate knowledge sources without changing conversation ownership or message persistence APIs.
- **FR-017**: Simple greetings, thanks, and supported system commands MUST NOT call RAG or the LLM after safety passes.
- **FR-018**: Every substantive coaching, psychological, educational, or knowledge-dependent user message MUST route to RAG by default.
- **FR-018a**: Deterministic follow-up detection MUST NOT decide the main route and MUST run only after safety, backend commands, and greetings/static responses have been handled.

### Conversation Context and Follow-Ups

- **FR-019**: The MVP MUST send only bounded recent conversation history to standalone-query construction and answer generation. The default planning target is up to the latest 10 messages or a configured character/token budget, whichever is smaller.
- **FR-020**: Clear standalone messages MUST use the original user text as the retrieval query and MUST NOT be rewritten.
- **FR-021**: Ambiguous follow-up detection MUST be deterministic backend logic, not an LLM classifier. Rules MAY identify very short dependent questions, pronouns or references without a clear subject, explicit references to previous discussion, or messages without enough standalone meaning for retrieval.
- **FR-021a**: The original user message MUST be persisted exactly as submitted; the rewritten standalone retrieval query, when produced, MUST be retained as processing metadata.
- **FR-021b**: Only messages matched by deterministic follow-up rules MAY be sent to the configured LLM provider for rewriting with recent conversation history. The LLM MUST NOT classify the message as `SAFETY`, `SYSTEM_COMMAND`, `STATIC_RESPONSE`, or `RAG` and MUST NOT decide the main route.
- **FR-021c**: If sufficient conversation context exists for an ambiguous follow-up, the AI module MUST use the configured LLM provider to rewrite it as a standalone search query and then continue to RAG.
- **FR-021d**: If context is insufficient to determine the user's meaning, the backend MUST return a clarification question, persist `status = COMPLETED`, record route `RAG` and reason `INSUFFICIENT_CONTEXT` in existing processing metadata, and MUST NOT call RAG.
- **FR-021e**: If the rewrite operation fails technically because of timeout, provider failure, or malformed output, the backend MUST persist `status = FAILED`, record route `RAG`, processing stage `FOLLOW_UP_REWRITE`, and sanitized reason in existing processing metadata, return the defined safe technical fallback, and MUST NOT call RAG.
- **FR-022**: Previous sources MUST NOT be automatically cited in a new assistant answer unless their chunks are supplied to the LLM for that answer.
- **FR-023**: Conversation summaries and long-term memory MUST NOT be implemented in this MVP; the data model and service boundary MAY reserve a future extension point.

### RAG Client Contract

- **FR-024**: The backend MUST communicate with RAG only through authenticated service APIs and MUST NOT connect directly to Qdrant.
- **FR-025**: The frontend MUST NOT call the RAG service or Qdrant directly.
- **FR-026**: For Spec 004, the authoritative implemented Python search subset is `POST /v1/search` with request fields `question`, optional `limit`, and optional `score_threshold`, returning `{ results: [...] }`.
- **FR-027**: The backend RAG client MUST either adapt conversational RAG calls to the current `/v1/search` contract or planning MUST add a compatible Python endpoint before implementation. The endpoint choice must be resolved without moving prompts or LLM generation into Python RAG.
- **FR-028**: The backend MUST own result limit, sufficiency threshold, context budget, timeout, and low-relevance handling for conversation answers, even if Python also applies `limit` and `score_threshold`.
- **FR-029**: RAG health/connectivity checks MUST use the existing authenticated health behavior and map missing service token, unauthorized, missing Qdrant URL, Qdrant failure, timeout, and malformed responses to stable backend error outcomes.
- **FR-030**: Empty results and low-relevance results MUST produce a `COMPLETED` insufficient-evidence assistant response and MUST prevent unsupported generation for knowledge-dependent messages.
- **FR-030a**: RAG timeout, unavailable service, and malformed RAG responses MUST produce a `FAILED` safe technical assistant response and sanitized failure metadata.
- **FR-031**: Returned chunk metadata used by Spec 004 MUST include the authoritative implemented subset: `chunk_id`, `score`, `text`, `source_id`, `source_title`, `source_file`, `source_type`, `chunk_index`, `page_number`, `page_start`, `page_end`, `citation_page`, `citation_heading`, `citation_section`, and `text_hash`.

### LLM Provider Abstraction

- **FR-032**: Conversation generation MUST use a provider-neutral LLM interface owned by the backend AI boundary, not provider-specific logic inside conversation services.
- **FR-033**: The configured provider, model, timeout, and secrets MUST come from environment/configuration and MUST NOT be logged or returned to clients.
- **FR-034**: The LLM request MUST support timeout. Timeout, unavailable provider, rate limit, malformed output, unsafe output, and invalid citation output MUST normalize to stable backend failure codes.
- **FR-035**: Automated tests MUST use deterministic fake LLM providers and MUST NOT depend on paid tokens or external provider availability.
- **FR-036**: Provider responses for grounded answers MUST be validated before persistence. Invalid provider output MUST NOT be saved as a completed grounded assistant answer.

### Grounding and Citations

- **FR-037**: Knowledge-dependent answers MUST use retrieved evidence. Unsupported therapeutic, psychological, or educational claims are prohibited when retrieval is insufficient.
- **FR-038**: The answer prompt MUST clearly separate system/product instructions, recent conversation history, the current user message, the standalone retrieval query, and retrieved content.
- **FR-039**: Retrieved document text MUST be treated as untrusted content and MUST NOT be allowed to override system/product instructions.
- **FR-040**: Citations MUST be mapped only from chunks actually supplied to the LLM for the current answer.
- **FR-041**: Assistant-message citation metadata MUST be persisted with the assistant message and returned as stable API source objects.
- **FR-042**: Citation objects MUST support multi-page chunks through page ranges when available and fallback display metadata when page metadata is missing.
- **FR-043**: The backend MUST reject or safely fail any answer whose citations reference unknown chunks, contradict returned chunk metadata, or omit required source identity.

### Safety

- **FR-044**: Safety evaluation MUST occur before retrieval and ordinary generation for every sent user message.
- **FR-045**: Safety routing MUST take precedence over every other route.
- **FR-046**: Crisis or high-risk responses MUST use the established deterministic Safety module behavior and MUST NOT depend on RAG or LLM availability.
- **FR-047**: Successfully handled safety messages MUST persist the assistant message with `status = COMPLETED` and route `SAFETY`; the safety outcome MUST be stored in the relevant safety metadata/evaluation record according to the existing Safety module ownership model.
- **FR-047a**: If the Safety Check cannot complete because of timeout, provider/dependency failure, or malformed response, the backend MUST persist the assistant message with `status = FAILED`, record route/stage `SAFETY` and sanitized failure metadata in existing processing metadata, return the fixed safety technical-failure fallback, and MUST NOT continue to commands, greetings, follow-up detection/rewrite, RAG retrieval, or normal LLM generation.
- **FR-047b**: The fixed safety technical-failure fallback MUST advise the user to contact emergency services or a trusted nearby person if they are in immediate danger, without inventing local hotline numbers or clinical claims.
- **FR-048**: Sensitive safety content, raw message content, safety reasons, and approved safety copy MUST NOT appear in normal application logs.
- **FR-049**: The feature MUST preserve the statement that Priora Mind is not professional diagnosis, therapy, emergency care, or a replacement for qualified support.

### API Contracts

- **FR-050**: The backend MUST expose protected conversation endpoints for create, list, retrieve, archive/unarchive, hard delete, and send message, following the existing `/api/v1` and error-response conventions. Rename/title-update after creation is deferred from MVP acceptance.
- **FR-051**: Send-message responses MUST include the conversation id, persisted user message, persisted assistant message, assistant route, assistant status, and sources array.
- **FR-052**: Request validation MUST reject missing/empty/oversized message content, invalid UUIDs, invalid pagination parameters, invalid idempotency keys, and unknown lifecycle actions.
- **FR-053**: API errors MUST use stable codes and safe messages. Internal details, prompts, raw provider output, stack traces, and secrets MUST NOT be exposed.
- **FR-054**: Streaming is not required for MVP, but API and message state design MUST leave a clean extension point for future streaming.

### Persistence and Transaction Boundaries

- **FR-055**: The schema MUST add conversation, message, and assistant-citation/source persistence owned by the Conversations module, with cascade/account-deletion behavior aligned with existing retention policy.
- **FR-056**: User-message insertion and idempotency claim MUST happen transactionally before external RAG/LLM calls.
- **FR-057**: Assistant-message completion and citation persistence MUST happen transactionally so an answer and its sources cannot be partially saved.
- **FR-058**: Provider/model metadata MAY be persisted only as sanitized operational metadata useful for support, cost, latency, and audit; secrets, prompts, hidden chain-of-thought, and raw sensitive diagnostics MUST NOT be persisted.
- **FR-059**: Failure metadata MUST store safe error codes and non-sensitive diagnostics only.
- **FR-059a**: Route, processing stage, and reason values such as `SAFETY`, `RAG`, `FOLLOW_UP_REWRITE`, `INSUFFICIENT_CONTEXT`, `RAG_TIMEOUT`, or rewrite failure codes MUST be represented using the existing message metadata/failure metadata pattern. Spec 004 MUST NOT introduce new persistence structures solely for these values unless planning finds an existing convention requires it.

### Failure Handling and Privacy

- **FR-060**: Empty retrieval, low-relevance retrieval, RAG unavailable, RAG timeout, malformed RAG response, Safety Check technical failure, ambiguous-follow-up insufficient context, rewrite technical failure, LLM unavailable, LLM timeout, invalid provider output, and database failure MUST each have documented user-facing behavior and internal sanitized outcome codes.
- **FR-061**: Insufficient-evidence outcomes MUST be distinguishable from technical failures in persisted state without exposing sensitive details.
- **FR-062**: The backend MUST track correlation/request ids across conversation API handling, routing, RAG calls, and LLM calls.
- **FR-063**: Normal logs, traces, analytics, and persisted operational metadata MUST NOT contain raw sensitive conversation content, secrets, prompts, hidden chain-of-thought, raw safety data, or provider credentials.
- **FR-064**: External provider requests MUST include only the minimum necessary data for the current answer or ambiguous follow-up rewrite.

### Testing

- **FR-067**: Unit tests MUST cover router order, static/system/RAG routing, safety precedence, Safety Check technical failure, deterministic follow-up detection, clear-query passthrough, ambiguous follow-up rewriting, insufficient-context clarification, rewrite technical failure fallback, grounding policy, citation mapping, provider-error normalization, and idempotency behavior.
- **FR-068**: Integration tests MUST cover conversation eligibility, ownership/isolation, create/list/retrieve/send APIs, archive/unarchive, hard delete, message state transitions, persistence transaction boundaries, and retry behavior.
- **FR-069**: Contract tests MUST cover backend-to-RAG search request/response mapping, health/error mapping, chunk metadata shape, timeout handling, and no direct Qdrant dependency in the backend.
- **FR-070**: End-to-end backend tests MUST cover greeting without RAG/LLM, system command without RAG, normal RAG answer with citations, clear message uses original retrieval query, deterministic ambiguous follow-up detection, ambiguous follow-up rewrite success, insufficient-context clarification as `COMPLETED` with route `RAG` and reason `INSUFFICIENT_CONTEXT`, rewrite technical failure as `FAILED` with route `RAG` and processing stage `FOLLOW_UP_REWRITE`, insufficient retrieval as `COMPLETED`, RAG technical failure as `FAILED`, safety override as `COMPLETED`/`SAFETY`, Safety Check technical failure as `FAILED`/`SAFETY`, LLM failure, duplicate-message prevention, and citation fields matching retrieved chunks.
- **FR-071**: At least one real backend-to-Python-RAG integration test MUST run against controlled fixtures without live paid LLM calls.
- **FR-072**: A manual smoke test with the real configured LLM provider MAY be documented, but it MUST be optional and excluded from the normal automated suite.

## 8. API Contract Summary

Detailed API shapes are specified in `contracts/conversation-ai-api.md`. Summary:

- `POST /api/v1/conversations` creates an owned conversation.
- `GET /api/v1/conversations` lists owned conversations with pagination and archive filtering.
- `GET /api/v1/conversations/:conversationId` retrieves one owned conversation and paginated messages.
- `PATCH /api/v1/conversations/:conversationId` archives/unarchives the owned conversation.
- `DELETE /api/v1/conversations/:conversationId` hard-deletes the owned conversation according to established cascade/retention behavior.
- `POST /api/v1/conversations/:conversationId/messages` sends one user message and returns persisted user/assistant messages.

Illustrative send-message response:

```json
{
  "conversationId": "uuid",
  "userMessage": {
    "id": "uuid",
    "role": "user",
    "content": "What is a grounding exercise?",
    "status": "COMPLETED",
    "createdAt": "2026-08-02T12:00:00.000Z"
  },
  "assistantMessage": {
    "id": "uuid",
    "role": "assistant",
    "content": "...",
    "status": "COMPLETED",
    "route": "RAG",
    "sources": []
  }
}
```

## 9. Key Entities, Ownership, and Lifecycle States

- **Conversation** (Owner: Conversations module): User-owned conversation container. Fields include id, user id, optional title, lifecycle status (`ACTIVE`, `ARCHIVED`), created/updated timestamps, and last message timestamp. A conversation has many messages. Only the owner can access it. Hard delete removes the row and cascaded children according to established retention behavior rather than using a `DELETED` lifecycle state.
- **ConversationMessage** (Owner: Conversations module): One user or assistant message. Fields include id, conversation id, user id, role, content, route, status, idempotency key for user sends, processing timestamps, failure code/detail, standalone retrieval query, provider/model metadata where safe, and created/updated timestamps.
- **AssistantMessageSource** (Owner: Conversations module): Citation snapshot attached to one assistant message. Fields include source id/title/file/type, chunk id, chunk index, text hash, score, citation page/heading/section, page start/end when available, and display order.
- **MessageRoute** (Owner: AI/Conversations contract): `SAFETY`, `SYSTEM_COMMAND`, `STATIC_RESPONSE`, `RAG` for MVP; future routes can be added behind the router contract.
- **MessageProcessingState** (Owner: Conversations module): `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`.
- **SafetyEvaluation/SafetyEvent** (Owner: Safety module): Existing deterministic safety output reused by conversation flow where applicable. Spec 004 does not create a separate safety authority.
- **RagSearchRequest/RagSearchResult** (Boundary contract): Backend-owned request mapping to the Python retrieval API. Current implemented request subset is question/limit/score_threshold; current response subset is `results[]` with strict chunk metadata.
- **LlmGenerationRequest/LlmGenerationResult** (Owner: AI module provider port): Provider-neutral request/result for grounded answer generation. Conversation services consume normalized success/failure only.

## 10. RAG Client Contract and Current Compatibility Finding

The current implemented Python RAG service exposes:

- `GET /v1/health` with Bearer service token. Success returns `status`, `collection_name`, `embedding_model`, `embedding_dimension`, and `qdrant`. Missing token returns `503 MISSING_SERVICE_TOKEN`; invalid token returns `401 UNAUTHORIZED`; missing Qdrant URL returns `503 MISSING_QDRANT_URL`.
- `POST /v1/search` with Bearer service token. Request fields read by the service are `question` (required non-empty for retrieval), optional `limit`, and optional `score_threshold`. Response shape is `{ "results": [...] }`.
- `results[]` chunks include `chunk_id`, `score`, `text`, `source_id`, `source_title`, `source_file`, `source_type`, `chunk_index`, `page_number`, `page_start`, `page_end`, `citation_page`, `citation_heading`, `citation_section`, and `text_hash`.

The existing backend coaching RAG client and Spec 003 contract expect `POST /v1/retrieval/query` with structured coaching-plan fields and response fields `status`, `chunks`, and metadata. Spec 004 MUST NOT invent a third incompatible contract. During planning, implementation must choose one of these compatible paths:

- Adapt the conversation RAG client to call the currently implemented `/v1/search` endpoint for conversational standalone queries.
- Or add a Python compatibility endpoint for conversational search while preserving Python as retrieval-only.

Either path must keep prompts, LLM calls, evidence sufficiency, and citation persistence in the backend.

## 11. Grounding, Prompt, and Citation Policy

The grounded-answer prompt must separate:

- Product/system instructions and service boundaries.
- Safety and scope constraints.
- Recent conversation history within the configured budget.
- The current user message.
- The standalone retrieval query, when different from the original message.
- Retrieved chunks as quoted, untrusted evidence with chunk ids and citation metadata.

The prompt must instruct the LLM that retrieved documents may contain user-like or instruction-like text that must not override system/product instructions. The answer must stay within coaching/wellness education scope and must not diagnose, prescribe medication, claim therapy, or provide crisis counseling.

Citation mapping rules:

- Only chunks supplied to the LLM for the current answer are eligible citation sources.
- A citation must include at least chunk id, source id, source title, source type/file where available, text hash, and display order.
- Page display uses `citation_page` when present; page ranges use `page_start`/`page_end` when available; missing pages fall back to heading, section, source title/file, and chunk index.
- Multi-page chunks may render as a range.
- The backend persists a snapshot of citation metadata with the assistant message so the future frontend can render stable sources without re-querying RAG.

## 12. Safety Impact and Expected Routing

Safety behavior reuses Spec 001 and `Safety_Decision_Matrix.md` rather than creating a second system. The conversation flow sends user input through deterministic safety evaluation before retrieval and ordinary generation.

- `NORMAL` or no safety trigger: proceed to route selection.
- `DISTRESS`: may continue to normal routing with bounded supportive framing unless the established Safety module requires a specific deterministic response.
- `HIGH_RISK`: deterministic safety routing takes precedence; no RAG or LLM response is used for the safety message. A successfully handled safety assistant message is `COMPLETED` with route `SAFETY`.
- `CRISIS`: deterministic crisis response takes precedence; no RAG or LLM response is used. A successfully handled safety assistant message is `COMPLETED` with route `SAFETY`.
- Safety Check technical failure: fail closed at route/stage `SAFETY`; persist assistant `status = FAILED`; return the fixed safety technical-failure fallback; do not continue to commands, greetings, follow-up detection/rewrite, RAG retrieval, or normal LLM generation.

No new clinical logic is introduced. The feature must not claim to detect, diagnose, treat, or clinically resolve risk.

Fixed safety technical-failure fallback: "I'm having trouble completing the safety check right now, so I can't continue with coaching. If you are in immediate danger or may harm yourself, contact local emergency services now or reach out to a trusted nearby person for immediate help."

## 13. Privacy and Data Impact

- Conversation content is sensitive user data and is owner-isolated.
- Normal logs, traces, metrics, analytics, and failure metadata must not include raw conversation content, safety-sensitive text, prompts, retrieved chunk text, provider secrets, or hidden chain-of-thought.
- RAG receives only the standalone retrieval query, limit, threshold, correlation id, and service authentication needed for search.
- The LLM receives only the minimum bounded conversation history and retrieved chunks required for the current answer.
- Account deletion must remove conversations, messages, and message sources through module-owned deletion behavior aligned with existing retention policy.
- Provider/model metadata may be retained only as safe operational metadata; no secrets or raw provider diagnostics are persisted.

## 14. Failure, Retry, and Recovery

- **Empty/low-relevance retrieval**: Do not call the LLM for unsupported answer generation. Persist a `COMPLETED` insufficient-evidence assistant message with route `RAG` and empty sources.
- **RAG unavailable/timeout**: No unsupported generation. Persist a `FAILED` safe technical assistant message with route `RAG` and sanitized code such as `RAG_UNAVAILABLE` or `RAG_TIMEOUT`.
- **Malformed RAG response**: Treat as technical RAG failure; persist a `FAILED` safe technical assistant message and make no LLM call.
- **Safety Check technical failure**: Persist a `FAILED` assistant message with route/stage `SAFETY`, return the fixed safety technical-failure fallback, and stop processing before commands, greetings, follow-up detection/rewrite, RAG, or normal LLM generation.
- **Ambiguous follow-up with insufficient context**: Persist a `COMPLETED` clarification response, record route `RAG` and reason `INSUFFICIENT_CONTEXT`, and do not call RAG.
- **Ambiguous follow-up rewrite technical failure**: Persist a `FAILED` assistant message, record route `RAG` and processing stage `FOLLOW_UP_REWRITE`, return the defined safe technical fallback, and do not call RAG.
- **LLM unavailable/timeout**: User message remains saved; assistant message becomes `FAILED` with sanitized code. Reusing the same idempotency key returns that stored failure; a new idempotency key is required for a new MVP attempt.
- **Invalid provider output**: Reject before persistence as a completed answer; save safe failed assistant state.
- **Database failure before user-message insert**: No external calls begin; request fails with standard safe error.
- **Database failure after external call but before assistant save**: The idempotency record/user message lets retry reconcile without duplicate assistant messages.
- **Recoverable vs terminal**: Timeouts/unavailable dependencies are recoverable only through a new send-message attempt with a new idempotency key in the MVP; invalid unsafe output is terminal for that stored attempt.

Defined safe technical fallback for non-safety technical failures: "I'm having trouble processing that right now. Please try again in a moment." This fallback must not add psychological, coaching, therapeutic, or educational claims.

## 15. Essential Logging and Privacy Requirements

- Propagate a correlation/request id across API handling, message routing, safety evaluation, RAG calls, LLM calls, and persistence.
- Structured logs should include safe identifiers, operation names, route, outcome, and sanitized error codes only.
- No raw message content, prompts, retrieved text, source full text, secrets, safety answers/reasons, provider credentials, or hidden chain-of-thought in normal logs.

## 16. Testing Requirements

Automated tests must include:

- Unit tests for router order, static greeting/thanks, system-command detection, RAG default, safety precedence, standalone-query building, prompt assembly boundaries, grounding sufficiency, citation mapping, provider-error normalization, and idempotency resolution.
- Integration tests for conversation create/list/retrieve/archive/unarchive/hard-delete/send, ownership isolation, pagination, ordering, message state transitions, transactional user-message persistence, assistant-source persistence, and retry behavior.
- Contract tests for Python RAG health/search auth, request mapping, timeout mapping, malformed response mapping, current chunk metadata fields, empty/low-relevance behavior, and backend no-Qdrant dependency.
- End-to-end backend tests for: incomplete onboarding and `SAFETY_HOLD` block normal conversation APIs; simple greeting does not call RAG/LLM; system command does not call RAG; normal knowledge/coaching question uses RAG by default; clear messages use the original retrieval query; deterministic follow-up detection gates rewrite; ambiguous follow-up is rewritten when context is sufficient; insufficient context returns `COMPLETED` clarification with route `RAG` and reason `INSUFFICIENT_CONTEXT`; rewrite technical failure returns `FAILED` with route `RAG` and processing stage `FOLLOW_UP_REWRITE`; relevant results produce grounded answer and saved citations; empty/weak retrieval produces `COMPLETED` insufficient evidence; RAG technical failure produces `FAILED`; safety route overrides retrieval/generation and completes as `SAFETY`; Safety Check technical failure returns `FAILED` at `SAFETY`; LLM failure persists expected state; retry with the same idempotency key returns the stored result; citation fields match retrieved chunks.
- A real backend-to-Python-RAG integration test using controlled fixtures and a deterministic fake LLM.
- Optional manual smoke test with a real configured LLM provider, excluded from normal automated tests.

## 17. Measurable, Technology-Agnostic Success Criteria

- **SC-001**: An authenticated, email-verified user whose onboarding is `COMPLETED` and who is not in `SAFETY_HOLD` can create a conversation, send a message, and retrieve the conversation history with both user and assistant messages persisted.
- **SC-002**: 100% of ownership tests prevent one user from accessing or modifying another user's conversations, messages, or sources.
- **SC-002a**: 100% of eligibility tests prevent incomplete onboarding and `SAFETY_HOLD` users from creating normal conversations or sending normal conversation messages.
- **SC-003**: 100% of duplicate send-message tests using the same idempotency key return the original stored result, including stored failures, and produce exactly one user message and one assistant message.
- **SC-004**: Greeting and supported system-command fixtures complete without RAG or LLM calls in automated tests.
- **SC-005**: 100% of substantive coaching/knowledge fixtures route to RAG after safety passes.
- **SC-006**: Clear standalone fixtures use the original user text as the retrieval query; deterministic backend follow-up rules select only ambiguous follow-up fixtures for LLM rewrite; ambiguous follow-ups with sufficient recent context produce a stored LLM-rewritten standalone retrieval query that contains the resolved topic.
- **SC-007**: 100% of grounded-answer tests persist citations that match chunks supplied to the LLM for that answer.
- **SC-008**: Empty and low-relevance retrieval fixtures produce `COMPLETED` insufficient-evidence responses, while unavailable, timeout, and malformed RAG fixtures produce `FAILED` safe technical responses; none produce unsupported therapeutic, psychological, or educational claims.
- **SC-009**: Safety fixtures produce deterministic `COMPLETED`/`SAFETY` responses without RAG or LLM dependency, with the safety outcome stored in the relevant metadata/evaluation record.
- **SC-010**: Safety Check technical failure, follow-up rewrite technical failure, RAG technical failure, and LLM timeout/failure tests leave messages in documented final states; reusing the same idempotency key returns the stored failure and a new idempotency key is required for a new MVP attempt.
- **SC-011**: The future Spec 005 frontend can render conversation list, message history, assistant status, route, and sources from the defined API objects without backend redesign.
- **SC-012**: Inspection of normal logs/traces from the automated test suite shows no raw conversation content, prompts, secrets, provider credentials, safety reasons, or hidden chain-of-thought.

## 18. Dependencies on Future Features

- Spec 005 chatbot UI consumes the conversation/message/source APIs defined here.
- Future streaming can append delivery metadata without changing ownership.
- Future `LLM_ONLY`, LLM classifier routing, tools/agents, or additional knowledge sources can be added behind the router/provider interfaces.
- Future conversation summaries can be added as a new context source without changing the current recent-history MVP.
- Future AI microservice extraction remains possible because the backend AI module boundary is logical and provider-neutral, but no separate deployable service is created now.

## 19. Resolved Decisions and Open Decisions

Resolved for planning:

- Backend owns conversations, messages, ownership, routing orchestration, prompt construction, LLM calls, grounding, and citation persistence.
- Python RAG remains retrieval-only and must not own prompts, conversations, or generation.
- Safety runs before retrieval/generation and remains deterministic through the existing Safety module.
- MVP routes are limited to `SAFETY`, `SYSTEM_COMMAND`, `STATIC_RESPONSE`, and `RAG`.
- No `LLM_ONLY`, LLM classifier, tools/agents, streaming, summaries, dedicated retry endpoint, or AI microservice in MVP.
- The implemented RAG chunk metadata subset is authoritative for Spec 004 citation mapping.

Material implementation-planning decision:

- The RAG endpoint compatibility mismatch must be resolved in planning: either adapt backend conversation RAG to current `/v1/search`, or add a compatible Python conversational retrieval endpoint. This is not a product clarification because both options preserve the same public backend API and the same Python retrieval-only boundary.

No unresolved clarification markers remain.

## 20. Reference Alignment

- **Spec 001 - User Onboarding and Initial Assessment**: Reuses Auth ownership, verified-user protection, deterministic Safety module, `NORMAL`/`DISTRESS`/`HIGH_RISK`/`CRISIS` levels, fail-closed safety behavior, no invented crisis resources, service-boundary language, and privacy/logging constraints. No conflicting safety authority is introduced.
- **Spec 002 - Personalized Coaching Plan**: Preserves the provider-port pattern, deterministic domain ownership, grounded/validated LLM output, no raw assessment/safety data in provider context, fake providers for tests, and failure-safe behavior. Conversation AI is separate from coaching-plan lifecycle and does not modify plan ownership.
- **Spec 003 - Coaching RAG MVP**: Preserves the standalone Python RAG service boundary, no frontend/Qdrant access, approved-source retrieval, bounded chunks, citation metadata, and fail-closed grounding behavior. Spec 004 documents the current implementation mismatch and requires compatibility without moving generation into Python.
- **SAD.md**: Aligns with modular monolith, provider-independent AI, Safety module ownership, authenticated RAG contracts, no direct backend Qdrant access, and future extractability. It refines the future Session/Chat responsibility into a concrete Conversations module for this feature while keeping AI as a logical backend module with no direct business-entity persistence.
- **PRD.md**: Supports AI chat, personalized responses, evidence-based coaching knowledge, Arabic/English conversations, privacy, safety, and coaching-not-clinical positioning.
- **Frontend_Architecture.md**: No frontend implementation is included, but the API objects are stable for Spec 005 to render conversation lists, message history, statuses, and citations.
- **Conflicts / Gaps**: The only material gap is RAG endpoint compatibility (`/v1/search` implemented vs `/v1/retrieval/query` documented/expected). No contradiction is introduced in ownership, safety, coaching-plan lifecycle, or RAG service boundaries.

## 21. Constitution Check

- **I. Coaching, Not Clinical Care**: Pass. Answers remain coaching/wellness scoped; no diagnosis, therapy replacement, medication advice, or crisis counseling through LLM.
- **II. Safety Before Coaching**: Pass. Safety runs first and fails closed; high-risk/crisis does not depend on RAG or LLM.
- **III. Evidence-Grounded and Bounded AI**: Pass. Knowledge-dependent answers require retrieved evidence; insufficient retrieval blocks unsupported claims.
- **IV. Domain Ownership and Human-Controlled AI**: Pass. Conversations own persistence; Safety owns deterministic safety; AI owns provider/prompt orchestration; RAG owns retrieval only.
- **V. Structured Coaching Experience**: Pass. Conversations have explicit lifecycle, message states, routes, and sources.
- **VI. Privacy, Data Isolation, User Control**: Pass. Owner isolation, minimum provider context, redacted logs, deletion alignment, and no secrets in persisted metadata.
- **VII. Explicit and Limited Context and Memory**: Pass. Recent bounded history only; no summaries or long-term memory in MVP.
- **VIII. Clean, Modular, Maintainable Code**: Pass. Logical modules and ports avoid provider-specific logic in conversation services.
- **IX. Testing and Verifiable Behavior**: Pass. Unit, integration, contract, e2e, fake LLM, and real backend-to-RAG fixture tests are required.
- **X. Arabic and English Quality Equality**: Pass by boundary. Conversation APIs preserve content and source metadata for future bilingual UI; answer language behavior can follow user preference/current message in planning.
- **XI. Authoritative Project References**: Pass. Aligns with Specs 001-003, SAD, PRD, product safety docs, and current RAG implementation.
- **XII. Simplicity and MVP Discipline**: Pass. Excludes classifier routing, `LLM_ONLY`, streaming, tools, summaries, dedicated retry endpoint, create-conversation idempotency, client-disconnect cancellation requirements, detailed observability infrastructure, microservice extraction, and RAG ingestion changes unless needed for contract compatibility.
