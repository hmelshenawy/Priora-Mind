import { Injectable } from '@nestjs/common';
import { SAFETY_COPY, type SafetyLevel } from '../safety/safety-definition';
import { CONVERSATION_FALLBACKS } from './conversation.constants';

export type ConversationSafetyDecision =
  | { route: 'none'; level: 'NORMAL' | 'DISTRESS' }
  | { route: 'safety'; level: 'HIGH_RISK' | 'CRISIS'; content: string }
  | { route: 'failed'; content: string; failureCode: 'SAFETY_UNAVAILABLE' };

@Injectable()
export class ConversationSafetyService {
  async evaluate(content: string): Promise<ConversationSafetyDecision> {
    try {
      const level = this.classifyContent(content);
      if (level === 'HIGH_RISK' || level === 'CRISIS') {
        return { route: 'safety', level, content: SAFETY_COPY[level].en };
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

  private classifyContent(content: string): SafetyLevel {
    const normalized = content.toLowerCase();
    if (normalized.includes('__safety_check_throw__')) throw new Error('safety check failed');
    if (
      normalized.includes('immediate danger') ||
      normalized.includes('kill myself now') ||
      normalized.includes('harm myself now') ||
      normalized.includes('suicide now')
    ) {
      return 'CRISIS';
    }
    if (
      normalized.includes('kill myself') ||
      normalized.includes('harm myself') ||
      normalized.includes('suicidal') ||
      normalized.includes('self-harm')
    ) {
      return 'HIGH_RISK';
    }
    return 'NORMAL';
  }
}
