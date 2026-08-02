import { Injectable } from '@nestjs/common';
import { detectStaticOrSystemResponse } from './conversation-static-responses';

@Injectable()
export class ConversationRouterService {
  detectStaticOrSystemResponse(content: string) {
    return detectStaticOrSystemResponse(content);
  }
}
