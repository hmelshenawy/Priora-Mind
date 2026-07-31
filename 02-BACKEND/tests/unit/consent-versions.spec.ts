import { describe, it, expect, beforeEach } from 'vitest';
import '../helpers/test-env';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConsentService } from '../../src/modules/auth/consent.service';
import {
  AcknowledgmentsIncompleteException,
  NoticesUnavailableException,
  ReconsentRequiredException,
} from '../../src/modules/auth/consent.errors';
import { InMemoryPrisma } from '../helpers/in-memory-prisma';
import {
  NOTICE_VERSION_V1,
  NOTICE_VERSION_V2_TERMS,
} from '../../prisma/seed/notice-versions';

/**
 * T029 — ConsentService unit tests: notice-version mismatch → re-consent, and
 * fail-closed when the current notice versions cannot be determined (FR-007/
 * FR-008, Consent §6/§12). Runs against the in-memory Prisma fixture (no DB).
 */
describe('ConsentService — versions + fail-closed (US2)', () => {
  let prisma: InMemoryPrisma;
  let consent: ConsentService;
  const userId = 'user-1';

  beforeEach(() => {
    prisma = new InMemoryPrisma();
    prisma.noticeVersionSet.create({
      data: { ...NOTICE_VERSION_V1, publishedAt: new Date('2026-01-01T00:00:00Z') },
    });
    // recordConsent touches the user's lastActivityAt; seed a verified user.
    prisma.userAccount.create({
      data: { id: userId, email: 'u@t.dev', passwordHash: 'x', status: 'EMAIL_VERIFIED' },
    });
    consent = new ConsentService(prisma as unknown as PrismaService);
  });

  const fullAck = {
    service_boundary: true,
    terms: true,
    privacy_notice: true,
  };

  function consentBody(versions: { serviceBoundaryVersion: string; termsVersion: string; privacyNoticeVersion: string }) {
    return {
      service_boundary_version: versions.serviceBoundaryVersion,
      terms_version: versions.termsVersion,
      privacy_notice_version: versions.privacyNoticeVersion,
      acknowledgments: fullAck,
      consent_language_code: 'en' as const,
      product_channel_id: 'priora-mind-web',
    };
  }

  it('getNotices returns the active v1 set (versions, bilingual boundary text, links, acks)', async () => {
    const notices = await consent.getNotices({});
    expect(notices.service_boundary_version).toBe('boundary-1.0');
    expect(notices.terms_version).toBe('terms-1.0');
    expect(notices.privacy_notice_version).toBe('privacy-1.0');
    expect(notices.service_boundary_text.en).toContain('not medical');
    expect(notices.service_boundary_text.ar).toContain('ليست خدمة طبية');
    expect(notices.required_acknowledgments).toEqual([
      'service_boundary',
      'terms',
      'privacy_notice',
    ]);
  });

  it('getConsentStatus with no record → not granted, re-consent required', async () => {
    const status = await consent.getConsentStatus(userId);
    expect(status.has_granted).toBe(false);
    expect(status.requires_reconsent).toBe(true);
    expect(status.recorded_versions).toBeNull();
    expect(status.consent_language_code).toBeNull();
    expect(status.current_versions).toEqual({
      service_boundary_version: 'boundary-1.0',
      terms_version: 'terms-1.0',
      privacy_notice_version: 'privacy-1.0',
    });
  });

  it('recordConsent stores version ids + language + channel only (no answers / copied text)', async () => {
    const res = await consent.recordConsent(userId, consentBody(NOTICE_VERSION_V1));
    expect(res.consent_record_id).toBeTypeOf('string');
    expect(res.onboarding_state).toBe('IN_PROGRESS');
    expect(res.next).toBe('/onboarding/profile');
    expect(() => new Date(res.granted_at)).not.toThrow();

    const row = prisma.consentStore.get(res.consent_record_id)!;
    expect(row.serviceBoundaryVersion).toBe('boundary-1.0');
    expect(row.termsVersion).toBe('terms-1.0');
    expect(row.privacyNoticeVersion).toBe('privacy-1.0');
    expect(row.consentLanguageCode).toBe('en');
    expect(row.productChannelId).toBe('priora-mind-web');
    // The record MUST NOT carry answers/safety/inferred/copied-notice fields.
    const keys = Object.keys(row);
    expect(keys).not.toContain('answers');
    expect(keys).not.toContain('boundaryText');
    expect(keys).not.toContain('value');
  });

  it('recordConsent is idempotent: a same-version retry returns the existing record', async () => {
    const first = await consent.recordConsent(userId, consentBody(NOTICE_VERSION_V1));
    const second = await consent.recordConsent(userId, consentBody(NOTICE_VERSION_V1));
    expect(second.consent_record_id).toBe(first.consent_record_id);
    expect(prisma.consentStore.size).toBe(1);
  });

  it('recordConsent with an incomplete acknowledgment → 400 ACKNOWLEDGMENTS_INCOMPLETE (no record)', async () => {
    await expect(
      consent.recordConsent(userId, {
        ...consentBody(NOTICE_VERSION_V1),
        acknowledgments: { service_boundary: true, terms: false, privacy_notice: true },
      }),
    ).rejects.toBeInstanceOf(AcknowledgmentsIncompleteException);
    expect(prisma.consentStore.size).toBe(0);
  });

  it('recordConsent with stale versions → 409 RECONSENT_REQUIRED (current_versions echoed, no record)', async () => {
    const err = await consent
      .recordConsent(userId, {
        ...consentBody(NOTICE_VERSION_V1),
        terms_version: 'terms-0.9', // stale
      })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ReconsentRequiredException);
    const body = err.getResponse() as { error: { code: string; current_versions: object } };
    expect(err.getStatus()).toBe(409);
    expect(body.error.code).toBe('RECONSENT_REQUIRED');
    expect(body.error.current_versions.terms_version).toBe('terms-1.0');
    expect(prisma.consentStore.size).toBe(0);
  });

  it('fail-closed: with no active notice set, getNotices + recordConsent throw 503 (no record)', async () => {
    prisma.noticeStore.clear();
    await expect(consent.getNotices({})).rejects.toBeInstanceOf(NoticesUnavailableException);
    await expect(consent.recordConsent(userId, consentBody(NOTICE_VERSION_V1))).rejects.toBeInstanceOf(
      NoticesUnavailableException,
    );
    expect(prisma.consentStore.size).toBe(0);
  });

  it('re-consent: a terms-version change requires re-consent and writes a new retained record', async () => {
    await consent.recordConsent(userId, consentBody(NOTICE_VERSION_V1));
    // Publish terms-1.1 and retire v1.
    prisma.noticeVersionSet.update({ where: { id: NOTICE_VERSION_V1.id }, data: { isActive: false } });
    prisma.noticeVersionSet.create({
      data: { ...NOTICE_VERSION_V2_TERMS, publishedAt: new Date('2026-06-01T00:00:00Z') },
    });

    const status = await consent.getConsentStatus(userId);
    expect(status.has_granted).toBe(true);
    expect(status.requires_reconsent).toBe(true);
    expect(status.recorded_versions!.terms_version).toBe('terms-1.0');
    expect(status.current_versions.terms_version).toBe('terms-1.1');

    const res = await consent.recordConsent(userId, consentBody(NOTICE_VERSION_V2_TERMS));
    expect(prisma.consentStore.size).toBe(2); // prior retained for audit, new granted
    expect(res.consent_record_id).toBeTypeOf('string');

    const after = await consent.getConsentStatus(userId);
    expect(after.has_granted).toBe(true);
    expect(after.requires_reconsent).toBe(false);
    expect(after.recorded_versions!.terms_version).toBe('terms-1.1');
  });

  it('hasGrantedCurrentConsent is false before consent, true after, false after a version change', async () => {
    expect(await consent.hasGrantedCurrentConsent(userId)).toBe(false);
    await consent.recordConsent(userId, consentBody(NOTICE_VERSION_V1));
    expect(await consent.hasGrantedCurrentConsent(userId)).toBe(true);
    prisma.noticeVersionSet.update({ where: { id: NOTICE_VERSION_V1.id }, data: { isActive: false } });
    prisma.noticeVersionSet.create({
      data: { ...NOTICE_VERSION_V2_TERMS, publishedAt: new Date('2026-06-01T00:00:00Z') },
    });
    expect(await consent.hasGrantedCurrentConsent(userId)).toBe(false);
  });

  it('hasGrantedCurrentConsent fails closed (false) when notices are undetermined', async () => {
    prisma.noticeStore.clear();
    expect(await consent.hasGrantedCurrentConsent(userId)).toBe(false);
  });
});