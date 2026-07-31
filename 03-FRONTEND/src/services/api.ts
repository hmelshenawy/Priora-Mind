import { apiFetch } from '../lib/api-client';

/**
 * Base API service. Domain services (auth, onboarding, assessment, etc.) build on
 * this thin wrapper so they share the same auth + refresh behavior (SAD.md).
 * Returns the parsed `data` envelope field when present, else the raw payload.
 */
export class ApiService {
  protected get<T>(path: string): Promise<T> {
    return apiFetch<T>(path, { method: 'GET' });
  }

  protected post<T>(path: string, body?: unknown): Promise<T> {
    return apiFetch<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  protected put<T>(path: string, body: unknown): Promise<T> {
    return apiFetch<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  protected patch<T>(path: string, body: unknown): Promise<T> {
    return apiFetch<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  protected delete<T>(path: string): Promise<T> {
    return apiFetch<T>(path, { method: 'DELETE' });
  }
}