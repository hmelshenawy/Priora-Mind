import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  AssessmentCutoffs,
  AssessmentDeletionResult,
  AssessmentDeletionPort,
  DeletionCategoryCounters,
} from '../ports/assessment-deletion.port';

/**
 * Assessment-side deletion (T052, research D10, data-model §14). Hard-deletes
 * expired incomplete assessments (cascade their answers) and a user's full
 * assessment data on account deletion (cascade answers + results). Idempotent
 * (`DELETE ... WHERE lastActivityAt < :cutoff AND state IN (...)` or
 * `WHERE userId IN (...)`); re-running is a no-op. Completed (SCORED) results are
 * retained while the account exists (Consent §8). Emits no user content to logs
 * (research D7) — only sanitized integer counters.
 *
 * Deletion order respects referential integrity (answers → result → assessment);
 * the mock + schema cascade answers + results when an assessment row is deleted,
 * so a single `assessment.deleteMany` per path is sufficient.
 */
@Injectable()
export class AssessmentDeletionService implements AssessmentDeletionPort {
  private readonly logger = new Logger(AssessmentDeletionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async deleteExpired(cutoffs: AssessmentCutoffs): Promise<AssessmentDeletionResult> {
    let deleted = 0;
    let errors = 0;
    let assessmentIds: string[] = [];
    try {
      const candidates = await this.prisma.assessment.findMany({
        where: {
          lastActivityAt: { lt: cutoffs.incompleteBefore },
          state: { in: ['NOT_STARTED', 'IN_PROGRESS', 'SUSPENDED'] },
        },
      });
      assessmentIds = candidates.map((assessment) => assessment.id);
      const res = await this.prisma.assessment.deleteMany({
        where: {
          lastActivityAt: { lt: cutoffs.incompleteBefore },
          state: { in: ['NOT_STARTED', 'IN_PROGRESS', 'SUSPENDED'] },
        },
      });
      deleted += res.count;
    } catch (err) {
      errors += 1;
      this.logger.warn(`assessment-expired deletion failed: ${errName(err)}`);
    }
    this.logger.log({ message: 'assessment-expired-deletion-run', deleted, errors });
    return { deleted, errors, assessmentIds };
  }

  async deleteAssessmentForUsers(userIds: string[]): Promise<DeletionCategoryCounters> {
    if (userIds.length === 0) return { deleted: 0, errors: 0 };
    let deleted = 0;
    let errors = 0;
    try {
      const res = await this.prisma.assessment.deleteMany({
        where: { userId: { in: userIds } },
      });
      deleted += res.count;
    } catch (err) {
      errors += 1;
      this.logger.warn(`assessment-for-users deletion failed: ${errName(err)}`);
    }
    this.logger.log({ message: 'assessment-for-users-deletion-run', deleted, errors });
    return { deleted, errors };
  }
}

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown';
}
