import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ConversationOnboardingRequiredException,
  ConversationSafetyHoldException,
} from '../constants/conversation.errors';

type Db = {
  onboardingState: {
    findFirst(args: { where: { userId: string } }): Promise<{ state: string } | null>;
  };
};

@Injectable()
export class ConversationAccessService {
  private readonly db: Db;

  constructor(prisma: PrismaService) {
    this.db = prisma as unknown as Db;
  }

  async assertEligible(userId: string): Promise<void> {
    const row = await this.db.onboardingState.findFirst({ where: { userId } });
    if (row?.state === 'SAFETY_HOLD') throw new ConversationSafetyHoldException();
    if (row?.state !== 'COMPLETED') throw new ConversationOnboardingRequiredException();
  }
}
