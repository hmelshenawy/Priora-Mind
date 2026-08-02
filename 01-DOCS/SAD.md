# Priora Mind - Software Architecture Document (SAD)

**Version:** 1.0 **Status:** Draft

------------------------------------------------------------------------

# 1. Purpose

This document describes the technical architecture of Priora Mind. It
defines system boundaries, module responsibilities, AI architecture,
data ownership, and architectural decisions.

------------------------------------------------------------------------

# 2. Architecture Style

-   Modular Monolith
-   Layered Architecture
-   Domain-Oriented Modules
-   Provider-independent AI
-   AI orchestrated through services

------------------------------------------------------------------------

# 3. Technology Stack

## Frontend

-   Next.js
-   TypeScript

## Backend

-   NestJS
-   TypeScript

## Database

-   PostgreSQL

## Vector Database

-   Qdrant

## AI

-   OpenAI / Ollama (provider abstraction)

------------------------------------------------------------------------

# 4. High-Level Architecture

``` text
Next.js Frontend
        │
        ▼
NestJS Backend
 ├── Auth
 ├── Profile
 ├── Assessment
 ├── Coaching
 ├── Session
 ├── Chat
 └── AI
      ├── AI Orchestrator
      ├── Safety
      ├── Prompt Builder
      ├── Knowledge Retriever
      └── LLM Provider
        │
        ├── PostgreSQL
        ├── Qdrant
        └── External AI Provider
```

------------------------------------------------------------------------

# 5. Module Ownership

## Auth Module

Owns: - UserAccount - RefreshToken - VerificationToken - ConsentRecord

Responsibilities: - Register - Login - Logout - Email verification -
Password reset - Consent recording (notice version + timestamp)

------------------------------------------------------------------------

## Profile Module

Owns: - Profile - Preferences - OnboardingState

Responsibilities: - User profile - Language - Timezone - Onboarding
lifecycle state

------------------------------------------------------------------------

## Assessment Module

Owns: - Assessment - AssessmentAnswer - AssessmentResult

Responsibilities: - Assessment lifecycle - Answer storage -
Deterministic (non-AI) assessment scoring

------------------------------------------------------------------------

## Coaching Module

Owns: - CoachingPlan - FocusArea - Goal - ActionStep -
CoachingPlanGeneration - CoachingActionLibrary - CoachingDisclaimer

Responsibilities: - Coaching-plan eligibility - Grounding-bundle
assembly - Structured-output validation - Plan persistence - Plan
lifecycle - Goal management - Action-step management - Generation audit
metadata - Versioned coaching library and disclaimer snapshots

ActionStep fulfills the Exercise role for the MVP coaching plan.
PlanVersion is modeled as `planVersion` and `isCurrent` columns on
CoachingPlan, not as a separate entity.

------------------------------------------------------------------------

## Session Module

Owns: - Session - Message - SessionSummary

Responsibilities: - Session lifecycle - Conversation history - Summary
persistence

------------------------------------------------------------------------

## AI Module

Owns: No business entities.

Responsibilities: - Coaching LLM provider adapter for
`COACHING_LLM_PORT` - Versioned coaching prompt templates - Chat
generation - Session summarization - Prompt construction -
Generative-AI output safety validation - Knowledge retrieval

For coaching plans, the AI Module owns provider access and prompt
templates only. It MUST NOT bypass Coaching ownership, eligibility,
grounding, validation, persistence, lifecycle, or authorization rules.

Note: Deterministic safety classification and the safety response are
owned by the Safety Module, not the AI Module. The AI Module's safety
responsibility is limited to validating generative-AI output.

------------------------------------------------------------------------

## Safety Module

Owns: - SafetyEvaluation

Responsibilities: - Deterministic risk classification
(NORMAL/DISTRESS/HIGH_RISK/CRISIS) of user inputs and assessment
answers - HIGH_RISK safety decision matrix - Deterministic CRISIS
response - Fail-closed fallback - Safety-classification rule versioning

The Safety Module owns deterministic safety classification and the
safety response. It is separate from Assessment scoring and is NOT
part of the AI provider integration. It is reusable by current
(assessment) and future (chat/session) safety-sensitive flows.

------------------------------------------------------------------------

# 6. Domain Model

User - Profile - Assessments - CoachingPlans - Sessions

CoachingPlan - Goals - Exercises

Session - Messages - SessionSummary

------------------------------------------------------------------------

# 7. AI Architecture

The AI module acts as a service layer.

Coaching-plan generation is a Coaching-owned hybrid domain flow. Coaching
deterministically checks eligibility and safety, builds the bounded
grounding bundle, invokes the AI Module through the `COACHING_LLM_PORT`,
validates the structured bilingual output, persists accepted output, and
owns all lifecycle transitions. The AI Module supplies the config-driven
provider adapter and versioned prompts; it does not write Coaching entities.

Coaching plans track two independent statuses: `generationStatus`
(`PENDING`, `GENERATING`, `READY`, `FAILED`) for generation progress, and
nullable `planStatus` (`PROPOSED`, `ACTIVE`, `COMPLETED`) for lifecycle.
Successful validation atomically sets `generationStatus=READY` and
`planStatus=PROPOSED`. User acceptance changes only `planStatus` from
`PROPOSED` to `ACTIVE`; action progress changes only `planStatus` between
`ACTIVE` and `COMPLETED`. `FAILED` is never a plan lifecycle status.

