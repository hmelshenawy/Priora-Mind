import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthCoreModule } from './auth-core.module';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { ConsentController } from './controllers/consent.controller';
import { ConsentService } from './services/consent.service';
import { AuthDeletionService } from './services/auth-deletion.service';
import { AUTH_DELETION_PORT } from './ports/auth-deletion.port';
import { EMAIL_PORT } from './ports/email.port';
import { FakeEmailAdapter } from './ports/fake-email.adapter';
import { HttpEmailProviderAdapter } from './ports/http-email.adapter';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailVerifiedGuard } from './guards/email-verified.guard';

/**
 * Auth feature module (US1 + US2). Composes the AuthCore framework (token
 * primitives, JWT strategy/guard, refresh-cookie helper) with the AuthService/
 * Controller, the ConsentService/Controller (US2), and the config-selected
 * EmailPort adapter (research D2). AuthDeletionService is exported for the
 * RetentionModule (Polish). ConsentService is exported for the Profile-module
 * OnboardingGuard (T033) to check consent status without cross-module table
 * access (SAD §11).
 */
@Module({
  imports: [AuthCoreModule],
  controllers: [AuthController, ConsentController],
  providers: [
    AuthService,
    ConsentService,
    JwtAuthGuard,
    EmailVerifiedGuard,
    {
      provide: EMAIL_PORT,
      useFactory: (config: ConfigService) =>
        config.get<string>('EMAIL_PROVIDER') === 'http'
          ? new HttpEmailProviderAdapter(config)
          : new FakeEmailAdapter(),
      inject: [ConfigService],
    },
    AuthDeletionService,
    { provide: AUTH_DELETION_PORT, useExisting: AuthDeletionService },
  ],
  exports: [
    AuthService,
    ConsentService,
    JwtAuthGuard,
    EmailVerifiedGuard,
    AUTH_DELETION_PORT,
    EMAIL_PORT,
  ],
})
export class AuthModule {}
