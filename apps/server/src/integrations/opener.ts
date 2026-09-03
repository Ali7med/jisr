import type { SecretsCipher } from '../db/crypto.ts';
import type { AccountRecord } from '../db/repositories.ts';
import type { IntegrationRegistry } from './registry.ts';
import type { Integration } from './types.ts';

/**
 * يفتح تكاملاً من حساب مخزَّن: يفكّ تشفير الأسرار ثم يسلّمها للتكامل.
 *
 * **هذه هي النقطة الوحيدة التي يخرج فيها سرّ من القاعدة**، وتبقى داخل
 * الذاكرة: لا يُسجَّل ولا يُعاد في أي استجابة (الهيكلية § 7).
 */
export interface IntegrationOpener {
  open(account: AccountRecord): Integration;
}

export function createIntegrationOpener(
  registry: IntegrationRegistry,
  cipher: SecretsCipher,
): IntegrationOpener {
  return {
    open(account) {
      const credentials = cipher.open({
        cipher: Buffer.from(account.secretsCipher),
        iv: Buffer.from(account.secretsIv),
        tag: Buffer.from(account.secretsTag),
        keyVersion: account.keyVersion,
      });
      return registry.create(account.integrationId, { accountId: account.id, credentials });
    },
  };
}
