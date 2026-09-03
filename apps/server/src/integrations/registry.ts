import type { CredentialField, IntegrationInfo } from '@jisr/shared';
import { IntegrationError } from './errors.ts';
import type { Integration, IntegrationContext, IntegrationEntry } from './types.ts';
import { tuyaEntry } from './tuya/index.ts';

/**
 * سجلّ كل التكاملات التي يعرفها السيرفر.
 *
 * **هذا هو المكان الوحيد الذي يُذكر فيه اسم شركة.** إضافة شركة جديدة:
 * 1. مجلّد تحت `src/integrations/<name>/` فيه ما يحقّق `Integration`.
 * 2. بطاقة `IntegrationInfo` تصف حقول اعتماده.
 * 3. **سطر واحد** في `ENTRIES` أدناه.
 *
 * لا شاشة جديدة في الهاتف أو الويب، ولا تعديل على المسارات — القاعدة
 * الحاكمة 7، ومعيار قبول P7 هو إثباتها عملياً.
 */
const ENTRIES: readonly IntegrationEntry[] = [tuyaEntry];

export interface IntegrationRegistry {
  /** بطاقات كل التكاملات المتاحة — يعرضها الويب في «أضف حساباً». */
  readonly available: readonly IntegrationInfo[];
  infoFor(integrationId: string): IntegrationInfo | undefined;
  /** يرمي `IntegrationError` لتكامل غير معروف بدل إرجاع `undefined` صامت. */
  create(integrationId: string, context: IntegrationContext): Integration;
}

export function createIntegrationRegistry(
  entries: readonly IntegrationEntry[] = ENTRIES,
): IntegrationRegistry {
  const byId = new Map(entries.map((entry) => [entry.info.id, entry]));

  return {
    available: entries.map((entry) => entry.info),

    infoFor(integrationId) {
      return byId.get(integrationId)?.info;
    },

    create(integrationId, context) {
      const entry = byId.get(integrationId);
      if (!entry) {
        throw new IntegrationError(
          `لا نعرف تكاملاً باسم «${integrationId}» — قد يكون حُذف في تحديث. راجع قائمة الشركات المتاحة.`,
          { integrationId, kind: 'unknown' },
        );
      }
      const missing = missingCredentials(entry.info.fields, context.credentials);
      if (missing.length > 0) {
        throw new IntegrationError(
          `بيانات الحساب ناقصة: ${missing.join('، ')} — أعد إعداد الحساب.`,
          { integrationId, kind: 'credentials' },
        );
      }
      return entry.create(context);
    },
  };
}

/**
 * الحقول المطلوبة الفارغة، بأسمائها المعروضة لا بمفاتيحها — الرسالة
 * تُقرأ من مستخدم لا من مبرمج.
 */
export function missingCredentials(
  fields: readonly CredentialField[],
  credentials: Readonly<Record<string, string>>,
): string[] {
  return fields
    .filter((field) => field.required !== false && !(credentials[field.key] ?? '').trim())
    .map((field) => field.label);
}
