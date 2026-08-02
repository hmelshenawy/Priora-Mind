import { CONVERSATION_COMMAND_RESPONSES } from './conversation.constants';

export type StaticRouteDecision =
  { route: 'STATIC_RESPONSE'; content: string } | { route: 'SYSTEM_COMMAND'; content: string };

const GREETINGS = new Set(['hi', 'hello', 'hey', 'مرحبا', 'أهلا', 'اهلا', 'السلام عليكم']);
const THANKS = new Set(['thanks', 'thank you', 'thx', 'شكرا', 'شكرًا']);

export function detectStaticOrSystemResponse(input: string): StaticRouteDecision | null {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[.!?؟]+$/u, '');
  if (!normalized) return null;
  if (GREETINGS.has(normalized)) {
    return {
      route: 'STATIC_RESPONSE',
      content: 'Hello. How can I support your coaching or wellness question today?',
    };
  }
  if (THANKS.has(normalized)) {
    return { route: 'STATIC_RESPONSE', content: "You're welcome." };
  }
  if (normalized === '/help' || normalized === 'help' || normalized === 'what can you do') {
    return { route: 'SYSTEM_COMMAND', content: CONVERSATION_COMMAND_RESPONSES.help };
  }
  if (normalized === '/scope' || normalized === 'scope' || normalized.includes('are you therapy')) {
    return { route: 'SYSTEM_COMMAND', content: CONVERSATION_COMMAND_RESPONSES.scope };
  }
  return null;
}
