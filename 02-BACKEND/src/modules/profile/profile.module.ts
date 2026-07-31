import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OnboardingGuardService } from './onboarding.guard';
import { OnboardingGuardServiceImpl } from './onboarding.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ProfileDeletionService } from './profile-deletion.service';
import { PROFILE_DELETION_PORT } from './ports/profile-deletion.port';

/**
 * Profile feature module (US3). Owns Profile / Preferences / OnboardingState
 * (data-model §5–§7) and the backend onboarding guard. Imports AuthModule so
 * ProfileService can read consent status via ConsentService without cross-module
 * table access (SAD §11). The guard (T013/T033) is exported for US4/US6/US9 route
 * handlers; ProfileDeletionService is exported for the RetentionModule (Polish).
 */
@Module({
  imports: [AuthModule],
  controllers: [ProfileController],
  providers: [
    ProfileService,
    ProfileDeletionService,
    { provide: OnboardingGuardService, useClass: OnboardingGuardServiceImpl },
    { provide: PROFILE_DELETION_PORT, useExisting: ProfileDeletionService },
  ],
  exports: [OnboardingGuardService, ProfileDeletionService, PROFILE_DELETION_PORT],
})
export class ProfileModule {}