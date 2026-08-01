import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ScoredResultDto } from './assessment.dto';
import { toScoredResultDto } from './assessment-result-mapping';

@Injectable()
export class AssessmentResultService {
  constructor(private readonly prisma: PrismaService) {}

  async getScoredResult(userId: string): Promise<ScoredResultDto | null> {
    const row = await this.prisma.assessmentResult.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toScoredResultDto(row) : null;
  }
}
