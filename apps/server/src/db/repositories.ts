import type {
  AccountStatus,
  AutomationAction,
  AutomationCondition,
  AutomationTrigger,
  Capability,
  MemberRole,
  NotifySeverity,
  SceneStep,
} from '@jisr/shared';

/** Prisma يمثّل حقول `Bytes` بـ Uint8Array مدعوم بـ ArrayBuffer تحديداً. */
export type Bytes = Uint8Array<ArrayBuffer>;

/**
 * عقود الوصول للبيانات.
 *
 * الغرض ليس التجريد لذاته: هو أن يبقى منطق المصادقة قابلاً للاختبار بلا
 * قاعدة بيانات حيّة، وأن يظلّ استبدال التخزين لاحقاً تغييراً موضعياً.
 */

export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly createdAt: Date;
}

export interface RefreshTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: {
    email: string;
    passwordHash: string;
    displayName: string;
  }): Promise<UserRecord>;
}

export interface RefreshTokenRepository {
  create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findValidByHash(tokenHash: string, now: Date): Promise<RefreshTokenRecord | null>;
  revokeByHash(tokenHash: string, now: Date): Promise<void>;
  revokeAllForUser(userId: string, now: Date): Promise<void>;
}

export interface Repositories {
  /** فحص جاهزية التخزين — يرمي إن تعذّر الوصول. يقرؤه `/health/ready`. */
  ping(): Promise<void>;
  readonly users: UserRepository;
  readonly refreshTokens: RefreshTokenRepository;
  readonly accounts: AccountRepository;
  readonly automations: AutomationRepository;
  readonly scenes: SceneRepository;
  readonly notifications: NotificationRepository;
  readonly memberships: MembershipRepository;
  readonly invitations: InvitationRepository;
  readonly activity: ActivityRepository;
  readonly devices: DeviceRepository;
  readonly history: StateHistoryRepository;
}

/** حساب مربوط كما يُخزَّن — الأسرار مشفّرة، ولا تُفكّ إلا عند الاستعمال. */
export interface AccountRecord {
  readonly id: string;
  readonly userId: string;
  readonly integrationId: string;
  readonly label: string;
  readonly status: AccountStatus;
  readonly secretsCipher: Bytes;
  readonly secretsIv: Bytes;
  readonly secretsTag: Bytes;
  readonly keyVersion: number;
  readonly credentialsExpireAt: Date | null;
  readonly lastCheckedAt: Date | null;
  readonly createdAt: Date;
}

export interface AccountCreateInput {
  readonly userId: string;
  readonly integrationId: string;
  readonly label: string;
  readonly secretsCipher: Bytes;
  readonly secretsIv: Bytes;
  readonly secretsTag: Bytes;
  readonly keyVersion: number;
}

export interface AccountPatch {
  readonly label?: string;
  readonly status?: AccountStatus;
  readonly secretsCipher?: Bytes;
  readonly secretsIv?: Bytes;
  readonly secretsTag?: Bytes;
  readonly keyVersion?: number;
  readonly credentialsExpireAt?: Date | null;
  readonly lastCheckedAt?: Date | null;
}

export interface AccountRepository {
  listByUser(userId: string): Promise<AccountRecord[]>;
  /** كل الحسابات العاملة عبر كل المستخدمين — للمهامّ الخلفية. */
  listActive(): Promise<AccountRecord[]>;
  /** يقيّد بالمالك دائماً: حساب مستخدم آخر «غير موجود» لا «ممنوع». */
  findOwned(userId: string, accountId: string): Promise<AccountRecord | null>;
  create(input: AccountCreateInput): Promise<AccountRecord>;
  update(accountId: string, patch: AccountPatch): Promise<AccountRecord>;
  remove(accountId: string): Promise<void>;
  countDevices(accountIds: readonly string[]): Promise<ReadonlyMap<string, number>>;
}

