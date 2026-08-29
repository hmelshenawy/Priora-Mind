import { Injectable } from '@nestjs/common';
import { detectStaticOrSystemResponse } from '../utils/conversation-static-responses';

@Injectable()
export class ConversationRouterService {
  detectStaticOrSystemResponse(content: string) {
    return detectStaticOrSystemResponse(content);
  }
}
