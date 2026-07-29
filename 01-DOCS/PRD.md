# Priora Mind - Product Requirements Document (PRD)

**Version:** 1.0 **Status:** Draft **Product:** Priora Mind

------------------------------------------------------------------------

# 1. Product Vision

Priora Mind is an AI-powered mental wellness and personal growth
platform that delivers evidence-based CBT coaching and life coaching
through personalized AI conversations. The platform helps users
understand their thoughts, build healthier habits, and work toward
meaningful goals while maintaining strong privacy and safety standards.

The AI is a coaching companion, **not** a licensed therapist or medical
professional.

------------------------------------------------------------------------

# 2. Problem Statement

Many people need structured support for stress, anxiety, negative
thinking, and personal growth but cannot always access a coach or
therapist because of cost, availability, or scheduling.

Priora Mind provides structured AI-guided coaching sessions based on
trusted CBT and life-coaching resources.

------------------------------------------------------------------------

# 3. Product Goals

-   Deliver personalized AI coaching.
-   Generate coaching plans tailored to each user.
-   Support Arabic and English conversations.
-   Base responses on trusted CBT and coaching knowledge.
-   Track long-term progress.
-   Prioritize user privacy and safety.

------------------------------------------------------------------------

# 4. Non Goals (MVP)

-   Medical diagnosis
-   Medication recommendations
-   Replacing licensed therapists
-   Voice/video sessions
-   Payments
-   Human therapist marketplace
-   Community features

------------------------------------------------------------------------

# 5. Product Principles

1.  Evidence-Based First
2.  AI Assists, Never Diagnoses
3.  Safety Before Coaching
4.  User Privacy First
5.  Personalization Over Generic Advice

------------------------------------------------------------------------

# 6. Target Users

-   Adults seeking personal growth
-   Users experiencing stress or anxiety
-   People wanting structured CBT exercises
-   Users building healthier habits

------------------------------------------------------------------------

# 7. Core User Journey

1.  Register
2.  Verify email
3.  Complete profile
4.  Complete initial assessment
5.  Generate coaching plan
6.  Start coaching session
7.  Chat with AI
8.  Receive exercises
9.  Complete session
10. Review progress

------------------------------------------------------------------------

# 8. Functional Requirements

## Authentication

-   Register
-   Email verification
-   Login
-   Logout
-   Password reset

## User Profile

-   Create profile
-   Update profile
-   Preferred language
-   Timezone

## Assessment

-   Complete assessment
-   Save answers
-   View previous assessments

## Coaching Plan

-   Generate AI coaching plan
-   View plan
-   Activate plan
-   Pause plan
-   Complete plan

## Goals

-   View goals
-   Track progress

## Exercises

-   View exercises
-   Complete exercises

## Sessions

-   Start session
-   Continue active session
-   End session
-   View history

## AI Chat

-   Chat with AI
-   Personalized responses
-   Session memory
-   Streaming responses

## AI

-   Generate coaching plans
-   Generate session summaries
-   Recommend exercises
-   Update plans

------------------------------------------------------------------------

# 9. AI Requirements

-   English knowledge base
-   Multilingual conversations
-   Arabic or English responses
-   Responses grounded in CBT references
-   Personalized coaching
-   Structured outputs for plans and summaries

------------------------------------------------------------------------

# 10. Safety Requirements

-   Input safety validation
-   Output safety validation
-   Crisis detection
-   Self-harm detection
-   No diagnosis
-   No medication advice
-   Escalation guidance when required

------------------------------------------------------------------------

# 11. Non Functional Requirements

## Performance

-   Fast authentication
-   Streaming AI responses
-   Responsive UI

## Security

-   Secure authentication
-   Password hashing
-   HTTPS
-   User data isolation

## Privacy

-   User owns their data
-   Account deletion
-   Conversation deletion

## Scalability

-   Modular monolith
-   Provider-independent AI
-   Extensible architecture

------------------------------------------------------------------------

# 12. MVP Scope

Included:

-   Authentication
-   Profile
-   Assessment
-   Coaching plan
-   Sessions
-   AI chat
-   RAG
-   Safety
-   Progress tracking

Excluded:

-   Voice
-   Payments
-   Human therapists
-   Mobile app
-   Community

------------------------------------------------------------------------

# 13. Success Metrics

-   Users complete onboarding
-   Users generate coaching plans
-   Users complete multiple sessions
-   User retention
-   Exercise completion rate

------------------------------------------------------------------------

# 14. Risks

-   AI hallucinations
-   Unsafe responses
-   Poor personalization
-   User privacy concerns

Mitigations:

-   RAG
-   Safety layer
-   Evidence-based prompts
-   Human escalation guidance

------------------------------------------------------------------------

# 15. Constraints

-   English-only knowledge base
-   Arabic and English conversations
-   AI coaching only
-   No medical diagnosis
-   No medication recommendations

------------------------------------------------------------------------

# 16. Future Roadmap

-   Voice conversations
-   Human therapist integration
-   Mobile applications
-   Mood tracking
-   Wearable integrations
-   Multiple AI specialists
-   Advanced analytics
