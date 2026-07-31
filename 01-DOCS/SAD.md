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

Owns: - CoachingPlan - Goal - Exercise

Responsibilities: - Plan lifecycle - Goal management - Exercise
management

------------------------------------------------------------------------

## Session Module

Owns: - Session - Message - SessionSummary

Responsibilities: - Session lifecycle - Conversation history - Summary
persistence

------------------------------------------------------------------------

## AI Module

Owns: No business entities.

Responsibilities: - Plan generation - Chat generation - Session
summarization - Prompt construction - Generative-AI output safety
validation - Knowledge retrieval

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

Knowledge Base: - English only

Conversation: - Arabic - English

Response: - Same language as user

Knowledge Source:

Books

↓

Chunking

↓

Embedding

↓

Qdrant

↓

Retriever

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
