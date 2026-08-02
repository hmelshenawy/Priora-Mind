import { describe, expect, it } from 'vitest';
import { ConversationFollowUpDetector } from '../../../src/modules/conversations/conversation-follow-up-detector';

describe('conversation follow-up detector', () => {
  it('detects short dependent questions and previous-discussion references', () => {
    const detector = new ConversationFollowUpDetector();
    expect(detector.isFollowUp('Why?')).toBe(true);
    expect(detector.isFollowUp('Can you explain that?')).toBe(true);
    expect(detector.isFollowUp('What about the previous idea?')).toBe(true);
  });

  it('passes through clear standalone queries', () => {
    const detector = new ConversationFollowUpDetector();
    expect(detector.isFollowUp('What is a grounding exercise for acute stress?')).toBe(false);
  });
});
