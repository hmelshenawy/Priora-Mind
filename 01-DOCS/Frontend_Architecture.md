# Priora Mind - Frontend Architecture

**Version:** 1.0 **Status:** Draft

------------------------------------------------------------------------

# 1. Purpose

This document defines the frontend architecture for Priora Mind.

Goals:

-   Scalable feature-based structure
-   Clean separation of responsibilities
-   Arabic and English support
-   Streaming AI conversations
-   Maintainable UI

------------------------------------------------------------------------

# 2. Technology Stack

-   Next.js
-   TypeScript
-   React
-   Tailwind CSS
-   shadcn/ui
-   React Hook Form
-   Zod
-   TanStack Query

------------------------------------------------------------------------

# 3. Architecture Principles

-   Feature-first organization
-   Reusable UI components
-   Server state != Client state
-   Keep business logic out of components
-   API communication only through service layer

------------------------------------------------------------------------

# 4. Application Structure

``` text
src/
├── app/
├── features/
│   ├── auth/
│   ├── profile/
│   ├── assessment/
│   ├── coaching/
│   ├── session/
│   └── chat/
├── components/
├── services/
├── hooks/
├── lib/
├── types/
└── i18n/
```

------------------------------------------------------------------------

# 5. Pages

-   Landing
-   Login
-   Register
-   Email Verification
-   Dashboard
-   Profile
-   Assessment
-   Coaching Plan
-   Session List
-   Chat Session
-   Settings

------------------------------------------------------------------------

# 6. Feature Responsibilities

## Auth

-   Login
-   Register
-   Forgot Password
-   Email Verification

## Profile

-   View/Edit Profile
-   Preferences

## Assessment

-   Assessment Wizard
-   Assessment History

## Coaching

-   Dashboard coaching-plan experience
-   Async generation and polling states
-   Explicit plan acceptance
-   Plan Details
-   Goals
-   Action steps
-   Progress

## Session

-   Session List
-   Session Details
-   Session Summary

## Chat

-   Streaming Messages
-   Message Composer
-   Typing Indicator

------------------------------------------------------------------------

# 7. Routing

Public (no auth): - / - /login - /register - /verify-email

Protected onboarding journey (onboarding-state-gated, US1–US6):
- /onboarding/boundary - service-boundary disclosure + required consent (FR-005/FR-006)
- /onboarding/profile - minimum profile (language + timezone)
- /assessment - assessment wizard (intro → questions → review; save/resume)
- /assessment/result - non-diagnostic coaching insight (suppressed while SAFETY_HOLD)
- /safety/hold - SAFETY_HOLD page + re-entry (Safety Matrix §9)

Protected post-onboarding:
- /dashboard - coaching-plan experience: starts or resumes async plan
  generation, polls while `generationStatus` is `PENDING` or
  `GENERATING`, renders `READY` plans in `PROPOSED` state with explicit
  accept control, renders `ACTIVE`/`COMPLETED` progress states, and shows a
  fail-closed unavailable/retry state for `FAILED` or `PLAN_UNAVAILABLE`.
- /profile - authenticated profile view/edit

Future (out of MVP scope, see §17): - /plans - /plans/:id - /sessions - /sessions/:id

------------------------------------------------------------------------

# 8. State Management

Server State: - TanStack Query

Client State: - React Context (minimal)

Local UI State: - useState

No global state unless necessary.

------------------------------------------------------------------------

# 9. API Layer

Components never call fetch directly.

``` text
Component
    ↓
Feature Hook
    ↓
API Service
    ↓
Backend
```

------------------------------------------------------------------------

# 10. Chat Architecture

``` text
Chat Page
    ↓
Chat Hook
    ↓
Chat API
    ↓
Streaming Response
    ↓
UI Updates
```

Responsibilities: - Optimistic UI - Streaming - Retry - Error handling

------------------------------------------------------------------------

# 11. Forms

-   React Hook Form
-   Zod validation
-   Shared validation messages

------------------------------------------------------------------------

# 12. Internationalization

Languages: - English - Arabic

Requirements: - RTL/LTR support - Locale switching - AI responds in
user's preferred language

------------------------------------------------------------------------

# 13. Design System

Reusable components:

-   Button
-   Input
-   Card
-   Dialog
-   Form
-   Tabs
-   Avatar
-   Badge
-   Progress
-   Chat Bubble

------------------------------------------------------------------------

# 14. Error Handling

-   Global Error Boundary
-   Loading States
-   Empty States
-   Toast Notifications
-   API Error Mapping

------------------------------------------------------------------------

# 15. Security

-   Route Guards
-   Token Refresh
-   Protected Pages
-   No sensitive data in local storage

------------------------------------------------------------------------

# 16. Performance

-   Code Splitting
-   Lazy Loading
-   Image Optimization
-   Memoization when needed
-   Streaming chat responses

------------------------------------------------------------------------

# 17. Future Enhancements

-   Offline support
-   Mobile app
-   Voice chat
-   Push notifications
-   PWA
