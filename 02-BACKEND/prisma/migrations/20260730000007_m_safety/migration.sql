-- m_safety: SafetyEvaluation + safety_level/trigger_context enums (US6, data-model
-- §11, research D9). Immutable, append-only: rows are only created (one per
-- evaluation) and have `is_current` flipped; they are NEVER updated or deleted except
-- by account deletion (FR-031, Safety §9/§10). Historical rows are retained and never
-- relabeled; only the latest completed evaluation's `is_current` drives current
-- routing. Classification is independent of AssessmentResult.domainScores except for
-- the DISTRESS pattern (Safety §5), which the classifier reads as input.
--
-- userId / assessmentId are LOOSE references (no Prisma relation fields): Safety owns
-- this model, and Assessment references a SafetyEvaluation by id only (data-model
-- §11). Cascade deletion is handled explicitly by SafetyDeletionPort (counted), not
-- by DB FK cascade, to respect module ownership (SAD §5 / ADR-005) and keep deletion
-- auditable. Indexes cover the access patterns: latest-by-user, by-assessment,
-- current-by-user.

CREATE TYPE "SafetyLevel" AS ENUM ('NORMAL', 'DISTRESS', 'HIGH_RISK', 'CRISIS');

CREATE TYPE "TriggerContext" AS ENUM ('per_answer', 'on_submit', 're_entry');

CREATE TABLE "SafetyEvaluation" (
    "id"               TEXT            NOT NULL,
    "userId"           TEXT            NOT NULL,
    "assessmentId"     TEXT,
    "definitionVersion" TEXT          NOT NULL,
    "level"            "SafetyLevel"   NOT NULL,
    "reasons"          TEXT[]          NOT NULL,
    "triggerContext"   "TriggerContext" NOT NULL,
    "isCurrent"        BOOLEAN         NOT NULL DEFAULT FALSE,
    "evaluatedAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"        TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SafetyEvaluation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SafetyEvaluation_userId_idx" ON "SafetyEvaluation" ("userId");
CREATE INDEX "SafetyEvaluation_assessmentId_idx" ON "SafetyEvaluation" ("assessmentId");
CREATE INDEX "SafetyEvaluation_userId_isCurrent_idx" ON "SafetyEvaluation" ("userId", "isCurrent");