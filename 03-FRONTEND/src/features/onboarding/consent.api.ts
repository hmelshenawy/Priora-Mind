import { ApiService } from '../../services/api';

/**
 * Consent API client (US2, contracts/consent.md). All paths include the
 * `/api/v1` prefix to match the backend global prefix. Endpoints require a
 * valid access token + EMAIL_VERIFIED (backend-enforced); the in-memory access
 * token is attached by the shared api-client.
 */

export type LanguageCode = 'en' | 'ar';

export interface BilingualEntry {
  en: string;
  ar: string;
}

export interface NoticesResponse {
  service_boundary_version: string;
  terms_version: string;
  privacy_notice_version: string;
  service_boundary_text: BilingualEntry;
  terms_link: BilingualEntry;
  privacy_notice_link: BilingualEntry;
  required_acknowledgments: string[];
}

export interface VersionSet {
  service_boundary_version: string;
  terms_version: string;
  privacy_notice_version: string;
}

export interface ConsentStatusResponse {
  has_granted: boolean;
  requires_reconsent: boolean;
  current_versions: VersionSet;
  recorded_versions: VersionSet | null;
  consent_language_code: LanguageCode | null;
}

export interface RecordConsentBody {
  service_boundary_version: string;
  terms_version: string;
  privacy_notice_version: string;
  acknowledgments: {
    service_boundary: boolean;
    terms: boolean;
    privacy_notice: boolean;
  };
  consent_language_code: LanguageCode;
  product_channel_id: string;
}

export interface RecordConsentResponse {
  consent_record_id: string;
  granted_at: string;
  onboarding_state: 'IN_PROGRESS';
  next: string;
}

const ONB = '/api/v1/onboarding';

export class ConsentApiService extends ApiService {
  getNotices(lang: LanguageCode): Promise<NoticesResponse> {
    return this.get<NoticesResponse>(`${ONB}/notices?lang=${lang}`);
  }

  getConsentStatus(): Promise<ConsentStatusResponse> {
    return this.get<ConsentStatusResponse>(`${ONB}/consent`);
  }

  recordConsent(body: RecordConsentBody): Promise<RecordConsentResponse> {
    return this.post<RecordConsentResponse>(`${ONB}/consent`, body);
  }
}

/** Singleton used by hooks; the underlying api-client handles 401 refresh. */
export const consentApi = new ConsentApiService();