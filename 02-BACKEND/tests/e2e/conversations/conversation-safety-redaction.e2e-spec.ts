import { describe, expect, it } from 'vitest';
import { toSafeLogContext } from '../../../src/common/redact';

describe('conversation safety redaction', () => {
  it('redacts raw safety-sensitive message content from normal log metadata', () => {
    const safe = toSafeLogContext({
      operation: 'conversation_safety',
      content: 'I feel suicidal',
      route: 'SAFETY',
      status: 'FAILED',
    });
    expect(JSON.stringify(safe)).not.toContain('suicidal');
    expect(JSON.stringify(safe)).toContain('SAFETY');
  });
});
