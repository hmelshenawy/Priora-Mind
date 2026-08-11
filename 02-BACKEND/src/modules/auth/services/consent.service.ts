import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  type ConsentStatusResponse,
  type NoticesQuery,
  type NoticesResponse,
  type RecordConsentInput,
  type RecordConsentResponse,
  type VersionSet,
} from '../dto/consent.dto';
import {
  AcknowledgmentsIncompleteException,
  NoticesUnavailableException,
  ReconsentRequiredException,
} from '../constants/consent.errors';

/**
 * Consent domain service (FR-005..FR-008, FR-032, contracts/consent.md,
 * Consent policy §5/§6/§12).
 *
 * Invariants:
 *  - Fail-closed (FR-007): if the current NoticeVersionSet cannot be determined,
 *    notices return 503 NOTICES_UNAVAILABLE and consent is NOT recorded.
 *  - Re-consent (FR-008): a recorded version set that differs from the current
 *    set requires re-consent (409 RECONSENT_REQUIRED); the prior record is
 *    retained for audit (Consent §8) and a new granted row is written on re-consent.
 *  - Idempotent (research D6, Consent §12): a retry for the same already-granted
 *    version set returns the existing record; the unique (userId, *_version)
 *  - The record holds only version ids + language + channel + timestamps — never
 *    answers, safety data, inferred state, or copied notice text (Consent §5).
 *  - Nothing sensitive is logged; errors carry a tag only.
 */
@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getNotices(_query: NoticesQuery): Promise<NoticesResponse> {
    const set = await this.currentNoticeSet();
    return {
      service_boundary_version: set.serviceBoundaryVersion,
      terms_version: set.termsVersion,
      privacy_notice_version: set.privacyNoticeVersion,
      service_boundary_text: { en: set.boundaryTextEn, ar: set.boundaryTextAr },
      terms_link: { en: set.termsLinkEn, ar: set.termsLinkAr },
      privacy_notice_link: { en: set.privacyNoticeLinkEn, ar: set.privacyNoticeLinkAr },
      required_acknowledgments: ['service_boundary', 'terms', 'privacy_notice'],
    };
  }

  async getConsentStatus(userId: string): Promise<ConsentStatusResponse> {
    const current = await this.currentNoticeSet();
    const latest = await this.prisma.consentRecord.findFirst({
      where: { userId },
      orderBy: { grantedAt: 'desc' },
    });
    if (!latest) {
      return {
        has_granted: false,
        requires_reconsent: true,
        current_versions: toVersionSet(current),
        recorded_versions: null,
        consent_language_code: null,
      };
    }
    const recorded = {
      service_boundary_version: latest.serviceBoundaryVersion,
      terms_version: latest.termsVersion,
      privacy_notice_version: latest.privacyNoticeVersion,
    };
    return {
      has_granted: true,
      requires_reconsent: !sameVersions(recorded, current),
      current_versions: toVersionSet(current),
      recorded_versions: recorded,
      consent_language_code: latest.consentLanguageCode as 'ar' | 'en',
    };
  }

  /** Narrow check used by the OnboardingGuard (T033): consent granted for the
   * current NoticeVersionSet (has a record AND it matches current versions). */
  async hasGrantedCurrentConsent(userId: string): Promise<boolean> {
    try {
      const status = await this.getConsentStatus(userId);
      return status.has_granted && !status.requires_reconsent;
    } catch (err) {
      // Fail-closed: undetermined notices → no consent.
      this.logger.warn(`consent-status-error: ${errName(err)}`);
      return false;
    }
  }

  async recordConsent(userId: string, input: RecordConsentInput): Promise<RecordConsentResponse> {
    const current = await this.currentNoticeSet(); // fail-closed 503 if undetermined
    if (!allAcknowledged(input.acknowledgments)) throw new AcknowledgmentsIncompleteException();
    if (
      input.service_boundary_version !== current.serviceBoundaryVersion ||
      input.terms_version !== current.termsVersion ||
      input.privacy_notice_version !== current.privacyNoticeVersion
    ) {
      throw new ReconsentRequiredException(toVersionSet(current));
    }
    // Idempotent: a same-version retry returns the existing record (research D6).
    const existing = await this.prisma.consentRecord.findFirst({
      where: {
        userId,
        serviceBoundaryVersion: current.serviceBoundaryVersion,
        termsVersion: current.termsVersion,
        privacyNoticeVersion: current.privacyNoticeVersion,
      },
    });
    let record = existing;
    if (!record) {
      record = await this.prisma.consentRecord.create({
        data: {
          userId,
          serviceBoundaryVersion: current.serviceBoundaryVersion,
          termsVersion: current.termsVersion,
          privacyNoticeVersion: current.privacyNoticeVersion,
          consentLanguageCode: input.consent_language_code,
          productChannelId: input.product_channel_id,
          grantedAt: new Date(),
        },
      });
      await this.prisma.userAccount.update({
        where: { id: userId },
        data: { lastActivityAt: new Date() },
      });
    }
    return {
      consent_record_id: record.id,
      granted_at: record.grantedAt.toISOString(),
      onboarding_state: 'IN_PROGRESS',
      next: '/onboarding/profile',
    };
  }

  // ─────────────────────────── helpers ───────────────────────────

  /** Resolve the active notice set (latest published). Fail-closed if none. */
  private async currentNoticeSet(): Promise<{
    serviceBoundaryVersion: string;
    termsVersion: string;
    privacyNoticeVersion: string;
    boundaryTextEn: string;
    boundaryTextAr: string;
    termsLinkEn: string;
    termsLinkAr: string;
    privacyNoticeLinkEn: string;
    privacyNoticeLinkAr: string;
  }> {
    const row = await this.prisma.noticeVersionSet.findFirst({
      where: { isActive: true },
      orderBy: { publishedAt: 'desc' },
    });
    if (!row) throw new NoticesUnavailableException();
    return row;
  }
}

function toVersionSet(row: {
  serviceBoundaryVersion: string;
  termsVersion: string;
  privacyNoticeVersion: string;
}): VersionSet {
  return {
    service_boundary_version: row.serviceBoundaryVersion,
    terms_version: row.termsVersion,
    privacy_notice_version: row.privacyNoticeVersion,
  };
}

function sameVersions(
  recorded: VersionSet,
  current: { serviceBoundaryVersion: string; termsVersion: string; privacyNoticeVersion: string },
): boolean {
  return (
    recorded.service_boundary_version === current.serviceBoundaryVersion &&
    recorded.terms_version === current.termsVersion &&
    recorded.privacy_notice_version === current.privacyNoticeVersion
  );
}

function allAcknowledged(ack: RecordConsentInput['acknowledgments']): boolean {
  return ack.service_boundary === true && ack.terms === true && ack.privacy_notice === true;
}

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown';
}