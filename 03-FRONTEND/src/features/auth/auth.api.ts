import { ApiService } from '../../services/api';
import { clearAccessToken, setAccessToken } from '../../lib/auth-token';

/**
 * Auth API client (US1, contracts/auth.md). All paths include the `/api/v1`
 * prefix to match the backend global prefix and the api-client refresh path.
 * The access token is kept in memory only (set on login, cleared on logout);
 * the refresh token is the HttpOnly cookie managed by the browser/api-client.
 */

export type LanguageCode = 'en' | 'ar';

export interface RegisterBody {
  email: string;
  password: string;
  consent_language_code?: LanguageCode;
}

export interface AckResponse {
  message: string;
}

export interface LoginProfile {
  onboarding_state: string;
  language_code: string | null;
}

export interface LoginResponse {
  accessToken: string;
  profile: LoginProfile;
}

export interface VerifyEmailResponse {
  status: 'verified';
  redirect: string;
}

const AUTH = '/api/v1/auth';

export class AuthApiService extends ApiService {
  register(body: RegisterBody): Promise<AckResponse> {
    return this.post<AckResponse>(`${AUTH}/register`, body);
  }

  resendVerification(email: string): Promise<AckResponse> {
    return this.post<AckResponse>(`${AUTH}/resend-verification`, { email });
  }

  verifyEmail(token: string, userId: string): Promise<VerifyEmailResponse> {
    const qs = new URLSearchParams({ token, userId });
    return this.get<VerifyEmailResponse>(`${AUTH}/verify-email?${qs.toString()}`);
  }

  login(body: { email: string; password: string }): Promise<LoginResponse> {
    return this.post<LoginResponse>(`${AUTH}/login`, body).then((res) => {
      setAccessToken(res.accessToken);
      return res;
    });
  }

  logout(): Promise<void> {
    return this.post<void>(`${AUTH}/logout`, undefined).finally(() => {
      clearAccessToken();
    });
  }
}

/** Singleton used by hooks; the underlying api-client handles 401 refresh. */
export const authApi = new AuthApiService();