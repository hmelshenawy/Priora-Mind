import { Body, Controller, Get, HttpCode, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import type { JwtPayload } from '../auth/tokens/jwt-token.service';
import { ProfileService } from './profile.service';
import {
  putLanguageSchema,
  putProfileSchema,
  type PutLanguageInput,
  type PutProfileInput,
} from './profile.dto';

/**
 * Profile + onboarding endpoints (contracts/profile-onboarding.md). The
 * OnboardingService guard (T033) is the server-side authority for step ordering
 * (FR-033); route guards are UX only (FR-028). Security posture:
 *  - Every route requires a valid access token (JwtAuthGuard) AND EMAIL_VERIFIED
 *    (EmailVerifiedGuard) — backend-enforced (FR-002, FR-027/FR-028).
 *  - putProfile / putLanguage additionally require a granted consent record
 *    (the guard's 'profile' rule: emailVerified && consentGranted) — FR-006.
 *  - GET /onboarding/state is EMAIL_VERIFIED-only (no consent gate) so a
 *    pre-consent user can discover their next route (including the boundary).
 *  - No submitted value is echoed; validation errors carry field paths only.
 */
@Controller()
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('onboarding/state')
  @HttpCode(200)
  getState(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.profile.getOnboardingState(user.sub);
  }

  /**
   * Authoritative completion check (US9, FR-033). EMAIL_VERIFIED-only (no consent
   * gate), mirroring GET /onboarding/state — a pre-consent user can discover they
   * are not completed and be routed to the earliest unfinished step. Used by the
   * frontend router to bypass onboarding for returning COMPLETED users.
   */
  @Get('onboarding/completion')
  @HttpCode(200)
  getCompletion(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.profile.getOnboardingCompletion(user.sub);
  }

  @Get('me/profile')
  @HttpCode(200)
  getProfile(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.profile.getProfile(user.sub);
  }

  @Put('onboarding/profile')
  @HttpCode(200)
  putProfile(
    @Req() req: Request,
    @Body(new ZodValidationPipe(putProfileSchema)) body: PutProfileInput,
  ) {
    const user = req.user as JwtPayload;
    return this.profile.putProfile(user.sub, body);
  }

  @Put('me/preferences/language')
  @HttpCode(200)
  putLanguage(
    @Req() req: Request,
    @Body(new ZodValidationPipe(putLanguageSchema)) body: PutLanguageInput,
  ) {
    const user = req.user as JwtPayload;
    return this.profile.putLanguage(user.sub, body);
  }
}