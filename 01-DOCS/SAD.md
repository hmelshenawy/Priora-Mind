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

Owns: - UserAccount - RefreshToken - VerificationToken

Responsibilities: - Register - Login - Logout - Email verification -
Password reset

------------------------------------------------------------------------

## Profile Module

Owns: - Profile - Preferences

Responsibilities: - User profile - Language - Timezone

------------------------------------------------------------------------

## Assessment Module

Owns: - Assessment - AssessmentAnswer

Responsibilities: - Assessment lifecycle - Answer storage

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
summarization - Prompt construction - Safety execution - Knowledge
retrieval

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
