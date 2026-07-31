import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

/** True for Prisma's JSON-null sentinels (Prisma.JsonNull / Prisma.DbNull), which
 * the services pass for nullable JSON fields. Coerced to JS null on store so
 * reads mirror real Prisma (which returns null for a NULL column). */
function isJsonNullSentinel(v: unknown): boolean {
  return v === Prisma.JsonNull || v === Prisma.DbNull;
}

/**
 * In-memory PrismaService stand-in for contract tests (T017).
 *
 * Implements ONLY the subset of the Prisma client surface that the AuthService
 * uses, so auth contract tests run without a database. This is a test fixture
 * (Constitution VIII exempts fixtures from the 300-line rule). Real persistence
 * is exercised in the e2e suites against an isolated test database.
 *
 * Delegate methods are arrow functions so `this` always binds to the
 * InMemoryPrisma instance (class field initializers capture lexical `this`).
 */

type AccountStatus = 'REGISTERED' | 'EMAIL_VERIFIED';

interface UserAccountRow {
  id: string;
  email: string;
  passwordHash: string;
  status: AccountStatus;
  createdAt: Date;
  lastActivityAt: Date;
  deletedAt: Date | null;
}
interface VerificationTokenRow {
  id: string;
  userId: string;
  tokenHash: Uint8Array;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}
interface RefreshTokenRow {
  id: string;
  userId: string;
  tokenHash: Uint8Array;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}
interface NoticeVersionRow {
  id: string;
  serviceBoundaryVersion: string;
  termsVersion: string;
  privacyNoticeVersion: string;
  boundaryTextEn: string;
  boundaryTextAr: string;
  termsLinkEn: string;
  termsLinkAr: string;
  privacyNoticeLinkEn: string;
  privacyNoticeLinkAr: string;
  publishedAt: Date;
  isActive: boolean;
}
interface ConsentRecordRow {
  id: string;
  userId: string;
  serviceBoundaryVersion: string;
  termsVersion: string;
  privacyNoticeVersion: string;
  consentLanguageCode: string;
  productChannelId: string;
  grantedAt: Date;
  createdAt: Date;
}
type OnboardingStateValue =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'ASSESSMENT_PENDING'
  | 'ASSESSMENT_IN_PROGRESS'
  | 'ASSESSMENT_SUBMITTED'
  | 'COMPLETED'
  | 'SAFETY_HOLD';
type AssessmentStateValue =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUSPENDED'
  | 'SUBMITTED'
  | 'SCORED';
type QuestionKind =
  | 'current_state'
  | 'goal_select'
  | 'goal_rank'
  | 'goal_free_text'
  | 'safety';
