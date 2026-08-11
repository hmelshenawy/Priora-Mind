import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { EmailVerifiedGuard } from '../../auth/guards/email-verified.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../../auth/tokens/jwt-token.service';
import { CoachingActionService } from '../services/coaching-action.service';
import { type UpdateActionInput, updateActionSchema } from '../dto/coaching.dto';
import { CoachingPlanService } from '../services/coaching-plan.service';

@Controller('coaching/plan')
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class CoachingController {
  constructor(
    private readonly plans: CoachingPlanService,
    private readonly actions: CoachingActionService,
  ) {}

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

  @Patch('actions/:action_id')
  updateAction(
    @Req() req: Request,
    @Param('action_id') actionId: string,
    @Body(new ZodValidationPipe(updateActionSchema)) body: UpdateActionInput,
  ) {
    const user = req.user as JwtPayload;
    return this.actions.updateAction(user.sub, actionId, body);
  }
}
