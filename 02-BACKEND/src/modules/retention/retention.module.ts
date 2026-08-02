import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { CoachingModule } from '../coaching/coaching.module';
import { SafetyModule } from '../safety/safety.module';
import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionService } from './account-deletion.service';
import { RetentionService } from './retention.service';

/**
 * Platform retention module (Polish, research D10, data-model §14, Consent §8/§9).
 *
 * Owns the two platform-level deletion flows and NEVER touches other modules'
 * tables directly (SAD §5 / ADR-005) — each domain module exposes a narrow
 * `XDeletionPort` (auth/profile/assessment/safety) returning only sanitized integer
 * counters (FR-030, research D7). RetentionModule imports the four domain modules
 * solely to consume those ports.
 *
 *  - `RetentionService`: the daily `@Cron` scheduled-retention orchestrator
 *    (unverified/pre-consent accounts, incomplete onboarding/profile/assessment/
 *    safety). Idempotent per run window; per-category failure isolation.
 *  - `AccountDeletionService` + `AccountDeletionController`: the user-initiated
 *    DELETE /me/account flow (Consent §9, FR-031). Idempotent; blocks new processing
 *    on acceptance; never reports completion until all in-scope stores confirm.
 *
 * `ScheduleModule.forRoot()` is wired once in AppModule; the @Cron decorator here
 * registers `runScheduledRetention` with the scheduler.
 */
@Module({
  imports: [AuthModule, ProfileModule, AssessmentModule, CoachingModule, SafetyModule],
  controllers: [AccountDeletionController],
  providers: [RetentionService, AccountDeletionService],
  exports: [RetentionService, AccountDeletionService],
})
export class RetentionModule {}
