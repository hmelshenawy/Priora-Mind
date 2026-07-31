import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';
import { SafetyReentryService } from './safety-reentry.service';
import { SafetyDeletionService } from './safety-deletion.service';
import { SAFETY_DELETION_PORT } from './ports/safety-deletion.port';

/**
 * Safety feature module (US6, SAD ADR-006). Owns deterministic safety classification
 * (SafetyEvaluation — append-only, is_current on latest) + the approved copy/resource
 * constants + the SAFETY_HOLD page + user-initiated re-entry. Classification is
 * SEPARATE from assessment scoring and from the AI provider (FR-019/FR-020).
 *
 * Imports AuthModule (ConsentService — consent gate for the safety_hold step) and
 * ProfileModule (OnboardingGuard — journey ordering). Safety does NOT import
 * AssessmentModule (no circular DI); AssessmentModule imports SafetyModule to call
 * SafetyService during per-answer + on-submit evaluation. SafetyService writes
 * OnboardingState/Assessment state via Prisma directly for routing transitions
 * (mirroring the codebase pattern). SafetyDeletionService is exported via the
 * SAFETY_DELETION_PORT token for the RetentionModule (Polish, T068).
 */
@Module({
  imports: [AuthModule, ProfileModule],
  controllers: [SafetyController],
  providers: [
    SafetyService,
    SafetyReentryService,
    SafetyDeletionService,
    { provide: SAFETY_DELETION_PORT, useExisting: SafetyDeletionService },
  ],
  exports: [SafetyService, SAFETY_DELETION_PORT],
})
export class SafetyModule {}