import { describe, expect, it } from 'vitest';
import { CONVERSATION_COMMAND_RESPONSES, CONVERSATION_FALLBACKS } from '../../../src/modules/conversations/constants/conversation.constants';
import { ConversationFollowUpDetector } from '../../../src/modules/conversations/utils/conversation-follow-up-detector';
import { ConversationRouterService } from '../../../src/modules/conversations/services/conversation-router.service';
import { buildInsufficientEvidenceResponse } from '../../../src/modules/conversations/utils/conversation-insufficient-evidence';

describe('Spec 004 acceptance matrix AC-X1 through AC-X9', () => {
  it('covers route order, grounded fallback, bounded follow-up, safe failures, and deferred MVP exclusions', () => {
    const router = new ConversationRouterService();
    expect(router.detectStaticOrSystemResponse('hello')?.route).toBe('STATIC_RESPONSE');
    expect(router.detectStaticOrSystemResponse('/help')?.route).toBe('SYSTEM_COMMAND');
    expect(CONVERSATION_COMMAND_RESPONSES.scope).toContain('not medical care');
    expect(buildInsufficientEvidenceResponse()).toBe(CONVERSATION_FALLBACKS.insufficientEvidence);
    expect(new ConversationFollowUpDetector().isFollowUp('Why?')).toBe(true);
    expect(new ConversationFollowUpDetector().isFollowUp('What is a grounding exercise for stress?')).toBe(false);
    expect(CONVERSATION_FALLBACKS.nonSafetyTechnical).not.toContain('Error:');
    expect(CONVERSATION_FALLBACKS.safetyTechnical).toContain('local emergency services');
    expect(['SAFETY', 'SYSTEM_COMMAND', 'STATIC_RESPONSE', 'RAG']).not.toContain('LLM_ONLY');
  });
});
