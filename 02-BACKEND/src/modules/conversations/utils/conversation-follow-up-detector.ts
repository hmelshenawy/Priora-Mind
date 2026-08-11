import { Injectable } from '@nestjs/common';

@Injectable()
export class ConversationFollowUpDetector {
  isFollowUp(content: string): boolean {
    const normalized = content.trim().toLowerCase();
    if (!normalized) return false;
    if (/^(why|how|what|which|where|when|can you explain|tell me more)\??$/.test(normalized)) return true;
    if (/\b(that|this|it|those|them|they|previous|earlier|above|last thing)\b/.test(normalized)) return true;
    const words = normalized.split(/\s+/).filter(Boolean);
    return words.length <= 3 && /^(why|how|what about|which one)\b/.test(normalized);
  }
}