/** جهاز كما يُخزَّن — `id` مفتاح داخلي، والعقد يعرض `integrationId:nativeId`. */
export interface DeviceRecord {
  readonly id: string;
  readonly accountId: string;
  readonly integrationId: string;
  readonly nativeId: string;
  readonly name: string;
  readonly category: string;
  readonly online: boolean;
  readonly model: string;
  readonly productName: string;
  readonly iconUrl: string | null;
  readonly room: string | null;
  readonly isSubDevice: boolean;
  readonly capabilities: Capability[];
  readonly lastSeenAt: Date | null;
}

export interface DeviceUpsertInput {
  readonly nativeId: string;
  readonly integrationId: string;
  readonly name: string;
  readonly category: string;
  readonly online: boolean;
  readonly model: string;
  readonly productName: string;
  readonly iconUrl: string | null;
  readonly room: string | null;
  readonly isSubDevice: boolean;
}

export interface SyncOutcome {
  readonly total: number;
  readonly added: number;
  readonly removed: number;
}

/**
 * ما يملكه المستخدم من صلاحية على جهاز يراه.
 *
 * التمييز بين «لا يراه» و«يراه ولا يتحكّم» مقصود: الأول 404 والثاني 403.
 * إخفاء وجود جهاز يراه العضو أصلاً لا يحمي شيئاً ويربكه فقط.
 */
export interface DeviceAccess {
  readonly device: DeviceRecord;
  readonly account: AccountRecord;
  /** مالك المساحة التي يعيش فيها الجهاز — إليه يُنسب سجلّ النشاط. */
  readonly ownerId: string;
  readonly isOwner: boolean;
  readonly canControl: boolean;
}

export interface DeviceRepository {
  /**
   * كل ما **يراه** المستخدم: أجهزة مساحته، وأجهزة مساحات غيره التي
   * مُنح إذناً عليها صراحةً. المنع هو الأصل (P6).
   */
  listVisible(userId: string): Promise<DeviceRecord[]>;
  listByAccount(accountId: string): Promise<DeviceRecord[]>;
  /**
   * يحلّ معرّف العقد المركّب لمستخدم بعينه، مع صلاحيته عليه. جهاز واحد
   * قد يظهر عبر حسابين لنفس المالك (مشروع Tuya مربوط مرّتين) — نرجّح
   * الأقدم كي يبقى الحلّ حتمياً بدل عشوائي.
   */
  findVisible(
    userId: string,
    integrationId: string,
    nativeId: string,
  ): Promise<DeviceAccess | null>;
  /** يُسقط ما لم يعد لدى الشركة ويضيف الجديد — نتيجة المزامنة الكاملة. */
  replaceForAccount(accountId: string, devices: readonly DeviceUpsertInput[]): Promise<SyncOutcome>;
  saveCapabilities(deviceId: string, capabilities: readonly Capability[]): Promise<void>;
}

export interface HistoryRow {
  readonly key: string;
  readonly value: number;
  readonly recordedAt: Date;
}

export interface HistoryQueryInput {
  readonly deviceId: string;
  readonly keys: readonly string[];
  readonly start: Date;
  readonly end: Date;
  readonly limit: number;
}

/** قراءة واحدة تُكتب في السلسلة الزمنية. */
export interface HistoryWrite {
  readonly deviceId: string;
  readonly key: string;
  /** العدد للرسوم البيانية. */
  readonly value: number | null;
  /** ما ليس عدداً — يُحفظ خاماً ولا يُهمل (القاعدة الحاكمة 3). */
  readonly rawValue: unknown;
  readonly recordedAt: Date;
}

export interface StateHistoryRepository {
  list(query: HistoryQueryInput): Promise<HistoryRow[]>;
  record(rows: readonly HistoryWrite[]): Promise<void>;
  /** سياسة الاستبقاء من اليوم الأول — ADR-0013. يُرجع عدد الصفوف المحذوفة. */
  prune(olderThan: Date): Promise<number>;
}

// ── الأتمتة والمشاهد والإشعارات (ADR-0015) ──────────────────────────────────

export interface AutomationRecord {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly trigger: AutomationTrigger;
  readonly conditions: AutomationCondition[];
  readonly actions: AutomationAction[];
  readonly lastRunAt: Date | null;
  readonly createdAt: Date;
}