interface ProfileRow {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
interface PreferencesRow {
  id: string;
  userId: string;
  languageCode: string;
  timezone: string | null;
  updatedAt: Date;
}
interface OnboardingStateRow {
  id: string;
  userId: string;
  state: OnboardingStateValue;
  currentStep: string | null;
  updatedAt: Date;
  lastActivityAt: Date;
}
interface AssessmentDefinitionRow {
  id: string;
  version: string;
  isActive: boolean;
  content: unknown;
  publishedAt: Date;
}
interface AssessmentRow {
  id: string;
  userId: string;
  definitionVersion: string;
  state: AssessmentStateValue;
  startedAt: Date | null;
  submittedAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
}
interface AssessmentAnswerRow {
  id: string;
  assessmentId: string;
  questionId: string;
  questionKind: QuestionKind;
  value: unknown;
  updatedAt: Date;
}
interface AssessmentResultRow {
  id: string;
  assessmentId: string;
  userId: string;
  definitionVersion: string;
  domainScores: unknown;
  strongestDomain: string;
  supportDomain: string;
  selectedPriorities: unknown;
  goalFreeText: unknown | null;
  safetyEvaluationId: string | null;
  createdAt: Date;
}
type SafetyLevel = 'NORMAL' | 'DISTRESS' | 'HIGH_RISK' | 'CRISIS';
type TriggerContext = 'per_answer' | 'on_submit' | 're_entry';
interface SafetyEvaluationRow {
  id: string;
  userId: string;
  assessmentId: string | null;
  definitionVersion: string;
  level: SafetyLevel;
  reasons: string[];
  triggerContext: TriggerContext;
  isCurrent: boolean;
  evaluatedAt: Date;
  createdAt: Date;
}
type RunKind = 'scheduled_retention' | 'account_deletion';
type RetentionStatus = 'completed' | 'partial' | 'failed';
interface DeletionLogRow {
  id: string;
  runKind: RunKind;
  windowStart: Date;
  windowEnd: Date;
  categoryCounts: unknown;
  errorSummary: string | null;
  status: RetentionStatus;
  confirmationId: string;
  createdAt: Date;
}

type WhereUser = Partial<Pick<UserAccountRow, 'email' | 'status' | 'deletedAt'>> & {
  lastActivityAt?: { lt: Date };
  id?: string | { in: string[] };
};
type WhereToken = { userId?: string; tokenHash?: Uint8Array; consumedAt?: null };
type WhereRefresh = { tokenHash?: Uint8Array; userId?: string };
type WhereNotice = { isActive?: boolean };
type WhereConsent = {
  userId?: string | { in: string[] };
  serviceBoundaryVersion?: string;
  termsVersion?: string;
  privacyNoticeVersion?: string;
};
type WhereByUser = { userId?: string | { in: string[] } };
type WhereOnboardingState = {
  userId?: string | { in: string[] };
  lastActivityAt?: { lt: Date };
  state?: { in: OnboardingStateValue[] };
};
type WhereAssessment = WhereByUser & {
  lastActivityAt?: { lt: Date };
  state?: { in: AssessmentStateValue[] };
};
type WhereAssessmentAnswer = { assessmentId?: string | { in: string[] } };
type WhereDefinition = { version?: string; isActive?: boolean };
type WhereSafetyEvaluation = {
  userId?: string | { in: string[] };
  assessmentId?: string | { in: string[] };
  isCurrent?: boolean;
};
type OrderByEvaluatedAt = { evaluatedAt: 'desc' | 'asc' };

function bufEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Match a `where.id` that may be a literal or `{ in: [...] }` (Prisma both shapes). */
function matchesId(id: string | { in: string[] }, rowId: string): boolean {
  if (typeof id === 'string') return id === rowId;
  return id.in.includes(rowId);
}

export class InMemoryPrisma {
  private readonly users = new Map<string, UserAccountRow>();
  private readonly vtokens = new Map<string, VerificationTokenRow>();
  private readonly rtokens = new Map<string, RefreshTokenRow>();
  private readonly notices = new Map<string, NoticeVersionRow>();
  private readonly consent = new Map<string, ConsentRecordRow>();
  private readonly profiles = new Map<string, ProfileRow>();
  private readonly prefs = new Map<string, PreferencesRow>();
  private readonly onboarding = new Map<string, OnboardingStateRow>();
  private readonly definitions = new Map<string, AssessmentDefinitionRow>();
  private readonly assessments = new Map<string, AssessmentRow>();
  private readonly answers = new Map<string, AssessmentAnswerRow>();
  private readonly results = new Map<string, AssessmentResultRow>();
  private readonly safetyEvaluations = new Map<string, SafetyEvaluationRow>();
  private readonly deletionLogs = new Map<string, DeletionLogRow>();
  /** Monotonic insertion order for consent rows — tiebreaks equal `grantedAt`
   * timestamps so "latest" is deterministic (most recently inserted wins). */
  private readonly consentOrder = new Map<string, number>();
  private consentCounter = 0;

  readonly userAccount = {
    findFirst: ({ where }: { where: WhereUser }): UserAccountRow | null => {
      for (const row of this.users.values()) {
        if (where.email !== undefined && row.email !== where.email) continue;
        if (where.status !== undefined && row.status !== where.status) continue;
        if (where.deletedAt !== undefined && row.deletedAt !== where.deletedAt) continue;
        if (where.lastActivityAt && !(row.lastActivityAt < where.lastActivityAt.lt)) continue;
        if (where.id !== undefined && !matchesId(where.id, row.id)) continue;
        return { ...row };
      }
      return null;
    },
    findUnique: ({ where }: { where: { id: string } }): UserAccountRow | null => {
      const row = this.users.get(where.id);
      return row ? { ...row } : null;
    },
    findMany: ({ where }: { where: WhereUser }): UserAccountRow[] => {
      const out: UserAccountRow[] = [];
      for (const row of this.users.values()) {
        if (where.status !== undefined && row.status !== where.status) continue;
        if (where.deletedAt !== undefined && row.deletedAt !== where.deletedAt) continue;
        if (where.lastActivityAt && !(row.lastActivityAt < where.lastActivityAt.lt)) continue;
        if (where.id !== undefined && !matchesId(where.id, row.id)) continue;
        out.push({ ...row });
      }
      return out;
    },
    create: ({ data }: { data: Partial<UserAccountRow> }): UserAccountRow => {
      const now = new Date();
      const row: UserAccountRow = {
        id: data.id ?? randomUUID(),
        email: data.email!,
        passwordHash: data.passwordHash!,
        status: data.status!,
        createdAt: now,
        lastActivityAt: now,
        deletedAt: data.deletedAt ?? null,
      };
      this.users.set(row.id, row);
      return { ...row };
    },
    update: ({ where, data }: { where: { id: string }; data: Partial<UserAccountRow> }): UserAccountRow => {
      const row = this.users.get(where.id);
      if (!row) throw new Error('user not found');
      Object.assign(row, data);
      return { ...row };
    },
    deleteMany: async ({ where }: { where: WhereUser }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of [...this.users.values()]) {
        if (where.status !== undefined && row.status !== where.status) continue;
        if (where.deletedAt !== undefined && row.deletedAt !== where.deletedAt) continue;
        if (where.lastActivityAt && !(row.lastActivityAt < where.lastActivityAt.lt)) continue;
        if (where.id !== undefined && !matchesId(where.id, row.id)) continue;
        // cascade: drop the row's tokens + consent + profile/preferences/onboarding
        for (const t of [...this.vtokens.values()]) if (t.userId === row.id) this.vtokens.delete(t.id);
        for (const t of [...this.rtokens.values()]) if (t.userId === row.id) this.rtokens.delete(t.id);
        for (const c of [...this.consent.values()]) if (c.userId === row.id) {
          this.consent.delete(c.id);
          this.consentOrder.delete(c.id);
        }
        for (const p of [...this.profiles.values()]) if (p.userId === row.id) this.profiles.delete(p.id);
        for (const p of [...this.prefs.values()]) if (p.userId === row.id) this.prefs.delete(p.id);
        for (const s of [...this.onboarding.values()]) if (s.userId === row.id) this.onboarding.delete(s.id);
        for (const a of [...this.assessments.values()]) if (a.userId === row.id) {
          for (const an of [...this.answers.values()]) if (an.assessmentId === a.id) this.answers.delete(an.id);
          for (const r of [...this.results.values()]) if (r.assessmentId === a.id) this.results.delete(r.id);
          this.assessments.delete(a.id);
        }
        for (const r of [...this.results.values()]) if (r.userId === row.id) this.results.delete(r.id);
        // cascade: drop the user's immutable safety evaluation history (FR-031).
        for (const e of [...this.safetyEvaluations.values()])
          if (e.userId === row.id) this.safetyEvaluations.delete(e.id);
        this.users.delete(row.id);
        count += 1;
      }
      return { count };
    },
  };

