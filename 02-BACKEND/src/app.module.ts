import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './common/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthCoreModule } from './modules/auth/auth-core.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { SafetyModule } from './modules/safety/safety.module';
import { RetentionModule } from './modules/retention/retention.module';
import { CoachingModule } from './modules/coaching/coaching.module';
import { ConversationsModule } from './modules/conversations/conversations.module';

/**
 * Root application module.
 *
 * Foundational layer wired: config (fail-closed), scheduler, Prisma access,
 * and the auth-core framework (token primitives, guard, strategy). Domain
 * feature modules (auth/consent, profile, assessment, safety, retention) and
 * the OnboardingGuardService implementation are registered in the story phases
 * (US1–US9). US1 (AuthModule) + US2 (consent in AuthModule, OnboardingGuard in
 * ProfileModule) are wired here.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthCoreModule,
    AuthModule,
    ProfileModule,
    AssessmentModule,
    SafetyModule,
    CoachingModule,
    ConversationsModule,
    RetentionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
