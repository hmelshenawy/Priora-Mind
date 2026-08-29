import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { SafetyModule } from '../safety/safety.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { CoachingController } from './controllers/coaching.controller';
import { CoachingActionService } from './services/coaching-action.service';
import { CoachingDeletionService } from './services/coaching-deletion.service';
import { CoachingEligibilityService } from './services/coaching-eligibility.service';
import { CoachingGenerationService } from './services/coaching-generation.service';
import { CoachingGroundingService } from './services/coaching-grounding.service';
import { CoachingPlanService } from './services/coaching-plan.service';
import { COACHING_DELETION_PORT } from './ports/coaching-deletion.port';

@Module({
  imports: [AuthModule, ProfileModule, SafetyModule, AssessmentModule, AiModule, RetrievalModule],
  controllers: [CoachingController],
  providers: [
    CoachingEligibilityService,
    CoachingGroundingService,
    CoachingGenerationService,
    CoachingPlanService,
    CoachingActionService,
    CoachingDeletionService,
    { provide: COACHING_DELETION_PORT, useExisting: CoachingDeletionService },
  ],
  exports: [COACHING_DELETION_PORT],
})
export class CoachingModule {}
