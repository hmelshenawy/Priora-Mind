-- m_coaching: Coaching-owned plan foundation for feature 002.
-- Creates the two-status plan model, generation audit rows, versioned reference
-- snapshots, and the DB-enforced one-current-plan-per-user partial index.

CREATE TYPE "CoachingPlanStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'COMPLETED');
CREATE TYPE "CoachingGenerationStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');
CREATE TYPE "ActionStatus" AS ENUM ('INCOMPLETE', 'COMPLETE');

CREATE TABLE "CoachingPlan" (
    "id"                   TEXT                       NOT NULL,
    "userId"               TEXT                       NOT NULL,
    "sourceAssessmentId"   TEXT                       NOT NULL,
    "sourceResultId"       TEXT                       NOT NULL,
    "definitionVersion"    TEXT                       NOT NULL,
    "libraryVersion"       TEXT                       NOT NULL,
    "disclaimerVersion"    TEXT                       NOT NULL,
    "promptVersion"        TEXT                       NOT NULL,
    "planVersion"          INTEGER                    NOT NULL DEFAULT 1,
    "isCurrent"            BOOLEAN                    NOT NULL DEFAULT true,
    "planStatus"           "CoachingPlanStatus",
    "generationStatus"     "CoachingGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "generationStartedAt"  TIMESTAMP(3),
    "generationDeadlineAt" TIMESTAMP(3),
    "currentAttemptId"     TEXT,
    "title"                JSONB,
    "summary"              JSONB,
    "disclaimer"           JSONB,
    "createdAt"            TIMESTAMP(3)                NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3)                NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachingPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachingPlan_userId_sourceResultId_key" ON "CoachingPlan" ("userId", "sourceResultId");
CREATE INDEX "CoachingPlan_userId_isCurrent_idx" ON "CoachingPlan" ("userId", "isCurrent");
CREATE INDEX "CoachingPlan_userId_idx" ON "CoachingPlan" ("userId");
CREATE INDEX "CoachingPlan_currentAttemptId_idx" ON "CoachingPlan" ("currentAttemptId");
CREATE UNIQUE INDEX "coaching_plan_current_one_per_user" ON "CoachingPlan" ("userId") WHERE "isCurrent" = true;
ALTER TABLE "CoachingPlan"
    ADD CONSTRAINT "CoachingPlan_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE CASCADE;

CREATE TABLE "FocusArea" (
    "id"       TEXT    NOT NULL,
    "planId"   TEXT    NOT NULL,
    "domain"   TEXT    NOT NULL,
    "source"   TEXT    NOT NULL,
    "position" INTEGER NOT NULL,
    "reason"   JSONB   NOT NULL,
    CONSTRAINT "FocusArea_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FocusArea_planId_idx" ON "FocusArea" ("planId");
ALTER TABLE "FocusArea"
    ADD CONSTRAINT "FocusArea_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "CoachingPlan" ("id") ON DELETE CASCADE;

CREATE TABLE "Goal" (
    "id"          TEXT    NOT NULL,
    "planId"      TEXT    NOT NULL,
    "focusAreaId" TEXT    NOT NULL,
    "position"    INTEGER NOT NULL,
    "copy"        JSONB   NOT NULL,
    "libraryKey"  TEXT    NOT NULL,
    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Goal_planId_idx" ON "Goal" ("planId");
CREATE INDEX "Goal_focusAreaId_idx" ON "Goal" ("focusAreaId");
ALTER TABLE "Goal"
    ADD CONSTRAINT "Goal_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "CoachingPlan" ("id") ON DELETE CASCADE;
ALTER TABLE "Goal"
    ADD CONSTRAINT "Goal_focusAreaId_fkey"
    FOREIGN KEY ("focusAreaId") REFERENCES "FocusArea" ("id") ON DELETE CASCADE;

CREATE TABLE "ActionStep" (
    "id"          TEXT           NOT NULL,
    "planId"      TEXT           NOT NULL,
    "focusAreaId" TEXT           NOT NULL,
    "goalId"      TEXT,
    "position"    INTEGER        NOT NULL,
    "pacingLabel" JSONB,
    "copy"        JSONB          NOT NULL,
    "libraryKey"  TEXT           NOT NULL,
    "status"      "ActionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "updatedAt"   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version"     INTEGER        NOT NULL DEFAULT 1,
    CONSTRAINT "ActionStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ActionStep_planId_idx" ON "ActionStep" ("planId");
CREATE INDEX "ActionStep_focusAreaId_idx" ON "ActionStep" ("focusAreaId");
ALTER TABLE "ActionStep"
    ADD CONSTRAINT "ActionStep_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "CoachingPlan" ("id") ON DELETE CASCADE;
ALTER TABLE "ActionStep"
    ADD CONSTRAINT "ActionStep_focusAreaId_fkey"
    FOREIGN KEY ("focusAreaId") REFERENCES "FocusArea" ("id") ON DELETE CASCADE;
ALTER TABLE "ActionStep"
    ADD CONSTRAINT "ActionStep_goalId_fkey"
    FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE CASCADE;

CREATE TABLE "CoachingPlanGeneration" (
    "id"                 TEXT                       NOT NULL,
    "planId"             TEXT                       NOT NULL,
    "attempt"            INTEGER                    NOT NULL,
    "provider"           TEXT                       NOT NULL,
    "modelId"            TEXT                       NOT NULL,
    "promptVersion"      TEXT                       NOT NULL,
    "sourceAssessmentId" TEXT                       NOT NULL,
    "sourceResultId"     TEXT                       NOT NULL,
    "definitionVersion"  TEXT                       NOT NULL,
    "libraryVersion"     TEXT                       NOT NULL,
    "disclaimerVersion"  TEXT                       NOT NULL,
    "status"             "CoachingGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "validationOutcome"  JSONB,
    "retryCount"         INTEGER                    NOT NULL DEFAULT 0,
    "tokenUsage"         JSONB,
    "latencyMs"          INTEGER,
    "startedAt"          TIMESTAMP(3)               NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt"         TIMESTAMP(3),
    "finishedAt"         TIMESTAMP(3),
    "errorCode"          TEXT,
    CONSTRAINT "CoachingPlanGeneration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CoachingPlanGeneration_planId_idx" ON "CoachingPlanGeneration" ("planId");
CREATE INDEX "CoachingPlanGeneration_planId_attempt_idx" ON "CoachingPlanGeneration" ("planId", "attempt");
ALTER TABLE "CoachingPlanGeneration"
    ADD CONSTRAINT "CoachingPlanGeneration_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "CoachingPlan" ("id") ON DELETE CASCADE;

CREATE TABLE "CoachingActionLibrary" (
    "id"          TEXT         NOT NULL,
    "version"     TEXT         NOT NULL,
    "content"     JSONB        NOT NULL,
    "integrity"   TEXT         NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachingActionLibrary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoachingActionLibrary_version_key" ON "CoachingActionLibrary" ("version");

CREATE TABLE "CoachingDisclaimer" (
    "id"          TEXT         NOT NULL,
    "version"     TEXT         NOT NULL,
    "copyEn"      TEXT         NOT NULL,
    "copyAr"      TEXT         NOT NULL,
    "integrity"   TEXT         NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachingDisclaimer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoachingDisclaimer_version_key" ON "CoachingDisclaimer" ("version");