  readonly verificationToken = {
    deleteMany: async ({ where }: { where: WhereToken }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of [...this.vtokens.values()]) {
        if (where.userId !== undefined && row.userId !== where.userId) continue;
        if (where.consumedAt === null && row.consumedAt !== null) continue;
        this.vtokens.delete(row.id);
        count += 1;
      }
      return { count };
    },
    create: ({ data }: { data: Omit<VerificationTokenRow, 'id' | 'createdAt'> }): VerificationTokenRow => {
      const row: VerificationTokenRow = {
        id: randomUUID(),
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        consumedAt: data.consumedAt ?? null,
        createdAt: new Date(),
      };
      this.vtokens.set(row.id, row);
      return { ...row };
    },
    findFirst: ({ where }: { where: { userId: string; tokenHash: Uint8Array } }): VerificationTokenRow | null => {
      for (const row of this.vtokens.values()) {
        if (row.userId !== where.userId) continue;
        if (!bufEq(row.tokenHash, where.tokenHash)) continue;
        return { ...row };
      }
      return null;
    },
    update: ({ where, data }: { where: { id: string }; data: Partial<VerificationTokenRow> }): VerificationTokenRow => {
      const row = this.vtokens.get(where.id);
      if (!row) throw new Error('token not found');
      Object.assign(row, data);
      return { ...row };
    },
  };

  readonly refreshToken = {
    create: ({ data }: { data: Omit<RefreshTokenRow, 'id' | 'createdAt'> }): RefreshTokenRow => {
      const row: RefreshTokenRow = {
        id: randomUUID(),
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        revokedAt: data.revokedAt ?? null,
        createdAt: new Date(),
      };
      this.rtokens.set(row.id, row);
      return { ...row };
    },
    findFirst: ({ where }: { where: WhereRefresh }): RefreshTokenRow | null => {
      for (const row of this.rtokens.values()) {
        if (where.userId !== undefined && row.userId !== where.userId) continue;
        if (where.tokenHash && !bufEq(row.tokenHash, where.tokenHash)) continue;
        return { ...row };
      }
      return null;
    },
    update: ({ where, data }: { where: { id: string }; data: Partial<RefreshTokenRow> }): RefreshTokenRow => {
      const row = this.rtokens.get(where.id);
      if (!row) throw new Error('refresh not found');
      Object.assign(row, data);
      return { ...row };
    },
  };

  /** Expose stores for test assertions. */
  get userStore(): Map<string, UserAccountRow> { return this.users; }
  get tokenStore(): Map<string, VerificationTokenRow> { return this.vtokens; }
  get refreshStore(): Map<string, RefreshTokenRow> { return this.rtokens; }
  get noticeStore(): Map<string, NoticeVersionRow> { return this.notices; }
  get consentStore(): Map<string, ConsentRecordRow> { return this.consent; }
  get profileStore(): Map<string, ProfileRow> { return this.profiles; }
  get preferencesStore(): Map<string, PreferencesRow> { return this.prefs; }
  get onboardingStateStore(): Map<string, OnboardingStateRow> { return this.onboarding; }
  get assessmentDefinitionStore(): Map<string, AssessmentDefinitionRow> { return this.definitions; }
  get assessmentStore(): Map<string, AssessmentRow> { return this.assessments; }
  get assessmentAnswerStore(): Map<string, AssessmentAnswerRow> { return this.answers; }
  get assessmentResultStore(): Map<string, AssessmentResultRow> { return this.results; }
  get safetyEvaluationStore(): Map<string, SafetyEvaluationRow> { return this.safetyEvaluations; }
  get deletionLogStore(): Map<string, DeletionLogRow> { return this.deletionLogs; }

  readonly noticeVersionSet = {
    findFirst: ({
      where,
      orderBy,
    }: {
      where?: WhereNotice;
      orderBy?: { publishedAt: 'desc' | 'asc' };
    }): NoticeVersionRow | null => {
      let rows = [...this.notices.values()];
      if (where?.isActive !== undefined) rows = rows.filter((r) => r.isActive === where.isActive);
      if (orderBy?.publishedAt === 'desc') {
        rows.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
      } else if (orderBy?.publishedAt === 'asc') {
        rows.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
      }
      return rows[0] ? { ...rows[0] } : null;
    },
    create: ({ data }: { data: Partial<NoticeVersionRow> }): NoticeVersionRow => {
      const row: NoticeVersionRow = {
        id: data.id ?? randomUUID(),
        serviceBoundaryVersion: data.serviceBoundaryVersion!,
        termsVersion: data.termsVersion!,
        privacyNoticeVersion: data.privacyNoticeVersion!,
        boundaryTextEn: data.boundaryTextEn!,
        boundaryTextAr: data.boundaryTextAr!,
        termsLinkEn: data.termsLinkEn ?? '',
        termsLinkAr: data.termsLinkAr ?? '',
        privacyNoticeLinkEn: data.privacyNoticeLinkEn ?? '',
        privacyNoticeLinkAr: data.privacyNoticeLinkAr ?? '',
        publishedAt: data.publishedAt ?? new Date(),
        isActive: data.isActive ?? true,
      };
      this.notices.set(row.id, row);
      return { ...row };
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<NoticeVersionRow>;
    }): NoticeVersionRow => {
      const row = this.notices.get(where.id);
      if (!row) throw new Error('notice not found');
      Object.assign(row, data);
      return { ...row };
    },
  };

  readonly consentRecord = {
    findFirst: ({
      where,
      orderBy,
    }: {
      where: WhereConsent;
      orderBy?: { grantedAt: 'desc' | 'asc' };
    }): ConsentRecordRow | null => {
      let rows = [...this.consent.values()];
      if (where.userId !== undefined) {
        if (typeof where.userId === 'string') rows = rows.filter((r) => r.userId === where.userId);
        else rows = rows.filter((r) => where.userId!.in.includes(r.userId));
      }
      if (where.serviceBoundaryVersion !== undefined)
        rows = rows.filter((r) => r.serviceBoundaryVersion === where.serviceBoundaryVersion);
      if (where.termsVersion !== undefined) rows = rows.filter((r) => r.termsVersion === where.termsVersion);
      if (where.privacyNoticeVersion !== undefined)
        rows = rows.filter((r) => r.privacyNoticeVersion === where.privacyNoticeVersion);
      if (orderBy?.grantedAt === 'desc') {
        rows.sort(
          (a, b) =>
            b.grantedAt.getTime() - a.grantedAt.getTime() ||
            (this.consentOrder.get(b.id) ?? 0) - (this.consentOrder.get(a.id) ?? 0),
        );
      } else if (orderBy?.grantedAt === 'asc') {
        rows.sort(
          (a, b) =>
            a.grantedAt.getTime() - b.grantedAt.getTime() ||
            (this.consentOrder.get(a.id) ?? 0) - (this.consentOrder.get(b.id) ?? 0),
        );
      }
      return rows[0] ? { ...rows[0] } : null;
    },
    create: ({ data }: { data: Omit<ConsentRecordRow, 'id' | 'createdAt'> }): ConsentRecordRow => {
      const row: ConsentRecordRow = {
        id: randomUUID(),
        userId: data.userId,
        serviceBoundaryVersion: data.serviceBoundaryVersion,
        termsVersion: data.termsVersion,
        privacyNoticeVersion: data.privacyNoticeVersion,
        consentLanguageCode: data.consentLanguageCode,
        productChannelId: data.productChannelId,
        grantedAt: data.grantedAt ?? new Date(),
        createdAt: new Date(),
      };
      this.consentOrder.set(row.id, ++this.consentCounter);
      this.consent.set(row.id, row);
      return { ...row };
    },
    deleteMany: async ({ where }: { where: WhereConsent }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of [...this.consent.values()]) {
        if (where.userId !== undefined) {
          if (typeof where.userId === 'string') {
            if (row.userId !== where.userId) continue;
          } else if (!where.userId.in.includes(row.userId)) continue;
        }
        this.consent.delete(row.id);
        this.consentOrder.delete(row.id);
        count += 1;
      }
      return { count };
    },
  };

  /** Run a batch of Prisma operations sequentially (matches $transaction semantics).
   * Supports both the array form (`$transaction([p1, p2])`) and the interactive
   * callback form (`$transaction(async (tx) => ...)`); the callback receives this
   * same instance (no real isolation — sufficient for sequential unit tests). */
  $transaction = async <T>(
    arg: Promise<unknown>[] | ((tx: InMemoryPrisma) => Promise<T>),
  ): Promise<T> => {
    if (typeof arg === 'function') return arg(this);
    const out: unknown[] = [];
    for (const op of arg) out.push(await op);
    return out as unknown as T;
  };

  readonly profile = {
    findFirst: ({ where }: { where: WhereByUser }): ProfileRow | null => {
      const row = [...this.profiles.values()].find((r) => r.userId === where.userId);
      return row ? { ...row } : null;
    },
    create: ({ data }: { data: Omit<ProfileRow, 'id'> }): ProfileRow => {
      const now = new Date();
      const row: ProfileRow = {
        id: randomUUID(),
        userId: data.userId,
        createdAt: data.createdAt ?? now,
        updatedAt: data.updatedAt ?? now,
      };
      this.profiles.set(row.id, row);
      return { ...row };
    },
    update: ({ where, data }: { where: { id: string }; data: Partial<ProfileRow> }): ProfileRow => {
      const row = this.profiles.get(where.id);
      if (!row) throw new Error('profile not found');
      Object.assign(row, data);
      return { ...row };
    },
    deleteMany: async ({ where }: { where: WhereByUser }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of [...this.profiles.values()]) {
        if (where.userId !== undefined) {
          if (typeof where.userId === 'string') {
            if (row.userId !== where.userId) continue;
          } else if (!where.userId.in.includes(row.userId)) continue;
        }
        this.profiles.delete(row.id);
        count += 1;
      }
      return { count };
    },
  };

  readonly preferences = {
    findFirst: ({ where }: { where: WhereByUser }): PreferencesRow | null => {
      const row = [...this.prefs.values()].find((r) => r.userId === where.userId);
      return row ? { ...row } : null;
    },
    create: ({ data }: { data: Omit<PreferencesRow, 'id'> }): PreferencesRow => {
      const row: PreferencesRow = {
        id: randomUUID(),
        userId: data.userId,
        languageCode: data.languageCode,
        timezone: data.timezone ?? null,
        updatedAt: data.updatedAt ?? new Date(),
      };
      this.prefs.set(row.id, row);
      return { ...row };
    },
    update: ({ where, data }: { where: { id: string }; data: Partial<PreferencesRow> }): PreferencesRow => {
      const row = this.prefs.get(where.id);
      if (!row) throw new Error('preferences not found');
      Object.assign(row, data);
      return { ...row };
    },
    deleteMany: async ({ where }: { where: WhereByUser }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of [...this.prefs.values()]) {
        if (where.userId !== undefined) {
          if (typeof where.userId === 'string') {
            if (row.userId !== where.userId) continue;
          } else if (!where.userId.in.includes(row.userId)) continue;
        }
        this.prefs.delete(row.id);
        count += 1;
      }
      return { count };
    },
  };

  readonly onboardingState = {
    findFirst: ({ where }: { where: WhereOnboardingState }): OnboardingStateRow | null => {
      let rows = [...this.onboarding.values()];
      if (where.userId !== undefined) {
        if (typeof where.userId === 'string') rows = rows.filter((r) => r.userId === where.userId);
        else rows = rows.filter((r) => where.userId!.in.includes(r.userId));
      }
      if (where.lastActivityAt) rows = rows.filter((r) => r.lastActivityAt < where.lastActivityAt!.lt);
      if (where.state) rows = rows.filter((r) => where.state!.in.includes(r.state));
      return rows[0] ? { ...rows[0] } : null;
    },
    create: ({ data }: { data: Omit<OnboardingStateRow, 'id'> }): OnboardingStateRow => {
      const now = new Date();
      const row: OnboardingStateRow = {
        id: randomUUID(),
        userId: data.userId,
        state: data.state ?? 'NOT_STARTED',
        currentStep: data.currentStep ?? null,
        updatedAt: data.updatedAt ?? now,
        lastActivityAt: data.lastActivityAt ?? now,
      };
      this.onboarding.set(row.id, row);
      return { ...row };
    },
    update: ({
      where,
      data,
    }: { where: { id: string }; data: Partial<OnboardingStateRow> }): OnboardingStateRow => {
      const row = this.onboarding.get(where.id);
      if (!row) throw new Error('onboarding state not found');
      Object.assign(row, data);
      return { ...row };
    },
    deleteMany: async ({ where }: { where: WhereOnboardingState }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of [...this.onboarding.values()]) {
        if (where.userId !== undefined) {
          if (typeof where.userId === 'string') {
            if (row.userId !== where.userId) continue;
          } else if (!where.userId.in.includes(row.userId)) continue;
        }
        if (where.lastActivityAt && !(row.lastActivityAt < where.lastActivityAt.lt)) continue;
        if (where.state && !where.state.in.includes(row.state)) continue;
        this.onboarding.delete(row.id);
        count += 1;
      }
      return { count };
    },
  };

  reset(): void {
    this.users.clear();
    this.vtokens.clear();
    this.rtokens.clear();
    this.notices.clear();
    this.consent.clear();
    this.consentOrder.clear();
    this.consentCounter = 0;
    this.profiles.clear();
    this.prefs.clear();
    this.onboarding.clear();
    this.definitions.clear();
    this.assessments.clear();
    this.answers.clear();
    this.results.clear();
    this.safetyEvaluations.clear();
    this.deletionLogs.clear();
  }

  readonly assessmentDefinition = {
    findFirst: ({ where }: { where: WhereDefinition }): AssessmentDefinitionRow | null => {
      let rows = [...this.definitions.values()];
      if (where?.version !== undefined) rows = rows.filter((r) => r.version === where.version);
      if (where?.isActive !== undefined) rows = rows.filter((r) => r.isActive === where.isActive);
      return rows[0] ? { ...rows[0] } : null;
    },
    create: ({ data }: { data: Partial<AssessmentDefinitionRow> }): AssessmentDefinitionRow => {
      const row: AssessmentDefinitionRow = {
        id: data.id ?? randomUUID(),
        version: data.version!,
        isActive: data.isActive ?? true,
        content: data.content,
        publishedAt: data.publishedAt ?? new Date(),
      };
      this.definitions.set(row.id, row);
      return { ...row };
    },
  };

  readonly assessment = {
    findFirst: ({ where }: { where: WhereAssessment }): AssessmentRow | null => {
      let rows = [...this.assessments.values()];
      if (where.userId !== undefined) {
        if (typeof where.userId === 'string') rows = rows.filter((r) => r.userId === where.userId);
        else rows = rows.filter((r) => where.userId!.in.includes(r.userId));
      }
      if (where.lastActivityAt) rows = rows.filter((r) => r.lastActivityAt < where.lastActivityAt!.lt);
      if (where.state) rows = rows.filter((r) => where.state!.in.includes(r.state));
      return rows[0] ? { ...rows[0] } : null;
    },
    findMany: ({ where }: { where: WhereAssessment }): AssessmentRow[] => {
      let rows = [...this.assessments.values()];
      if (where.userId !== undefined) {
        if (typeof where.userId === 'string') rows = rows.filter((r) => r.userId === where.userId);
        else rows = rows.filter((r) => where.userId!.in.includes(r.userId));
      }
      if (where.lastActivityAt) rows = rows.filter((r) => r.lastActivityAt < where.lastActivityAt!.lt);
      if (where.state) rows = rows.filter((r) => where.state!.in.includes(r.state));
      return rows.map((r) => ({ ...r }));
    },
    create: ({ data }: { data: Omit<AssessmentRow, 'id' | 'createdAt'> }): AssessmentRow => {
      const now = new Date();
      const row: AssessmentRow = {
        id: randomUUID(),
        userId: data.userId,
        definitionVersion: data.definitionVersion,
        state: data.state ?? 'NOT_STARTED',
        startedAt: data.startedAt ?? null,
        submittedAt: data.submittedAt ?? null,
        lastActivityAt: data.lastActivityAt ?? now,
        createdAt: now,
      };
      this.assessments.set(row.id, row);
      return { ...row };
    },
    update: ({
      where,
      data,
    }: { where: { id: string }; data: Partial<AssessmentRow> }): AssessmentRow => {
      const row = this.assessments.get(where.id);
      if (!row) throw new Error('assessment not found');
      Object.assign(row, data);
      return { ...row };
    },
    /** Conditional update: only applies when the current state is in `state.in`.
     * Returns count (0 = someone else already transitioned → idempotent guard). */
    updateMany: ({
      where,
      data,
    }: {
      where: { id: string; state?: { in: AssessmentStateValue[] } };
      data: Partial<AssessmentRow>;
    }): { count: number } => {
      const row = this.assessments.get(where.id);
      if (!row) return { count: 0 };
      if (where.state && !where.state.in.includes(row.state)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
    deleteMany: async ({ where }: { where: WhereAssessment }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of [...this.assessments.values()]) {
        if (where.userId !== undefined) {
          if (typeof where.userId === 'string') {
            if (row.userId !== where.userId) continue;
          } else if (!where.userId.in.includes(row.userId)) continue;
        }
        if (where.lastActivityAt && !(row.lastActivityAt < where.lastActivityAt.lt)) continue;
        if (where.state && !where.state.in.includes(row.state)) continue;
        // cascade: drop the assessment's answers + result
        for (const a of [...this.answers.values()]) if (a.assessmentId === row.id) this.answers.delete(a.id);
        for (const r of [...this.results.values()]) if (r.assessmentId === row.id) this.results.delete(r.id);
        this.assessments.delete(row.id);
        count += 1;
      }
      return { count };
    },
  };

  readonly assessmentAnswer = {
    findFirst: ({
      where,
    }: { where: { assessmentId: string; questionId: string } }): AssessmentAnswerRow | null => {
      const row = [...this.answers.values()].find(
        (r) => r.assessmentId === where.assessmentId && r.questionId === where.questionId,
      );
      return row ? { ...row } : null;
    },
    findMany: ({ where }: { where: WhereAssessmentAnswer }): AssessmentAnswerRow[] => {
      let rows = [...this.answers.values()];
      if (where.assessmentId !== undefined) {
        if (typeof where.assessmentId === 'string')
          rows = rows.filter((r) => r.assessmentId === where.assessmentId);
        else rows = rows.filter((r) => where.assessmentId!.in.includes(r.assessmentId));
      }
      return rows.map((r) => ({ ...r }));
    },
    create: ({ data }: { data: Omit<AssessmentAnswerRow, 'id' | 'updatedAt'> }): AssessmentAnswerRow => {
      const row: AssessmentAnswerRow = {
        id: randomUUID(),
        assessmentId: data.assessmentId,
        questionId: data.questionId,
        questionKind: data.questionKind,
        value: data.value,
        updatedAt: new Date(),
      };
      this.answers.set(row.id, row);
      return { ...row };
    },
    update: ({
      where,
      data,
    }: { where: { id: string }; data: Partial<AssessmentAnswerRow> }): AssessmentAnswerRow => {
      const row = this.answers.get(where.id);
      if (!row) throw new Error('answer not found');
      Object.assign(row, data);
      return { ...row };
    },
    deleteMany: async ({ where }: { where: WhereAssessmentAnswer }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of [...this.answers.values()]) {
        if (where.assessmentId !== undefined) {
          if (typeof where.assessmentId === 'string') {
            if (row.assessmentId !== where.assessmentId) continue;
          } else if (!where.assessmentId.in.includes(row.assessmentId)) continue;
        }
        this.answers.delete(row.id);
        count += 1;
      }
      return { count };
    },
  };

  readonly assessmentResult = {
    findFirst: ({
      where,
    }: { where: { assessmentId?: string; userId?: string } }): AssessmentResultRow | null => {
      let rows = [...this.results.values()];
      if (where.assessmentId !== undefined)
        rows = rows.filter((r) => r.assessmentId === where.assessmentId);
      if (where.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId);
      return rows[0] ? { ...rows[0] } : null;
    },
    create: ({ data }: { data: Omit<AssessmentResultRow, 'id' | 'createdAt'> }): AssessmentResultRow => {
      const row: AssessmentResultRow = {
        id: randomUUID(),
        assessmentId: data.assessmentId,
        userId: data.userId,
        definitionVersion: data.definitionVersion,
        domainScores: data.domainScores,
        strongestDomain: data.strongestDomain,
        supportDomain: data.supportDomain,
        selectedPriorities: data.selectedPriorities,
        // Coerce Prisma's JSON-null sentinels (Prisma.JsonNull / Prisma.DbNull) to
        // JS null so reads return null rather than the sentinel object. Real Prisma
        // returns null for a NULL column; the mock mirrors that.
        goalFreeText: isJsonNullSentinel(data.goalFreeText) ? null : (data.goalFreeText ?? null),
        safetyEvaluationId: data.safetyEvaluationId ?? null,
        createdAt: new Date(),
      };
      this.results.set(row.id, row);
      return { ...row };
    },
  };

  readonly safetyEvaluation = {
    /** Find the first matching row, optionally ordered by evaluatedAt. With
     * `orderBy: { evaluatedAt: 'desc' }` this returns the latest evaluation
     * (the current-routing row when `isCurrent` is also filtered). */
    findFirst: ({
      where,
      orderBy,
    }: {
      where: WhereSafetyEvaluation;
      orderBy?: OrderByEvaluatedAt;
    }): SafetyEvaluationRow | null => {
      let rows = [...this.safetyEvaluations.values()];
      if (where.userId !== undefined) {
        if (typeof where.userId === 'string') rows = rows.filter((r) => r.userId === where.userId);
        else rows = rows.filter((r) => where.userId!.in.includes(r.userId));
      }
      if (where.assessmentId !== undefined) {
        if (typeof where.assessmentId === 'string')
          rows = rows.filter((r) => r.assessmentId === where.assessmentId);
        else rows = rows.filter((r) => where.assessmentId!.in.includes(r.assessmentId));
      }
      if (where.isCurrent !== undefined) rows = rows.filter((r) => r.isCurrent === where.isCurrent);
      if (orderBy?.evaluatedAt === 'desc')
        rows.sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime());
      else if (orderBy?.evaluatedAt === 'asc')
        rows.sort((a, b) => a.evaluatedAt.getTime() - b.evaluatedAt.getTime());
      return rows[0] ? { ...rows[0] } : null;
    },
    findMany: ({
      where,
      orderBy,
    }: {
      where: WhereSafetyEvaluation;
      orderBy?: OrderByEvaluatedAt;
    }): SafetyEvaluationRow[] => {
      let rows = [...this.safetyEvaluations.values()];
      if (where.userId !== undefined) {
        if (typeof where.userId === 'string') rows = rows.filter((r) => r.userId === where.userId);
        else rows = rows.filter((r) => where.userId!.in.includes(r.userId));
      }
      if (where.assessmentId !== undefined) {
        if (typeof where.assessmentId === 'string')
          rows = rows.filter((r) => r.assessmentId === where.assessmentId);
        else rows = rows.filter((r) => where.assessmentId!.in.includes(r.assessmentId));
      }
      if (where.isCurrent !== undefined) rows = rows.filter((r) => r.isCurrent === where.isCurrent);
      if (orderBy?.evaluatedAt === 'desc')
        rows.sort((a, b) => b.evaluatedAt.getTime() - a.evaluatedAt.getTime());
      else if (orderBy?.evaluatedAt === 'asc')
        rows.sort((a, b) => a.evaluatedAt.getTime() - b.evaluatedAt.getTime());
      return rows.map((r) => ({ ...r }));
    },
    /** Append-only: a new evaluation row (is_current defaults false; the service
     * flips the prior current row + this one in a transaction). The row is never
     * updated except for the `isCurrent` flag. */
    create: ({ data }: { data: Omit<SafetyEvaluationRow, 'id' | 'createdAt'> }): SafetyEvaluationRow => {
      const now = new Date();
      const row: SafetyEvaluationRow = {
        id: data.id ?? randomUUID(),
        userId: data.userId,
        assessmentId: data.assessmentId ?? null,
        definitionVersion: data.definitionVersion,
        level: data.level,
        reasons: data.reasons,
        triggerContext: data.triggerContext,
        isCurrent: data.isCurrent ?? false,
        evaluatedAt: data.evaluatedAt ?? now,
        createdAt: now,
      };
      this.safetyEvaluations.set(row.id, row);
      return { ...row };
    },
    /** Only the `isCurrent` flag (and no other field) is ever updated (FR-031). */
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<SafetyEvaluationRow>;
    }): SafetyEvaluationRow => {
      const row = this.safetyEvaluations.get(where.id);
      if (!row) throw new Error('safety evaluation not found');
      Object.assign(row, data);
      return { ...row };
    },
    /** Used by SafetyDeletionPort (account/assessment deletion). History is
     * immutable until deletion (FR-031). */
    deleteMany: async ({ where }: { where: WhereSafetyEvaluation }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of [...this.safetyEvaluations.values()]) {
        if (where.userId !== undefined) {
          if (typeof where.userId === 'string') {
            if (row.userId !== where.userId) continue;
          } else if (!where.userId.in.includes(row.userId)) continue;
        }
        if (where.assessmentId !== undefined) {
          if (typeof where.assessmentId === 'string') {
            if (row.assessmentId !== where.assessmentId) continue;
          } else if (!where.assessmentId.in.includes(row.assessmentId)) continue;
        }
        if (where.isCurrent !== undefined && row.isCurrent !== where.isCurrent) continue;
        this.safetyEvaluations.delete(row.id);
        count += 1;
      }
      return { count };
    },
  };

  /** DeletionLog (Retention — platform, data-model §13). Sanitized counters only.
   * The RetentionModule + AccountDeletionService write one row per run; tests assert
   * the row carries only counters + a non-sensitive confirmation id. */
  readonly deletionLog = {
    create: ({ data }: { data: Omit<DeletionLogRow, 'id' | 'createdAt'> }): DeletionLogRow => {
      const row: DeletionLogRow = {
        id: randomUUID(),
        runKind: data.runKind,
        windowStart: data.windowStart,
        windowEnd: data.windowEnd,
        categoryCounts: data.categoryCounts,
        errorSummary: data.errorSummary ?? null,
        status: data.status,
        confirmationId: data.confirmationId,
        createdAt: new Date(),
      };
      this.deletionLogs.set(row.id, row);
      return { ...row };
    },
    findMany: ({ where }: { where?: { runKind?: RunKind } } = {}): DeletionLogRow[] => {
      let rows = [...this.deletionLogs.values()];
      if (where?.runKind !== undefined) rows = rows.filter((r) => r.runKind === where.runKind);
      return rows.map((r) => ({ ...r }));
    },
    deleteMany: async ({ where }: { where?: { runKind?: RunKind } } = {}): Promise<{ count: number }> => {
      let count = 0;
      for (const row of [...this.deletionLogs.values()]) {
        if (where?.runKind !== undefined && row.runKind !== where.runKind) continue;
        this.deletionLogs.delete(row.id);
        count += 1;
      }
      return { count };
    },
  };
}