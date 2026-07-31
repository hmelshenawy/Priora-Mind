import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DeletionCategoryCounters,
  ProfileCutoffs,
  ProfileDeletionPort,
} from './ports/profile-deletion.port';

/**
 * Profile-side deletion (T041). Hard-deletes expired incomplete onboarding +
 * profile/preferences (Consent §8) and a user's full profile data on account
 * deletion (Consent §9). Idempotent (`DELETE ... WHERE lastActivityAt < :cutoff`
 * or `WHERE userId IN (...)`); re-running is a no-op. Emits no user content to
 * logs (research D7) — only sanitized counters. Deletion order respects
 * referential integrity (answers → assessment → onboarding → profile → consent
 * → account); within Profile, onboarding → preferences → profile.
 */
@Injectable()
export class ProfileDeletionService implements ProfileDeletionPort {
  private readonly logger = new Logger(ProfileDeletionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async deleteExpired(cutoffs: ProfileCutoffs): Promise<DeletionCategoryCounters> {
    let deleted = 0;
    let errors = 0;
    try {
      // Incomplete onboarding only: a COMPLETED onboarding state is the completion
      // record (US9/FR-018a rely on it) and is "completed data retained while the
      // account exists" (Consent §8, research D10) — it MUST NOT be purged by the
      // inactivity cutoff. Only the non-terminal states are expired.
      const onboarding = await this.prisma.onboardingState.deleteMany({
        where: {
          lastActivityAt: { lt: cutoffs.onboardingBefore },
          state: {
            in: [
              'NOT_STARTED',
              'IN_PROGRESS',
              'ASSESSMENT_PENDING',
              'ASSESSMENT_IN_PROGRESS',
              'ASSESSMENT_SUBMITTED',
              'SAFETY_HOLD',
            ],
          },
        },
      });
      deleted += onboarding.count;
    } catch (err) {
      errors += 1;
      this.logger.warn(`onboarding-state deletion failed: ${errName(err)}`);
    }
    // Profile/preferences with no surviving onboarding state: there is no FK
    // from profile→onboarding, so expired-profile detection is by absence of a
    // surviving onboarding row for the user. For the scheduled path we delete
    // orphaned profile/preferences whose user has no onboarding state; this is
    // resolved by the RetentionModule orchestrator passing the surviving-user
    // set. Here we only delete onboarding-state rows by cutoff; profile/
    // preferences cleanup is handled by account deletion (cascade) and the
    // pre-consent account deletion in AuthDeletionPort (cascade on user).
    this.logger.log({ message: 'profile-deletion-run', deleted, errors });
    return { deleted, errors };
  }

  async deleteProfileForUsers(userIds: string[]): Promise<DeletionCategoryCounters> {
    if (userIds.length === 0) return { deleted: 0, errors: 0 };
    let deleted = 0;
    let errors = 0;
    try {
      const onboarding = await this.prisma.onboardingState.deleteMany({
        where: { userId: { in: userIds } },
      });
      deleted += onboarding.count;
      const prefs = await this.prisma.preferences.deleteMany({
        where: { userId: { in: userIds } },
      });
      deleted += prefs.count;
      const profiles = await this.prisma.profile.deleteMany({
        where: { userId: { in: userIds } },
      });
      deleted += profiles.count;
    } catch (err) {
      errors += 1;
      this.logger.warn(`profile-for-users deletion failed: ${errName(err)}`);
    }
    this.logger.log({ message: 'profile-for-users-deletion-run', deleted, errors });
    return { deleted, errors };
  }
}

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown';
}