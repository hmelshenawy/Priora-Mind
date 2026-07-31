import { getAccessToken, setAccessToken, clearAccessToken } from './auth-token';

/**
 * API client (Constitution: Privacy + SAD.md auth strategy).
 *
 * - Access token is sent as a Bearer header from in-memory storage (never localStorage).
 * - On 401, transparently attempts ONE refresh against /api/v1/auth/refresh using the
 *   HttpOnly refresh cookie (credentials: 'include'), mints a new access token, and
 *   retries the original request exactly once. A second failure clears the token and
 *   surfaces a 401 to the caller so the UX guard can route back to register/login.
 * - Never logs request bodies or response bodies containing sensitive data.
 */

const DEFAULT_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

const REFRESH_PATH = '/api/v1/auth/refresh';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: { path: string; message: string }[],
    /** US6: approved deterministic copy carried by 503 SAFETY_UNAVAILABLE (Safety §10).
     * The fail-closed fallback copy must be shown to the user; never invented client-side. */
    public readonly copy?: { en: string; ar: string },
    /** US8 (FR-033/FR-035): the unfinished onboarding step name carried by 403
     * ONBOARDING_STEP_BLOCKED (`error.next`). The client maps it to the resume
     * route via `routeForStep` so a blocked user is redirected to the correct
     * unfinished step — not a hardcoded one. */
    public readonly nextStep?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiFetchOptions extends RequestInit {
  /** Internal: skip the refresh attempt to prevent infinite recursion. */
  _retry?: boolean;
}

function buildUrl(path: string, baseUrl = DEFAULT_BASE_URL): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

function authHeader(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(res: Response): Promise<ApiError> {
  let code = 'INTERNAL';
  let message = 'Request failed';
  let fields: { path: string; message: string }[] | undefined;
  let copy: { en: string; ar: string } | undefined;
  let nextStep: string | undefined;
  try {
    const body = await res.json();
    const err = body?.error ?? body;
    code = err?.code ?? code;
    message = err?.message ?? message;
    fields = err?.fields ?? undefined;
    // US6: capture the approved fail-closed copy from SAFETY_UNAVAILABLE (Safety §10).
    if (err?.copy && typeof err.copy.en === 'string' && typeof err.copy.ar === 'string') {
      copy = { en: err.copy.en, ar: err.copy.ar };
    }
    // US8 (FR-033): capture the unfinished step name from ONBOARDING_STEP_BLOCKED.
    if (typeof err?.next === 'string') nextStep = err.next;
  } catch {
    // Non-JSON error body — keep defaults; never expose raw body text.
  }
  return new ApiError(res.status, code, message, fields, copy, nextStep);
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(buildUrl(REFRESH_PATH), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return false;
    const body = await res.json();
    const token: string | undefined = body?.data?.accessToken ?? body?.accessToken;
    if (typeof token !== 'string' || token.length === 0) return false;
    setAccessToken(token);
    return true;
  } catch {
    return false;
  }
}

/**
 * Typed fetch wrapper. Throws ApiError on non-2xx. On 401 it transparently refreshes
 * once and retries (unless _retry is already set, in which case it clears the token
 * and rethrows so the UX guard can route away).
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { _retry, headers, ...rest } = options;
  const res = await fetch(buildUrl(path), {
    ...rest,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeader(),
      ...(headers as Record<string, string> | undefined),
    },
  });

  if (res.status === 401 && !_retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, _retry: true });
    }
    clearAccessToken();
    throw new ApiError(401, 'UNAUTHENTICATED', 'Session expired');
  }

  if (!res.ok) {
    throw await parseError(res);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}