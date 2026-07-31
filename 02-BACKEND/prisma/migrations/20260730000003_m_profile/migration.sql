-- m_profile: Profile-owned profile/preferences/onboarding state (US3, data-model §5–§7).
-- Forward-only. All three tables cascade on user deletion (Consent §8/§9). The
-- `lastActivityAt` index on OnboardingState backs the incomplete-onboarding
-- retention cutoff (research D10, data-model §14). The state enum is named
-- `OnboardingStateValue` (the model is `OnboardingState`) so the two can coexist
-- in the Prisma schema; it maps to the product `onboarding_state` enum (spec §9).

CREATE TYPE "OnboardingStateValue" AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'ASSESSMENT_PENDING',
    'ASSESSMENT_IN_PROGRESS',
    'ASSESSMENT_SUBMITTED',
    'COMPLETED',
    'SAFETY_HOLD'
);

CREATE TABLE "Profile" (
    "id"        TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile" ("userId");
ALTER TABLE "Profile"
    ADD CONSTRAINT "Profile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE CASCADE;

CREATE TABLE "Preferences" (
    "id"           TEXT         NOT NULL,
    "userId"       TEXT         NOT NULL,
    "languageCode" TEXT         NOT NULL,
    "timezone"     TEXT         NOT NULL,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Preferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Preferences_userId_key" ON "Preferences" ("userId");
ALTER TABLE "Preferences"
    ADD CONSTRAINT "Preferences_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE CASCADE;

CREATE TABLE "OnboardingState" (
    "id"             TEXT                  NOT NULL,
    "userId"         TEXT                  NOT NULL,
    "state"          "OnboardingStateValue" NOT NULL DEFAULT 'NOT_STARTED',
    "currentStep"    TEXT,
    "updatedAt"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnboardingState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnboardingState_userId_key" ON "OnboardingState" ("userId");
CREATE INDEX "OnboardingState_lastActivityAt_idx" ON "OnboardingState" ("lastActivityAt");
ALTER TABLE "OnboardingState"
    ADD CONSTRAINT "OnboardingState_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE CASCADE;