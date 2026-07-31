-- m_init_auth: Auth-owned identity + verification/refresh tokens (US1, data-model §1–§3).
-- Forward-only. Email uniqueness is enforced by a PARTIAL unique index so a
-- hard-deleted email may later be re-registered (deletedAt IS NULL scope).

CREATE TYPE "AccountStatus" AS ENUM ('REGISTERED', 'EMAIL_VERIFIED');

CREATE TABLE "UserAccount" (
    "id"             TEXT          NOT NULL,
    "email"          TEXT          NOT NULL,
    "passwordHash"   TEXT          NOT NULL,
    "status"         "AccountStatus" NOT NULL,
    "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt"      TIMESTAMP(3),
    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserAccount_email_active_key"
    ON "UserAccount" ("email") WHERE "deletedAt" IS NULL;
CREATE INDEX "UserAccount_status_idx" ON "UserAccount" ("status");

CREATE TABLE "VerificationToken" (
    "id"         TEXT          NOT NULL,
    "userId"     TEXT          NOT NULL,
    "tokenHash"  BYTEA         NOT NULL,
    "expiresAt"  TIMESTAMP(3)  NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VerificationToken_userId_idx" ON "VerificationToken" ("userId");
ALTER TABLE "VerificationToken"
    ADD CONSTRAINT "VerificationToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE CASCADE;

CREATE TABLE "RefreshToken" (
    "id"         TEXT          NOT NULL,
    "userId"     TEXT          NOT NULL,
    "tokenHash"  BYTEA         NOT NULL,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "revokedAt"   TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken" ("userId");
ALTER TABLE "RefreshToken"
    ADD CONSTRAINT "RefreshToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserAccount" ("id") ON DELETE CASCADE;