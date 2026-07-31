import { describe, it, expect } from 'vitest';
import { isValidIanaTimezone } from '../../src/modules/profile/timezone.util';
import { putProfileSchema, putLanguageSchema } from '../../src/modules/profile/profile.dto';

/**
 * T037 — Profile validation (FR-009/FR-010, data-model §6).
 *
 * Language is constrained to the two first-class locales {ar, en}; timezone MUST
 * be a known IANA name (FR-009). These pure validators are unit-tested with no DB
 * so the contract layer can trust the Zod pipe to reject bad input (FR-037).
 */
describe('Profile validation (US3)', () => {
  describe('isValidIanaTimezone', () => {
    it('accepts well-known IANA zones', () => {
      expect(isValidIanaTimezone('Africa/Cairo')).toBe(true);
      expect(isValidIanaTimezone('America/New_York')).toBe(true);
      expect(isValidIanaTimezone('Europe/London')).toBe(true);
      expect(isValidIanaTimezone('Asia/Dubai')).toBe(true);
      expect(isValidIanaTimezone('UTC')).toBe(true);
    });

    it('rejects non-IANA strings', () => {
      expect(isValidIanaTimezone('Not/A/Zone')).toBe(false);
      expect(isValidIanaTimezone('Egypt')).toBe(false); // country, not a zone
      expect(isValidIanaTimezone('')).toBe(false);
      expect(isValidIanaTimezone('  America/New_York  ')).toBe(false); // whitespace
      expect(isValidIanaTimezone(123 as unknown as string)).toBe(false);
      expect(isValidIanaTimezone(undefined as unknown as string)).toBe(false);
    });
  });

  describe('putProfileSchema', () => {
    it('accepts a valid language + IANA timezone', () => {
      expect(() =>
        putProfileSchema.parse({ language_code: 'ar', timezone: 'Africa/Cairo' }),
      ).not.toThrow();
      expect(
        putProfileSchema.parse({ language_code: 'en', timezone: 'UTC' }).language_code,
      ).toBe('en');
    });

    it('rejects an invalid language', () => {
      expect(() => putProfileSchema.parse({ language_code: 'fr', timezone: 'UTC' })).toThrow();
    });

    it('rejects an invalid timezone with a timezone field path (FR-037)', () => {
      try {
        putProfileSchema.parse({ language_code: 'en', timezone: 'Not/A/Zone' });
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        // ZodError issues include the offending path; never the rejected value.
        const issue = (e as { issues?: { path: (string | number)[] }[] }).issues?.[0];
        expect(issue?.path?.[0]).toBe('timezone');
      }
    });

    it('rejects a missing timezone', () => {
      expect(() => putProfileSchema.parse({ language_code: 'en' })).toThrow();
    });

    it('rejects a missing language', () => {
      expect(() => putProfileSchema.parse({ timezone: 'UTC' })).toThrow();
    });
  });

  describe('putLanguageSchema', () => {
    it('accepts ar and en', () => {
      expect(putLanguageSchema.parse({ language_code: 'ar' }).language_code).toBe('ar');
      expect(putLanguageSchema.parse({ language_code: 'en' }).language_code).toBe('en');
    });

    it('rejects other languages and empty strings', () => {
      expect(() => putLanguageSchema.parse({ language_code: 'fr' })).toThrow();
      expect(() => putLanguageSchema.parse({ language_code: '' })).toThrow();
      expect(() => putLanguageSchema.parse({})).toThrow();
    });
  });
});