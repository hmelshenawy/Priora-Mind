-- m_assessment: Assessment-owned assessment/answers/result (US4, data-model §8–§10).
-- Forward-only. All three tables cascade on user deletion (Consent §8/§9). One
-- active assessment per user (unique userId, FR-018a). Per-answer upsert is
-- idempotent via unique(assessmentId, questionId) (FR-014, research D6). Exactly
-- one result per assessment (unique assessmentId, FR-015). `lastActivityAt` on
-- Assessment backs the incomplete-assessment retention cutoff (research D10).
-- The state enum is named `AssessmentStateValue` (the model is `Assessment`) so
-- the two coexist; it maps to the product `assessment_state` enum (spec §9).

CREATE TYPE "AssessmentStateValue" AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'SUSPENDED',
    'SUBMITTED',
    'SCORED'
);

CREATE TYPE "QuestionKind" AS ENUM (
    'current_state',
    'goal_select',
    'goal_rank',
    'goal_free_text',
    'safety'
);

CREATE TABLE "Assessment" (
    "id"                TEXT                  NOT NULL,
    "userId"            TEXT                  NOT NULL,
    "definitionVersion" TEXT                  NOT NULL,
    "state"             "AssessmentStateValue" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt"         TIMESTAMP(3),
    "submittedAt"       TIMESTAMP(3),
    "lastActivityAt"    TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"         TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Assessment_userId_key" ON "Assessment" ("userId");
CREATE INDEX "Assessment_lastActivityAt_idx" ON "Assessment" ("lastActivityAt");
ALTER TABLE "Assessment"
    ADD CONSTRAINT "Assessment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE CASCADE;

CREATE TABLE "AssessmentAnswer" (
    "id"           TEXT         NOT NULL,
    "assessmentId" TEXT         NOT NULL,
    "questionId"   TEXT         NOT NULL,
    "questionKind" "QuestionKind" NOT NULL,
    "value"        JSONB        NOT NULL,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentAnswer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssessmentAnswer_assessmentId_questionId_key"
    ON "AssessmentAnswer" ("assessmentId", "questionId");
CREATE INDEX "AssessmentAnswer_assessmentId_idx" ON "AssessmentAnswer" ("assessmentId");
ALTER TABLE "AssessmentAnswer"
    ADD CONSTRAINT "AssessmentAnswer_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "Assessment" ("id") ON DELETE CASCADE;

CREATE TABLE "AssessmentResult" (
    "id"                 TEXT         NOT NULL,
    "assessmentId"       TEXT         NOT NULL,
    "userId"             TEXT         NOT NULL,
    "definitionVersion"  TEXT         NOT NULL,
    "domainScores"       JSONB        NOT NULL,
    "strongestDomain"    TEXT         NOT NULL,
    "supportDomain"      TEXT         NOT NULL,
    "selectedPriorities" JSONB        NOT NULL,
    "goalFreeText"       JSONB,
    "safetyEvaluationId" TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssessmentResult_assessmentId_key" ON "AssessmentResult" ("assessmentId");
CREATE INDEX "AssessmentResult_userId_idx" ON "AssessmentResult" ("userId");
ALTER TABLE "AssessmentResult"
    ADD CONSTRAINT "AssessmentResult_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "Assessment" ("id") ON DELETE CASCADE;
ALTER TABLE "AssessmentResult"
    ADD CONSTRAINT "AssessmentResult_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE CASCADE;