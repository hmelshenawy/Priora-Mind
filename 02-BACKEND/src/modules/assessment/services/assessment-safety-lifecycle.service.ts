import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AssessmentSafetyLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async currentAssessmentId(userId: string): Promise<string | null> {
    const assessment = await this.prisma.assessment.findFirst({ where: { userId } });
    return assessment?.id ?? null;
  }

  async suspendForSafety(assessmentId: string, now: Date): Promise<void> {
    await this.prisma.assessment.updateMany({
      where: { id: assessmentId, state: { in: ['IN_PROGRESS', 'NOT_STARTED'] } },
      data: { state: 'SUSPENDED', lastActivityAt: now },
    });
  }

  async resumeAfterSafety(userId: string, now: Date): Promise<void> {
    const assessment = await this.prisma.assessment.findFirst({ where: { userId } });
    if (assessment?.state !== 'SUSPENDED') return;
    await this.prisma.assessment.update({
      where: { id: assessment.id },
      data: { state: 'IN_PROGRESS', lastActivityAt: now },
    });
  }
}
