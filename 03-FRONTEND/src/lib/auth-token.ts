/**
 * In-memory access-token store (Constitution: Privacy, Data Isolation, User Control).
 *
 * SECURITY INVARIANT — the access token lives ONLY in module-scoped memory. It is
 * NEVER written to localStorage, sessionStorage, or a cookie. The refresh token is
 * an HttpOnly cookie set by the backend; the browser cannot read it. This is the
 * single approved frontend token strategy (SAD.md / Frontend_Architecture.md) —
 * do NOT add an alternative storage strategy.
 *
 * Memory-only storage means a page refresh clears the access token; the API client
 * then transparently re-mints one via the refresh cookie (see api-client.ts). This
 * is intentional: a stolen access token from memory is bounded by its short TTL and
 * cannot be exfiltrated from persistent storage.
 */

let accessToken: string | null = null;

type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();

/** Returns the current access token, or null when the session is unauthenticated. */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Stores a freshly minted access token and notifies subscribers. */
export function setAccessToken(token: string | null): void {
  accessToken = token;
  for (const listener of listeners) {
    try {
      listener(token);
    } catch {
      // A subscriber throwing must never break auth state transitions.
    }
  }
}

/** Clears the in-memory token (e.g. on logout / final 401). */
export function clearAccessToken(): void {
  setAccessToken(null);
}

/**
 * Subscribe to token changes (e.g. for re-rendering on auth transitions).
 * Returns an unsubscribe function.
 */
export function onAccessTokenChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}