export interface AutomationInputRecord {
  readonly name: string;
  readonly enabled: boolean;
  readonly trigger: AutomationTrigger;
  readonly conditions: AutomationCondition[];
  readonly actions: AutomationAction[];
}

export interface AutomationRunRecord {
  readonly succeeded: boolean;
  readonly detail: string;
  readonly ranAt: Date;
}

export interface AutomationRepository {
  listByUser(userId: string): Promise<AutomationRecord[]>;
  /** كل المفعّلة عبر كل المستخدمين — يقرؤها المحرّك. */
  listEnabled(): Promise<AutomationRecord[]>;
  findOwned(userId: string, id: string): Promise<AutomationRecord | null>;
  create(userId: string, input: AutomationInputRecord): Promise<AutomationRecord>;
  update(id: string, input: AutomationInputRecord): Promise<AutomationRecord>;
  remove(id: string): Promise<void>;
  markRun(id: string, ranAt: Date): Promise<void>;
  recordRun(id: string, run: { succeeded: boolean; detail: string; ranAt: Date }): Promise<void>;
  listRuns(id: string, limit: number): Promise<AutomationRunRecord[]>;
}

export interface SceneRecord {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly icon: string;
  readonly steps: SceneStep[];
  readonly createdAt: Date;
}

export interface SceneRepository {
  listByUser(userId: string): Promise<SceneRecord[]>;
  findOwned(userId: string, id: string): Promise<SceneRecord | null>;
  /** يقرؤه المحرّك حين يكون المشهد إجراءً في أتمتة. */
  findById(id: string): Promise<SceneRecord | null>;
  create(userId: string, input: { name: string; icon: string; steps: SceneStep[] }): Promise<SceneRecord>;
  remove(id: string): Promise<void>;
}

export interface NotificationRecord {
  readonly id: string;
  readonly userId: string;
  readonly title: string;
  readonly body: string;
  readonly severity: NotifySeverity;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export interface NotificationRepository {
  listByUser(userId: string, limit: number): Promise<NotificationRecord[]>;
  create(input: {
    userId: string;
    title: string;
    body: string;
    severity: NotifySeverity;
  }): Promise<NotificationRecord>;
  markAllRead(userId: string, at: Date): Promise<void>;
}

// ── العائلة والصلاحيات (P6) ─────────────────────────────────────────────────

export interface MembershipRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly memberId: string;
  readonly memberEmail: string;
  readonly memberName: string;
  readonly label: string;
  readonly role: MemberRole;
  readonly createdAt: Date;
  readonly permissions: readonly {
    deviceId: string;
    deviceName: string;
    canControl: boolean;
  }[];
}

export interface MembershipRepository {
  listForOwner(ownerId: string): Promise<MembershipRecord[]>;
  find(ownerId: string, membershipId: string): Promise<MembershipRecord | null>;
  create(input: { ownerId: string; memberId: string; label: string }): Promise<MembershipRecord>;
  remove(membershipId: string): Promise<void>;
  /** يستبدل قائمة الأذونات كلها — «اضبط» أوضح من «أضف/احذف». */
  setPermissions(
    membershipId: string,
    permissions: readonly { deviceId: string; canControl: boolean }[],
  ): Promise<void>;
}

export interface InvitationRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly email: string;
  readonly label: string;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly createdAt: Date;
}

export interface InvitationRepository {
  listForOwner(ownerId: string): Promise<InvitationRecord[]>;
  create(input: {
    ownerId: string;
    email: string;
    label: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<InvitationRecord>;
  findValidByHash(tokenHash: string, now: Date): Promise<InvitationRecord | null>;
  markAccepted(id: string, at: Date): Promise<void>;
  remove(ownerId: string, id: string): Promise<void>;
}

export interface ActivityRecord {
  readonly actorName: string;
  readonly action: string;
  readonly detail: string;
  readonly deviceId: string | null;
  readonly at: Date;
}

export interface ActivityRepository {
  record(input: {
    ownerId: string;
    actorId: string;
    deviceId?: string;
    action: string;
    detail: string;
  }): Promise<void>;
  listForOwner(ownerId: string, limit: number): Promise<ActivityRecord[]>;
}
