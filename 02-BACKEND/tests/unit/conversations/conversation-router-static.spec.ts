import { describe, expect, it } from 'vitest';
import { ConversationRouterService } from '../../../src/modules/conversations/conversation-router.service';

describe('conversation static/system routing', () => {
  const router = new ConversationRouterService();

  it('detects greetings and thanks as static responses', () => {
    expect(router.detectStaticOrSystemResponse('hello')).toMatchObject({
      route: 'STATIC_RESPONSE',
    });
    expect(router.detectStaticOrSystemResponse('thanks')).toMatchObject({
      route: 'STATIC_RESPONSE',
    });
  });

  it('detects help and scope as system commands', () => {
    expect(router.detectStaticOrSystemResponse('/help')).toMatchObject({ route: 'SYSTEM_COMMAND' });
    expect(router.detectStaticOrSystemResponse('/scope')).toMatchObject({
      route: 'SYSTEM_COMMAND',
    });
  });

  it('does not classify substantive messages as static or system commands', () => {
    expect(router.detectStaticOrSystemResponse('What is a grounding exercise?')).toBeNull();
  });
});
