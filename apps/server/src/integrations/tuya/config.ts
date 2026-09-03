import type { IntegrationInfo } from '@jisr/shared';

/**
 * مراكز بيانات Tuya.
 *
 * اختيار المركز الخاطئ هو أشيع سبب لخطأ `1106 permission deny`.
 * كائن ثابت لا `enum`: Node يشغّل TypeScript بحذف الأنواع فقط، فلا
 * تُدعم الـ enums (ADR-0008).
 */
export interface TuyaDataCenter {
  readonly host: string;
  readonly imageHost: string;
  readonly labelAr: string;
}

export const TUYA_DATA_CENTERS: readonly TuyaDataCenter[] = [
  { host: 'openapi.tuyaeu.com', imageHost: 'images.tuyaeu.com', labelAr: 'أوروبا الوسطى' },
  { host: 'openapi-weaz.tuyaeu.com', imageHost: 'images.tuyaeu.com', labelAr: 'أوروبا الغربية' },
  { host: 'openapi.tuyaus.com', imageHost: 'images.tuyaus.com', labelAr: 'أمريكا الغربية' },
  { host: 'openapi-ueaz.tuyaus.com', imageHost: 'images.tuyaus.com', labelAr: 'أمريكا الشرقية' },
  { host: 'openapi.tuyacn.com', imageHost: 'images.tuyacn.com', labelAr: 'الصين' },
  { host: 'openapi.tuyain.com', imageHost: 'images.tuyain.com', labelAr: 'الهند' },
];

const DEFAULT_DATA_CENTER: TuyaDataCenter = TUYA_DATA_CENTERS[0] as TuyaDataCenter;

/** مركز غير معروف يعود للافتراضي بدل أن يُسقط الحساب. */
export function dataCenterFromHost(host: string | undefined): TuyaDataCenter {
  return TUYA_DATA_CENTERS.find((dc) => dc.host === host) ?? DEFAULT_DATA_CENTER;
}

export function baseUrlOf(dataCenter: TuyaDataCenter): string {
  return `https://${dataCenter.host}`;
}

/** يحوّل مسار الأيقونة النسبي من Tuya إلى رابط كامل. */
export function iconUrlOf(dataCenter: TuyaDataCenter, icon: string | undefined): string | undefined {
  if (!icon) return undefined;
  if (icon.startsWith('http')) return icon;
  return `https://${dataCenter.imageHost}/${icon.startsWith('/') ? icon.slice(1) : icon}`;
}

/** معرّف التكامل — يدخل في معرّفات الأجهزة (`tuya:abc`).
 * **تغييره يُبطل كل الحسابات المحفوظة.** */
export const TUYA_ID = 'tuya';

// مفاتيح حقول الاعتماد.
export const TUYA_KEY_ACCESS_ID = 'accessId';
export const TUYA_KEY_ACCESS_SECRET = 'accessSecret';
export const TUYA_KEY_UID = 'uid';
export const TUYA_KEY_HOST = 'host';

/** بطاقة التعريف — منها يُبنى نموذج ربط الحساب بلا كود مخصّص. */
export const TUYA_INFO: IntegrationInfo = {
  id: TUYA_ID,
  nameAr: 'تويا / Smart Life',
  nameEn: 'Tuya / Smart Life',
  description:
    'يغطّي آلاف الأجهزة التي تعمل بتطبيق Smart Life أو Tuya Smart: ' +
    'مفاتيح، مقابس، إضاءة، حساسات، عدّادات طاقة، وأجهزة أشعة تحت حمراء.',
  setupUrl: 'https://iot.tuya.com',
  supportsHistory: true,
  supportsPairing: false,
  fields: [
    {
      key: TUYA_KEY_ACCESS_ID,
      label: 'Access ID',
      type: 'text',
      hint: 'من صفحة Overview في مشروعك على iot.tuya.com',
      options: [],
      required: true,
    },
    {
      key: TUYA_KEY_ACCESS_SECRET,
      label: 'Access Secret',
      type: 'secret',
      hint: 'يُخزَّن مشفّراً على السيرفر ولا يُرسل لأي جهة غير Tuya',
      options: [],
      required: true,
    },
    {
      key: TUYA_KEY_UID,
      label: 'UID',
      type: 'text',
      hint: 'من تبويب Devices ← Linked App Account',
      options: [],
      required: true,
    },
    {
      key: TUYA_KEY_HOST,
      label: 'مركز البيانات',
      type: 'choice',
      hint: 'يجب أن يطابق ما اخترته عند إنشاء المشروع',
      defaultValue: DEFAULT_DATA_CENTER.host,
      required: true,
      options: TUYA_DATA_CENTERS.map((dc) => ({
        value: dc.host,
        label: dc.labelAr,
        hint: dc.host,
      })),
    },
  ],
};

/** مسارات Tuya Cloud OpenAPI المستخدمة. */
export const TuyaPaths = {
  token: '/v1.0/token',
  userDevices: (uid: string) => `/v1.0/users/${uid}/devices`,
  device: (id: string) => `/v1.0/devices/${id}`,
  specifications: (id: string) => `/v1.0/devices/${id}/specifications`,
  status: (id: string) => `/v1.0/devices/${id}/status`,
  commands: (id: string) => `/v1.0/devices/${id}/commands`,
  logs: (id: string) => `/v1.0/devices/${id}/logs`,
} as const;

export const TuyaTuning = {
  requestTimeoutMs: 20_000,
  /** نجدّد التوكن قبل انتهائه بهذا الهامش تفادياً لسباق الزمن. */
  tokenRefreshMarginMs: 5 * 60_000,
  /** نوع سجلّات «تقارير حالة الجهاز» في `/logs`. */
  reportLogType: '7',
} as const;
