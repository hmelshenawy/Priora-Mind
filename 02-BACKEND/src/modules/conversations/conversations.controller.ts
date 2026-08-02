import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/tokens/jwt-token.service';
import {
  createConversationSchema,
  getConversationQuerySchema,
  listConversationsQuerySchema,
  patchConversationSchema,
  sendConversationMessageSchema,
  type CreateConversationInput,
  type GetConversationQuery,
  type ListConversationsQuery,
  type PatchConversationInput,
  type SendConversationMessageInput,
} from './conversation.dto';
import { ConversationLifecycleService } from './conversation-lifecycle.service';
import { ConversationMessageService } from './conversation-message.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard, EmailVerifiedGuard)
export class ConversationsController {
  constructor(
    private readonly lifecycle: ConversationLifecycleService,
    private readonly messages: ConversationMessageService,
  ) {}

  @Post()
  create(
    @Req() req: Request,
    @Body(new ZodValidationPipe(createConversationSchema)) body: CreateConversationInput,
  ) {
    return this.lifecycle.create(this.userId(req), body);
  }

  @Get()
  list(
    @Req() req: Request,
    @Query(new ZodValidationPipe(listConversationsQuerySchema)) query: ListConversationsQuery,
  ) {
    return this.lifecycle.list(this.userId(req), query);
  }

  @Get(':conversationId')
  get(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Query(new ZodValidationPipe(getConversationQuerySchema)) query: GetConversationQuery,
  ) {
    return this.lifecycle.get(
      this.userId(req),
      conversationId,
      query.messagesCursor,
      query.messagesLimit,
    );
  }

  @Patch(':conversationId')
  patch(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(patchConversationSchema)) body: PatchConversationInput,
  ) {
    return this.lifecycle.patch(this.userId(req), conversationId, body);
  }

  @Delete(':conversationId')
  @HttpCode(204)
  async delete(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
  ): Promise<void> {
    await this.lifecycle.delete(this.userId(req), conversationId);
  }

  @Post(':conversationId/messages')
  send(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Headers('X-Idempotency-Key') idempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(sendConversationMessageSchema)) body: SendConversationMessageInput,
  ) {
    return this.messages.send(this.userId(req), conversationId, body, idempotencyKey);
  }

  private userId(req: Request): string {
    return (req.user as JwtPayload).sub;
  }
}
