# Data Model: Conversation AI and RAG Orchestration

## Conversation

Owner: Conversations module.

Purpose: User-owned container for chat history.

Fields:

- `id`: UUID primary key.
- `userId`: authenticated owner id, foreign key to `UserAccount` with cascade delete.
- `title`: optional string, trimmed and length-bounded at API validation.
- `status`: `ACTIVE` or `ARCHIVED`.
- `createdAt`: creation timestamp.
- `updatedAt`: update timestamp used for list ordering.
- `lastMessageAt`: nullable timestamp updated when messages are persisted.

Relationships:

- Belongs to one `UserAccount`.
- Has many `ConversationMessage` rows.

Indexes and constraints:

- Index `(userId, status, updatedAt)` or equivalent for owner list queries.
- Index `(userId, updatedAt)` for archive-inclusive list queries.
- No client-supplied `userId` accepted by API.

Lifecycle:

- Created as `ACTIVE`.
- `ACTIVE` can transition to `ARCHIVED`.
- `ARCHIVED` can transition to `ACTIVE`.
- Hard delete removes the conversation and cascades messages/sources.
- Sending a message to `ARCHIVED` returns `CONVERSATION_ARCHIVED`.

## ConversationMessage

Owner: Conversations module.

Purpose: One persisted user, assistant, or future system message.

Fields:

- `id`: UUID primary key.
- `conversationId`: parent conversation id.
- `userId`: owner id duplicated for isolation and idempotency queries.
- `role`: `user`, `assistant`, optional future `system`.
- `content`: message text as displayed to the user.
- `route`: nullable for user messages; `SAFETY`, `SYSTEM_COMMAND`, `STATIC_RESPONSE`, or `RAG` for assistant outcomes.
- `status`: `PENDING`, `PROCESSING`, `COMPLETED`, or `FAILED`.
- `idempotencyKey`: required for user send messages, nullable otherwise.
- `respondsToMessageId`: nullable id of the user message an assistant message answers.
- `processingStage`: nullable safe stage such as `SAFETY`, `FOLLOW_UP_REWRITE`, `RAG`, `LLM`, or `CITATION_VALIDATION`.
- `reason`: nullable safe reason such as `INSUFFICIENT_CONTEXT`.
- `failureCode`: nullable stable safe code such as `RAG_TIMEOUT`, `LLM_TIMEOUT`, or `LLM_INVALID_OUTPUT`.
- `failureDetail`: nullable sanitized detail, never raw prompts, stack traces, secrets, or raw provider output.
- `standaloneRetrievalQuery`: nullable rewritten query for ambiguous follow-ups; original user content remains unchanged.
- `provider`: nullable sanitized provider identifier.
- `modelId`: nullable sanitized model identifier.
- `tokenUsage`: nullable JSON with safe usage counters.
- `latencyMs`: nullable integer.
- `createdAt`: creation timestamp.
- `updatedAt`: update timestamp.
- `completedAt`: nullable completion/failure timestamp.

Relationships:

- Belongs to one `Conversation`.
- Assistant messages can reference the user message they respond to.
- Assistant messages have many `AssistantMessageSource` rows.

Indexes and constraints:

- Unique `(userId, conversationId, idempotencyKey)` for non-null user-message idempotency keys.
- Unique `respondsToMessageId` for assistant messages to enforce at most one assistant response per user message.
- Index `(conversationId, createdAt, id)` for chronological pagination.
- Index `(userId, conversationId)` for owner-scoped lookups.

State rules:

- User message is persisted before safety/RAG/LLM calls.
- User message reaches `COMPLETED` once accepted for processing.
- Assistant message reaches `COMPLETED` for successful safety/static/system/RAG answer, insufficient evidence, or insufficient context clarification.
- Assistant message reaches `FAILED` for Safety Check technical failure, follow-up rewrite technical failure, RAG technical failure, LLM failure, invalid provider output, or citation validation failure.
- Reusing the same idempotency key returns the stored user/assistant pair when a final state exists.

