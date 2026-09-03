import type { AccountStatus, Capability } from '@jisr/shared';

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

export interface DeviceRepository {
  listByUser(userId: string): Promise<DeviceRecord[]>;
  listByAccount(accountId: string): Promise<DeviceRecord[]>;
  /**
   * يحلّ معرّف العقد المركّب لمستخدم بعينه. جهاز واحد قد يظهر عبر
   * حسابين لنفس المستخدم (مشروع Tuya مربوط مرّتين) — نرجّح الأقدم كي
   * يبقى الحلّ حتمياً بدل عشوائي.
   */
  findOwned(
    userId: string,
    integrationId: string,
    nativeId: string,
  ): Promise<{ device: DeviceRecord; account: AccountRecord } | null>;
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
