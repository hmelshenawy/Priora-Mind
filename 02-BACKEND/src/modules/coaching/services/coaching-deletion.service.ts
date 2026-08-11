import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { CoachingCutoffs, CoachingDeletionPort, DeletionCategoryCounters } from '../ports/coaching-deletion.port';

@Injectable()
export class CoachingDeletionService implements CoachingDeletionPort {
  private readonly logger = new Logger(CoachingDeletionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async deleteExpired(_cutoffs: CoachingCutoffs): Promise<DeletionCategoryCounters> {
    return { deleted: 0, errors: 0 };
  }

  async deleteCoachingForUsers(userIds: string[]): Promise<DeletionCategoryCounters> {
    if (userIds.length === 0) return { deleted: 0, errors: 0 };
    try {
      const res = await this.prisma.coachingPlan.deleteMany({ where: { userId: { in: userIds } } });
      return { deleted: res.count, errors: 0 };
    } catch (err) {
      this.logger.warn(`coaching-for-users deletion failed: ${err instanceof Error ? err.name : 'unknown'}`);
      return { deleted: 0, errors: 1 };
    }
  }
}
