# Research: Conversation AI and RAG Orchestration

## Decision: Add A Backend Conversations Module

**Rationale**: The feature needs owner-isolated conversation lifecycle, message persistence, idempotency, archive/delete behavior, and `/api/v1` endpoints. Existing modules do not own this domain, and putting persistence inside AI would mix product state with provider orchestration.

**Alternatives considered**: Reusing the coaching module was rejected because coaching-plan lifecycle and chat conversation lifecycle are different domains. Creating an AI microservice was rejected because the spec explicitly keeps AI orchestration inside the backend MVP.

## Decision: Keep AI As A Logical Backend Boundary

**Rationale**: Existing backend AI code already uses provider-neutral direction and deterministic fakes for coaching. Conversation generation and follow-up rewrite should follow the same pattern: conversation services call provider-neutral ports, while provider-specific request/response handling stays outside lifecycle services.

**Alternatives considered**: Provider-specific calls in conversation services were rejected because they would make tests harder and couple persistence to one LLM. A separate deployable AI service was rejected as out of scope.

## Decision: Adapt Conversation RAG To `POST /v1/search`

**Rationale**: The implemented Python RAG service exposes `POST /v1/search` with `question`, optional `limit`, and optional `score_threshold`, returning `{ results: [...] }`. Spec 004 treats this as the authoritative current subset for conversational RAG. The backend can normalize it into conversation-specific statuses and preserve backend ownership of sufficiency, prompt construction, citations, and generation.

**Alternatives considered**: Adding a Python `/v1/retrieval/query` compatibility endpoint remains possible, but it is not required for conversation MVP planning and risks expanding the Python surface. Moving prompts or generation into Python was rejected by the spec.

## Decision: Use Deterministic Routing Before RAG Default

**Rationale**: Safety must take precedence, and greetings/thanks/system commands should avoid external calls. After those checks, substantive content routes to RAG by default to prevent unsupported psychological, coaching, or educational claims.

**Alternatives considered**: An LLM intent classifier and `LLM_ONLY` route were rejected because the spec excludes them from MVP. Keyword-only RAG/scope classification was rejected because RAG-by-default is safer and simpler.

## Decision: Deterministic Follow-Up Detection With LLM Rewrite Only When Needed

**Rationale**: Clear standalone messages should use their original text as the retrieval query. Ambiguous follow-ups need recent context to retrieve relevant evidence, but the LLM must only rewrite the query and must not choose the main route. Insufficient context and technical rewrite failure have separate persisted outcomes.

**Alternatives considered**: Always rewriting was rejected because it increases cost, latency, and provider data sharing. LLM-based route classification was rejected by scope.

## Decision: Persist One User Message And At Most One Assistant Message Per Send Attempt

**Rationale**: The spec requires user-message persistence before external calls and idempotency across completed and failed final states. A unique idempotency key per user/conversation prevents duplicate user messages and duplicate assistant messages when clients retry.

**Alternatives considered**: Background jobs or a dedicated retry endpoint were rejected as out of scope. Create-conversation idempotency was rejected because the spec defers it.

## Decision: Store Citation Snapshots On Assistant Messages

**Rationale**: The future frontend must render answer sources without re-querying RAG, and audit/debug needs the exact source metadata used for the saved answer. Sources should cascade with their assistant message and conversation.

**Alternatives considered**: Storing only chunk ids was rejected because RAG metadata may change and the frontend needs stable display fields. Creating a global source registry was rejected as unnecessary for MVP.

## Decision: Treat Empty/Weak Retrieval Separately From Technical RAG Failure

**Rationale**: Empty or low-relevance retrieval is a valid grounded outcome and should complete with an insufficient-evidence response. Timeout, unavailable service, unauthorized, missing token, malformed response, or malformed chunks are technical failures and should persist `FAILED` with safe metadata.

**Alternatives considered**: Calling the LLM despite weak retrieval was rejected because it would allow unsupported claims. Treating all RAG problems as insufficient evidence was rejected because operational failures must be distinguishable.

## Decision: Use Existing Vitest Test Layout And Deterministic Fakes

**Rationale**: The backend already has `tests/unit`, `tests/contract`, and `tests/e2e`, plus fake provider patterns. Spec 004 needs deterministic verification without paid LLM calls and one controlled backend-to-Python-RAG integration.

**Alternatives considered**: Live LLM tests in normal CI were rejected due to cost and availability. Browser/UI tests were rejected because frontend chat is Spec 005.
