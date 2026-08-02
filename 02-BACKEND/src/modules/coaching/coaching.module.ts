import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { SafetyModule } from '../safety/safety.module';
import { CoachingController } from './coaching.controller';
import { CoachingActionService } from './coaching-action.service';
import { CoachingDeletionService } from './coaching-deletion.service';
import { CoachingEligibilityService } from './coaching-eligibility.service';
import { CoachingGenerationService } from './coaching-generation.service';
import { CoachingGroundingService } from './coaching-grounding.service';
import { CoachingPlanService } from './coaching-plan.service';
import { COACHING_DELETION_PORT } from './ports/coaching-deletion.port';
import { RAG_CLIENT_PORT, RagApiClientService } from './rag/rag-client.service';

@Module({
  imports: [AuthModule, ProfileModule, SafetyModule, AssessmentModule, AiModule],
  controllers: [CoachingController],
  providers: [
    CoachingEligibilityService,
    CoachingGroundingService,
    CoachingGenerationService,
    CoachingPlanService,
    CoachingActionService,
    CoachingDeletionService,
    RagApiClientService,
    { provide: COACHING_DELETION_PORT, useExisting: CoachingDeletionService },
    { provide: RAG_CLIENT_PORT, useExisting: RagApiClientService },
  ],
  exports: [COACHING_DELETION_PORT, CoachingDeletionService],
})
export class CoachingModule {}
