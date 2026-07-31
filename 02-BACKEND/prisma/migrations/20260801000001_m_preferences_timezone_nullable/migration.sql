-- m_preferences_timezone_nullable: make Preferences.timezone nullable (FR-009/FR-011).
--
-- `timezone` is a validated IANA name collected at the profile step (PUT /onboarding/
-- profile, FR-009). The language-only switch (PUT /me/preferences/language, FR-011) is
-- permitted at the `profile` guard step and may create a Preferences row BEFORE the
-- profile step runs, so `timezone` must be nullable to represent "not yet collected".
-- No default timezone is invented (FR-009); putProfile sets the validated value when
-- the profile step completes.
--
-- Forward-only, additive (relaxing): existing rows all carry a timezone, so dropping
-- the NOT NULL constraint cannot break them. No data backfill is required.

ALTER TABLE "Preferences" ALTER COLUMN "timezone" DROP NOT NULL;