Async generation uses a tracked, lease-bounded in-process runner owned by
Coaching. A conditional `PENDING` -> `GENERATING` claim prevents duplicate
provider calls; `generationStartedAt`, `generationDeadlineAt`, and
`currentAttemptId` support lease recovery; stale attempts are reclaimable;
late results are discarded when the attempt id no longer matches. Each
attempt is recorded in `CoachingPlanGeneration` with operational metadata
only. No chain-of-thought, raw assessment content, safety data, or plan
copy is stored in generation audit rows. This requires the approved
long-running NestJS API process; a serverless or scale-to-zero deployment
would require a separate queue decision.

Pre-generation safety excludes users outside permitted coaching levels.
Post-generation validation rejects clinical, diagnostic, medication,
crisis, malformed, ungrounded, or incomplete bilingual output before it can
affect business state.

Flow:

User Message

↓

Safety

↓

Load Context

↓

Knowledge Retrieval

↓

Prompt Builder

↓

LLM Provider

↓

Output Safety

↓

Response

The AI module never writes directly to business entities.

------------------------------------------------------------------------

# 8. Provider Architecture

LLMProvider Interface

↓

BaseLLMProvider

↓

OpenAIProvider

↓

OllamaProvider (future)

Responsibilities: - Text generation - Structured output - Streaming

------------------------------------------------------------------------

# 9. Knowledge Architecture

Knowledge Base: - Arabic - English

Conversation: - Arabic - English

Response: - Same language as user

Coaching knowledge retrieval is owned by the standalone `04-RAG/`
service. The RAG service owns document/source registry, immutable source
versions, lifecycle state (`DRAFT`, `APPROVED`, `ACTIVE`, `SUPERSEDED`,
`REVOKED`), ingestion, cleaning, chunking, embeddings, Qdrant access,
active snapshots, retrieval audits, evaluation datasets, and RAG
operational metrics.

NestJS communicates with RAG only through stable authenticated service
contracts. NestJS MUST NOT connect directly to Qdrant or depend on Qdrant
payload schema. Frontend clients MUST NOT call the RAG service directly.

Knowledge Source:

PDF / Markdown approved coaching sources

↓

Document registry + immutable source versions

↓

Cleaning + deterministic chunking

↓

Embedding provider port

↓

Qdrant vector-store adapter inside RAG

↓

Active knowledge snapshot

↓

Stable RAG retrieval API

↓

NestJS Coaching generation

------------------------------------------------------------------------

# 10. Safety Architecture

Input Safety

-   Risk classification
-   Crisis detection
-   Medical request detection

Output Safety

-   Validate AI response
-   Prevent unsafe advice

Risk Levels

-   NORMAL
-   DISTRESS
-   HIGH_RISK
-   CRISIS

------------------------------------------------------------------------

# 11. Communication Rules

Every entity has exactly one owner.

Modules communicate using services/contracts.

Example

Coaching Module

↓

AI Module

↓

GeneratedPlanDTO

↓

Coaching Module

↓

Persist Plan

The AI module never saves plans directly.

------------------------------------------------------------------------

# 12. Architectural Decisions

ADR-001 Provider abstraction using interfaces.

ADR-002 English knowledge base with multilingual conversations.

ADR-003 Safety layer before and after AI generation.

ADR-004 Build only infrastructure required for MVP.

ADR-005 One entity has one owner module.

ADR-006 Dedicated Safety Module owns deterministic safety
classification (NORMAL/DISTRESS/HIGH_RISK/CRISIS), the HIGH_RISK
decision matrix, and the deterministic CRISIS response, separate from
Assessment scoring and from the AI provider integration. ConsentRecord
is owned by the Auth module; OnboardingState is owned by the Profile
module; AssessmentResult and deterministic scoring are owned by the
Assessment module.

ADR-007 Coaching-owned AI-personalized plan generation. AI-personalized
coaching plans are a core Coaching-owned domain flow using hybrid
deterministic + LLM generation. Coaching owns eligibility, grounding,
validation, persistence, idempotency, ownership, two-status lifecycle, and
pre/post-generation safety. The AI Module owns only the provider adapter
and versioned prompt templates behind the Coaching-owned
`COACHING_LLM_PORT`; it MUST NOT bypass Coaching validation or ownership.
`CoachingPlanGeneration` records generation attempts, including lease
deadline metadata and current-attempt correlation. `COACHING_DELETION_PORT`
MUST delete CoachingPlanGeneration rows with coaching plans through cascade
or equivalent module-owned deletion behavior.

------------------------------------------------------------------------

# 13. Security

-   HTTPS
-   Password hashing
-   JWT Authentication
-   Refresh tokens
-   Data isolation

------------------------------------------------------------------------

# 14. Scalability

Current: - Modular Monolith

Future: - Extract AI as standalone service if required. - Add additional
AI providers. - Add asynchronous processing for heavy AI jobs.

------------------------------------------------------------------------

# 15. Design Principles

-   Separation of Responsibilities
-   Single Responsibility Principle
-   Domain Ownership
-   Provider Independence
-   AI as a Service
-   Safety First
-   Privacy First
-   Keep MVP Simple
-   Avoid Premature Optimization
