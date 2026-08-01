import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { SafetyModule } from '../safety/safety.module';
import { CoachingController } from './coaching.controller';
import { CoachingEligibilityService } from './coaching-eligibility.service';
import { CoachingGenerationService } from './coaching-generation.service';
import { CoachingGroundingService } from './coaching-grounding.service';
import { CoachingPlanService } from './coaching-plan.service';

@Module({
  imports: [AuthModule, ProfileModule, SafetyModule, AssessmentModule, AiModule],
  controllers: [CoachingController],
  providers: [CoachingEligibilityService, CoachingGroundingService, CoachingGenerationService, CoachingPlanService],
})
export class CoachingModule {}
