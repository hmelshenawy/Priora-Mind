-- m_retention: DeletionLog + run_kind/retention_status enums + inactivity-cutoff
-- indexes (Polish, data-model §13, research D10, Consent §8).
--
-- DeletionLog holds ONLY sanitized counters — { window, category, deleted_count,
-- error_count, run_ms } per category and a non-sensitive confirmation_id. No email,
-- answers, scores, safety answers/levels, or consent contents are ever stored here
-- (FR-030, Consent §8 "Operational deletion record: keep only a non-sensitive
-- confirmation identifier and deletion timestamp for 30 days"). Retained 30d.
--
-- The inactivity-cutoff indexes on UserAccount.lastActivityAt (added here),
-- OnboardingState.lastActivityAt, and Assessment.lastActivityAt (both added in their
-- own migrations) support the deterministic scheduled cleanup job's
-- `DELETE ... WHERE last_activity_at < :cutoff` predicate (research D10).

CREATE TYPE "RunKind" AS ENUM ('scheduled_retention', 'account_deletion');

CREATE TYPE "RetentionStatus" AS ENUM ('completed', 'partial', 'failed');

CREATE TABLE "DeletionLog" (
    "id"             TEXT             NOT NULL,
    "runKind"         "RunKind"        NOT NULL,
    "windowStart"     TIMESTAMP(3)     NOT NULL,
    "windowEnd"       TIMESTAMP(3)     NOT NULL,
    "categoryCounts"  JSONB            NOT NULL,
    "errorSummary"    TEXT,
    "status"          "RetentionStatus" NOT NULL,
    "confirmationId"  TEXT             NOT NULL,
    "createdAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeletionLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeletionLog_runKind_idx" ON "DeletionLog" ("runKind");
CREATE INDEX "DeletionLog_createdAt_idx" ON "DeletionLog" ("createdAt");

-- Inactivity-cutoff index for the scheduled cleanup job's unverified + pre-consent
-- account deletion (AuthDeletionPort.deleteExpired, Consent §8).
CREATE INDEX "UserAccount_lastActivityAt_idx" ON "UserAccount" ("lastActivityAt");