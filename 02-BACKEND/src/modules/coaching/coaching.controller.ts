import { Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/tokens/jwt-token.service';
import { CoachingPlanService } from './coaching-plan.service';

@Controller('coaching/plan')
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class CoachingController {
  constructor(private readonly plans: CoachingPlanService) {}

  @Post()
  async start(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as JwtPayload;
    const body = await this.plans.startOrGet(user.sub);
    if ('generationStatus' in body && body.generationStatus !== 'READY') res.status(202);
    return body;
  }

  @Get()
  async get(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as JwtPayload;
    const body = await this.plans.getCurrent(user.sub);
    if ('generationStatus' in body && body.generationStatus !== 'READY') res.status(202);
    return body;
  }

  @Post('accept')
  @HttpCode(200)
  accept(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.plans.acceptPlan(user.sub);
  }
}
