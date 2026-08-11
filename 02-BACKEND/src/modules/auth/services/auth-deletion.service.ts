import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthCutoffs, AuthDeletionPort, DeletionCategoryCounters } from './ports/auth-deletion.port';

/**
 * Auth-side deletion (T025 + T034). Hard-deletes expired unverified accounts and
 * verified-but-pre-consent accounts; tokens + consent records cascade via the
 * schema (`onDelete: Cascade`). Idempotent (`DELETE ... WHERE lastActivityAt <
 * :cutoff`); re-running is a no-op. Emits no user content to logs (research D7).
 *
 * `deleteConsentForUsers` is the explicit, counted consent-cleanup path used by
 * the user-initiated account-deletion flow (Consent §9); it is idempotent and
 * emits only sanitized counters. Per Consent §8, superseded consent records are
 * retained while the account exists, so the scheduled cron has no consent cutoff.
 */
@Injectable()
export class AuthDeletionService implements AuthDeletionPort {
  private readonly logger = new Logger(AuthDeletionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async deleteExpired(cutoffs: AuthCutoffs): Promise<DeletionCategoryCounters> {
    let deleted = 0;
    let errors = 0;
    try {
      const unverified = await this.prisma.userAccount.deleteMany({
        where: {
          status: 'REGISTERED',
          lastActivityAt: { lt: cutoffs.unverifiedAccountBefore },
          deletedAt: null,
        },
      });
      deleted += unverified.count;
    } catch (err) {
      errors += 1;
      this.logger.warn(`unverified-account deletion failed: ${errName(err)}`);
    }
    try {
      // Verified-but-pre-consent accounts: EMAIL_VERIFIED, inactive 30d, with NO
      // granted consent record. Completed/consented data is retained while the
      // account exists (Consent §8, research D10), so consented accounts are
      // excluded. The InMemoryPrisma mock does not support nested relation
      // filters, so this is a two-step: find candidates, drop consented users,
      // delete the rest by id (works against real Prisma too).
      const candidates = await this.prisma.userAccount.findMany({
        where: {
          status: 'EMAIL_VERIFIED',
          lastActivityAt: { lt: cutoffs.preConsentAccountBefore },
          deletedAt: null,
        },
      });
      const toDelete: string[] = [];
      for (const u of candidates) {
        const consent = await this.prisma.consentRecord.findFirst({ where: { userId: u.id } });
        if (!consent) toDelete.push(u.id);
      }
      if (toDelete.length > 0) {
        const preConsent = await this.prisma.userAccount.deleteMany({
          where: { id: { in: toDelete } },
        });
        deleted += preConsent.count;
      }
    } catch (err) {
      errors += 1;
      this.logger.warn(`pre-consent-account deletion failed: ${errName(err)}`);
    }
    this.logger.log({ message: 'auth-deletion-run', deleted, errors });
    return { deleted, errors };
  }

  async deleteConsentForUsers(userIds: string[]): Promise<DeletionCategoryCounters> {
    if (userIds.length === 0) return { deleted: 0, errors: 0 };
    let deleted = 0;
    let errors = 0;
    try {
      const result = await this.prisma.consentRecord.deleteMany({
        where: { userId: { in: userIds } },
      });
      deleted = result.count;
    } catch (err) {
      errors += 1;
      this.logger.warn(`consent deletion failed: ${errName(err)}`);
    }
    this.logger.log({ message: 'consent-deletion-run', deleted, errors });
    return { deleted, errors };
  }

  async deleteAccountForUsers(userIds: string[]): Promise<DeletionCategoryCounters> {
    if (userIds.length === 0) return { deleted: 0, errors: 0 };
    let deleted = 0;
    let errors = 0;
    try {
      // Hard-delete the account row; tokens + remaining owned rows cascade via the
      // schema. Called LAST in the account-deletion flow after the per-module stores
      // confirm, so their counts are the source of truth. Idempotent (0 if gone).
      const result = await this.prisma.userAccount.deleteMany({
        where: { id: { in: userIds } },
      });
      deleted = result.count;
    } catch (err) {
      errors += 1;
      this.logger.warn(`account deletion failed: ${errName(err)}`);
    }
    this.logger.log({ message: 'account-deletion-run', deleted, errors });
    return { deleted, errors };
  }
}

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown';
}