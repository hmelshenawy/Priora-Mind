import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { SafetyModule } from '../safety/safety.module';
import { AssessmentController } from './controllers/assessment.controller';
import { AssessmentDeletionService } from './services/assessment-deletion.service';
import { AssessmentAnswerStore } from './services/assessment-answer-store.service';
import { AssessmentLifecycleService } from './services/assessment-lifecycle.service';
import { AssessmentResultService } from './services/assessment-result.service';
import { AssessmentSubmitService } from './services/assessment-submit.service';
import { ASSESSMENT_DELETION_PORT } from './ports/assessment-deletion.port';
import { ScoringService } from './services/scoring.service';

/**
 * Assessment feature module (US4–US6). Owns Assessment / AssessmentAnswer /
 * AssessmentResult + deterministic scoring (data-model §8–§10, contracts/
 * assessment.md). Imports AuthModule for ConsentService (consent gate, no
 * cross-module table access — SAD §11), ProfileModule for the OnboardingGuard
 * (T033, the journey-ordering authority), and SafetyModule for SafetyService
 * (US6: per-answer + on-submit safety evaluation, SAFETY_HOLD routing, the
 * distress_note source). AssessmentDeletionService is exported via the
 * ASSESSMENT_DELETION_PORT token for the RetentionModule (Polish).
 */
@Module({
  imports: [AuthModule, ProfileModule, SafetyModule],
  controllers: [AssessmentController],
  providers: [
    ScoringService,
    AssessmentAnswerStore,
    AssessmentLifecycleService,
    AssessmentResultService,
    AssessmentSubmitService,
    AssessmentDeletionService,
    { provide: ASSESSMENT_DELETION_PORT, useExisting: AssessmentDeletionService },
  ],
  exports: [ASSESSMENT_DELETION_PORT, AssessmentResultService],
})
export class AssessmentModule {}
