import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { EmailVerifiedGuard, JwtAuthGuard, type JwtPayload } from '../../auth/auth.public';
import { SafetyService } from '../services/safety.service';
import { SafetyReentryService } from '../services/safety-reentry.service';
import type { SafetyReentryBody } from '../dto/safety.dto';

/**
 * Safety endpoints (contracts/safety.md, FR-019b context, Safety Matrix §9/§11).
 * Security posture mirrors the assessment/profile modules:
 *  - Every route requires a valid access token (JwtAuthGuard) AND EMAIL_VERIFIED
 *    (EmailVerifiedGuard) — backend-enforced (FR-002, FR-027/FR-028).
 *  - The OnboardingGuard (T033) additionally requires granted consent before the
 *    safety_hold step (asserted inside the service — FR-006).
 *  - The safety message receives immediate focus + AT announcement in the frontend
 *    (Safety Matrix §11); the primary emergency action is visually + semantically
 *    clear (FR-037). No invented numbers/resources (FR-024).
 *
 * The classifier itself is NOT an HTTP endpoint (contracts/safety.md); it runs
 * internally from the Assessment flows (per-answer + on-submit) and from re-entry.
 */
@Controller()
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class SafetyController {
  constructor(
    private readonly safety: SafetyService,
    private readonly reentryService: SafetyReentryService,
  ) {}

  @Get('safety/hold')
  @HttpCode(200)
  getHold(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.safety.getHold(user.sub);
  }

  @Post('safety/reentry')
  @HttpCode(200)
  reentry(@Req() req: Request, @Body() body: unknown) {
    const user = req.user as JwtPayload;
    return this.reentryService.reentry(user.sub, body as SafetyReentryBody);
  }
}
