import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { SafetyDeletionPort, DeletionCategoryCounters } from '../ports/safety-deletion.port';

/**
 * Safety-side deletion (T068, research D10, data-model §14). Hard-deletes
 * `SafetyEvaluation` rows tied to expired incomplete assessments (Consent §8) and a
 * user's full safety evaluation history on account deletion (Consent §9, FR-031).
 * Idempotent; re-running is a no-op. Historical rows are immutable until deletion —
 * never edited or relabeled (Safety Matrix §9). Emits no levels/reasons/answers to
 * logs (FR-030, research D7) — only sanitized integer counters.
 *
 * `SafetyEvaluation.assessmentId` is a LOOSE reference (no FK), so assessment
 * deletion does not cascade. Retention passes sanitized Assessment-owned candidate
 * IDs; this service owns only SafetyEvaluation deletion.
 */
@Injectable()
export class SafetyDeletionService implements SafetyDeletionPort {
  private readonly logger = new Logger(SafetyDeletionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async deleteExpiredForAssessmentIds(assessmentIds: string[]): Promise<DeletionCategoryCounters> {
    if (assessmentIds.length === 0) return { deleted: 0, errors: 0 };
    let deleted = 0;
    let errors = 0;
    try {
      const res = await this.prisma.safetyEvaluation.deleteMany({
        where: { assessmentId: { in: assessmentIds } },
      });
      deleted += res.count;
    } catch (err) {
      errors += 1;
      this.logger.warn(`safety-expired deletion failed: ${errName(err)}`);
    }
    this.logger.log({ message: 'safety-expired-deletion-run', deleted, errors });
    return { deleted, errors };
  }

  async deleteSafetyForUsers(userIds: string[]): Promise<DeletionCategoryCounters> {
    if (userIds.length === 0) return { deleted: 0, errors: 0 };
    let deleted = 0;
    let errors = 0;
    try {
      const res = await this.prisma.safetyEvaluation.deleteMany({
        where: { userId: { in: userIds } },
      });
      deleted += res.count;
    } catch (err) {
      errors += 1;
      this.logger.warn(`safety-for-users deletion failed: ${errName(err)}`);
    }
    this.logger.log({ message: 'safety-for-users-deletion-run', deleted, errors });
    return { deleted, errors };
  }
}

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown';
}
