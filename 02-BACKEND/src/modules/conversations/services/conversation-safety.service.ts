import { Injectable, Optional } from '@nestjs/common';
import { SafetyService } from '../../safety/safety.public';
import { CONVERSATION_FALLBACKS } from '../constants/conversation.constants';

export type ConversationSafetyDecision =
  | { route: 'none'; level: 'NORMAL' | 'DISTRESS' }
  | { route: 'safety'; level: 'HIGH_RISK' | 'CRISIS'; content: string }
  | { route: 'failed'; content: string; failureCode: 'SAFETY_UNAVAILABLE' };

@Injectable()
export class ConversationSafetyService {
  constructor(@Optional() private readonly safety?: SafetyService) {}

  async evaluate(content: string): Promise<ConversationSafetyDecision> {
    try {
      const decision = this.safety
        ? this.safety.evaluateConversation(content)
        : SafetyService.evaluateConversation(content);
      const { level } = decision;
      if (level === 'HIGH_RISK' || level === 'CRISIS') {
        return { route: 'safety', level, content: decision.content };
      }
      return { route: 'none', level };
    } catch {
      return {
        route: 'failed',
        content: CONVERSATION_FALLBACKS.safetyTechnical,
        failureCode: 'SAFETY_UNAVAILABLE',
      };
    }
  }

}
