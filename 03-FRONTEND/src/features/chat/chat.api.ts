import type {
  ConversationDetailResponse,
  ConversationListResponse,
  ConversationMutationResponse,
  SendConversationMessageResponse,
} from '@priora/shared-types';
import { apiFetch } from '../../lib/api-client';
import { ApiService } from '../../services/api';

const BASE = '/api/v1/conversations';

export class ConversationApiService extends ApiService {
  list(includeArchived = false): Promise<ConversationListResponse> {
    return this.get<ConversationListResponse>(`${BASE}?includeArchived=${includeArchived}`);
  }

  create(): Promise<ConversationMutationResponse> {
    return this.post<ConversationMutationResponse>(BASE, {});
  }

  retrieve(conversationId: string): Promise<ConversationDetailResponse> {
    return this.get<ConversationDetailResponse>(`${BASE}/${conversationId}`);
  }

  setArchived(conversationId: string, archived: boolean): Promise<ConversationMutationResponse> {
    return this.patch<ConversationMutationResponse>(`${BASE}/${conversationId}`, { archived });
  }

  remove(conversationId: string): Promise<void> {
    return this.delete<void>(`${BASE}/${conversationId}`);
  }

  send(conversationId: string, content: string, idempotencyKey: string): Promise<SendConversationMessageResponse> {
    return apiFetch<SendConversationMessageResponse>(`${BASE}/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ content }),
    });
  }
}

export const conversationApi = new ConversationApiService();
