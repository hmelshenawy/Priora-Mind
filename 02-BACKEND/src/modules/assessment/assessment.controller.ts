import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import type { JwtPayload } from '../auth/tokens/jwt-token.service';
import { AssessmentLifecycleService } from './assessment-lifecycle.service';
import { AssessmentSubmitService } from './assessment-submit.service';

/**
 * Assessment endpoints (contracts/assessment.md, FR-013..FR-018). Security posture
 * mirrors the profile module:
 *  - Every route requires a valid access token (JwtAuthGuard) AND EMAIL_VERIFIED
 *    (EmailVerifiedGuard) — backend-enforced (FR-002, FR-027/FR-028).
 *  - The OnboardingGuard (T033) additionally requires granted consent before any
 *    step (the services build the guard context + assert 'assessment') — FR-006.
 *  - All writes filter by `req.user.sub` server-side; route guards are UX only
 *    (FR-028). No submitted value is echoed; validation errors carry field paths
 *    only (FR-037) — the lifecycle service parses each answer body with the schema
 *    selected by `question_id`, letting ZodError propagate to the global filter.
 *
 * US4 scope (NORMAL path): the per-answer safety evaluation + SAFETY_HOLD routing
 * land in US6; the non-diagnostic presenter + COMPLETED transition + SAFETY_HOLD
 * suppression on GET /assessment/result land in US5 (T056/T057). Until then
 * GET /assessment/result returns the raw scored result only (404 if not scored).
 */
@Controller()
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class AssessmentController {
  constructor(
    private readonly lifecycle: AssessmentLifecycleService,
    private readonly submitService: AssessmentSubmitService,
  ) {}

  @Get('assessment')
  @HttpCode(200)
  getAssessment(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.lifecycle.getAssessment(user.sub);
  }

  @Get('assessment/definition')
  @HttpCode(200)
  getDefinition() {
    return this.lifecycle.getDefinition();
  }

  @Put('assessment/answers/:question_id')
  @HttpCode(200)
  saveAnswer(@Req() req: Request, @Param('question_id') questionId: string, @Body() body: unknown) {
    const user = req.user as JwtPayload;
    return this.lifecycle.saveAnswer(user.sub, questionId, body);
  }

  @Post('assessment/restart')
  @HttpCode(204)
  async restart(@Req() req: Request) {
    const user = req.user as JwtPayload;
    await this.lifecycle.restart(user.sub);
  }

  @Post('assessment/submit')
  @HttpCode(200)
  submit(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.submitService.submit(user.sub);
  }

  @Get('assessment/result')
  @HttpCode(200)
  getResult(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.submitService.getResult(user.sub);
  }
}