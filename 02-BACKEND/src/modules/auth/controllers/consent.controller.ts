import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { ConsentService } from './consent.service';
import {
  noticesQuerySchema,
  recordConsentSchema,
  type NoticesQuery,
  type RecordConsentInput,
} from './consent.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailVerifiedGuard } from './guards/email-verified.guard';
import type { JwtPayload } from './tokens/jwt-token.service';

/**
 * Consent endpoints (contracts/consent.md). Base `/api/v1/onboarding` (global
 * prefix applied). Auth owns ConsentRecord (data-model §4), so the controller
 * lives in the Auth module even though its path is `/onboarding/*`.
 *
 * Security posture:
 *  - Every route requires a valid access token (JwtAuthGuard) AND EMAIL_VERIFIED
 *    (EmailVerifiedGuard) — backend-enforced (FR-002, FR-027/FR-028).
 *  - Fail-closed (FR-007): if notices cannot be determined, GET notices and POST
 *    consent return 503 NOTICES_UNAVAILABLE and no record is written.
 *  - No submitted value is echoed; validation errors carry field paths only.
 */
@Controller('onboarding')
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  @Get('notices')
  getNotices(@Query(new ZodValidationPipe(noticesQuerySchema)) query: NoticesQuery) {
    return this.consent.getNotices(query);
  }

  @Get('consent')
  getConsentStatus(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.consent.getConsentStatus(user.sub);
  }

  @Post('consent')
  @HttpCode(201)
  recordConsent(
    @Req() req: Request,
    @Body(new ZodValidationPipe(recordConsentSchema)) body: RecordConsentInput,
  ) {
    const user = req.user as JwtPayload;
    return this.consent.recordConsent(user.sub, body);
  }
}