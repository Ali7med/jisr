import type {
  Capability,
  Command,
  Device,
  HistoryPoint,
  IntegrationInfo,
  StateValue,
} from '@jisr/shared';

/**
 * عقد التكامل مع شركة واحدة.
 *
 * **هذا هو محور المشروع.** كل شركة — Tuya، ShineMonitor، Tasmota — تُنفَّذ
 * كملف واحد يحقّق هذه الواجهة، ولا شيء فوقها يعرف اسم الشركة: المسارات
 * والخدمات تتعامل مع [Integration] فقط (القاعدة الحاكمة 7).
 *
 * **مسؤولية المنفِّذ:**
 * 1. التحدّث ببروتوكول الشركة (HTTP، MQTT، UDP…).
 * 2. **الترجمة** إلى نماذج العقد المشترك: `Device` و`Capability` و`StateValue`.
 * 3. رمي `IntegrationError` برسائل عربية جاهزة للعرض.
 *
 * **ما لا يفعله:** لا يعرف HTTP الخاص بنا، ولا يلمس قاعدة البيانات،
 * ولا يقرّر متى يُحدَّث (ذلك لخدمة المزامنة).
 */
export interface Integration {
  /** بطاقة التعريف — منها يُبنى نموذج ربط الحساب في الويب. */
  readonly info: IntegrationInfo;

  /** يتحقّق من الاعتمادات ويهيّئ الاتصال. يرمي شارحاً السبب والحل. */
  verify(): Promise<void>;

  /** كل أجهزة هذا الحساب، مترجَمة إلى نماذج العقد. */
  fetchDevices(): Promise<Device[]>;

  /**
   * قدرات جهاز واحد — ما يمكن قراءته والتحكّم به.
   * `nativeId` هو معرّف الشركة، لا `Device.id` المركّب.
   */
  fetchCapabilities(nativeId: string): Promise<Capability[]>;

  /** القيم الحالية لجهاز. */
  fetchState(nativeId: string): Promise<StateValue[]>;

  /** تنفيذ أوامر تحكّم. */
  execute(nativeId: string, commands: readonly Command[]): Promise<void>;

  /**
   * سجلّ تاريخي لقراءات محدّدة.
   * تكامل لا يدعمه (`supportsHistory: false`) يُرجع قائمة فارغة بدل أن يرمي.
   */
  fetchHistory(nativeId: string, query: HistoryQuery): Promise<HistoryPoint[]>;

  /** يُغلق الموارد (اتصالات، مؤقّتات). */
  dispose(): void;
}

export interface HistoryQuery {
  readonly keys: readonly string[];
  readonly start: Date;
  readonly end: Date;
  readonly limit: number;
}

/**
 * ما يحتاجه التكامل ليعمل: هويّة الحساب واعتماداته **بعد فكّ التشفير**.
 * فكّ التشفير مسؤولية الطبقة التي تقرأ من القاعدة، لا التكامل.
 */
export interface IntegrationContext {
  readonly accountId: string;
  readonly credentials: Readonly<Record<string, string>>;
}

/** دالة تُنشئ تكاملاً من سياق حساب — تُسجَّل في سجلّ التكاملات. */
export type IntegrationFactory = (context: IntegrationContext) => Integration;

/** سطر واحد في السجلّ: بطاقة تعريف + مصنع. */
export interface IntegrationEntry {
  readonly info: IntegrationInfo;
  readonly create: IntegrationFactory;
}