## AssistantMessageSource

Owner: Conversations module.

Purpose: Citation snapshot for one assistant message.

Fields:

- `id`: UUID primary key.
- `messageId`: assistant message id.
- `chunkId`: RAG chunk id.
- `sourceId`: source identity from RAG metadata.
- `sourceTitle`: display title.
- `sourceFile`: nullable display file name.
- `sourceType`: source type, currently `pdf` from implementation and extensible to `markdown` if RAG supports it.
- `chunkIndex`: chunk index from RAG.
- `score`: retrieval score.
- `citationPage`: nullable page used for display.
- `pageStart`: nullable range start.
- `pageEnd`: nullable range end.
- `citationHeading`: nullable heading.
- `citationSection`: nullable section.
- `textHash`: chunk text hash.
- `displayOrder`: one-based display order in the assistant answer.
- `createdAt`: creation timestamp.

Relationships:

- Belongs to one assistant `ConversationMessage`.

Indexes and constraints:

- Index `(messageId, displayOrder)`.
- Unique `(messageId, chunkId)` unless implementation needs duplicate chunk references collapsed by display order.

Validation rules:

- Source rows are created only for assistant messages.
- Every source must map to a chunk supplied to the LLM for the current answer.
- Unknown chunk citations are rejected before saving a completed answer.
- Missing page metadata is allowed when title/file/heading/section/chunk fallback metadata exists.

## MessageRoute

Owner: AI/Conversations contract.

Values:

- `SAFETY`: deterministic safety response or safety technical failure.
- `SYSTEM_COMMAND`: supported backend command or scope/help response.
- `STATIC_RESPONSE`: greeting, thanks, or bounded static response.
- `RAG`: default substantive route using retrieval and grounded generation, or documented RAG-path fallbacks.

Future route values may be added behind the router contract without changing conversation ownership APIs.

## MessageProcessingState

Owner: Conversations module.

Values:

- `PENDING`: reserved for accepted work not yet processing.
- `PROCESSING`: processing has started.
- `COMPLETED`: final successful or safe completed outcome.
- `FAILED`: final technical/safety/provider failure outcome.

## RagSearchResult Normalization

Owner: Backend RAG client boundary.

Input from Python:

- `POST /v1/search` with `question`, `limit`, and `score_threshold`.
- Response `{ results: [...] }` with chunk metadata from the current Python result mapper.

Backend normalized statuses:

- `ok`: syntactically valid response with chunks available for backend sufficiency evaluation.
- `insufficient_grounding`: no chunks or weak chunks after backend threshold/budget checks.
- `unavailable`: missing config, unauthorized, non-OK response, or service unavailable.
- `invalid_response`: malformed JSON or missing/invalid required chunk fields.
- `timeout`: request exceeded configured timeout.

Outcome mapping:

- `insufficient_grounding` persists `COMPLETED` assistant message with route `RAG`, empty sources, and insufficient-evidence copy.
- `unavailable`, `invalid_response`, and `timeout` persist `FAILED` assistant message with route `RAG` and safe technical fallback.

## Idempotent Send Flow

1. Validate auth, email verification, onboarding completion, not `SAFETY_HOLD`, conversation ownership, active conversation, idempotency key, and content.
2. In a transaction, claim or find `(userId, conversationId, idempotencyKey)`.
3. If an existing final user/assistant pair exists, return it without reprocessing.
4. Persist the user message before external calls.
5. Process safety, route, follow-up query selection, RAG, LLM, grounding, and citations.
6. Persist assistant message and sources transactionally.
7. Update conversation `updatedAt` and `lastMessageAt`.

## Privacy Rules

- Do not persist raw prompts, hidden chain-of-thought, raw provider diagnostics, secrets, or raw safety reasons in metadata.
- Do not log raw conversation content, retrieved chunk text, prompts, safety-sensitive text, provider credentials, or stack traces in normal logs.
- Send only bounded recent history, current message, standalone retrieval query, and selected retrieved chunks to the LLM provider.
