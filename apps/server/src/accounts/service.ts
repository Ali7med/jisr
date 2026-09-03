import type {
  Account,
  CreateAccountRequest,
  IntegrationInfo,
  SyncResult,
  UpdateAccountRequest,
} from '@jisr/shared';
import type { SecretsCipher } from '../db/crypto.ts';
import type { AccountRecord, Bytes, Repositories } from '../db/repositories.ts';
import { ApiFailure } from '../errors.ts';
import { IntegrationError } from '../integrations/errors.ts';
import type { IntegrationOpener } from '../integrations/opener.ts';
import { missingCredentials, type IntegrationRegistry } from '../integrations/registry.ts';

export interface AccountsServiceOptions {
  readonly repositories: Repositories;
  readonly registry: IntegrationRegistry;
  readonly opener: IntegrationOpener;
  readonly cipher: SecretsCipher;
  readonly now?: () => Date;
}

export interface AccountsService {
  integrations(): readonly IntegrationInfo[];
  list(userId: string): Promise<Account[]>;
  create(userId: string, input: CreateAccountRequest): Promise<Account>;
  update(userId: string, accountId: string, patch: UpdateAccountRequest): Promise<Account>;
  remove(userId: string, accountId: string): Promise<void>;
  sync(userId: string, accountId: string): Promise<SyncResult>;
}

/** Prisma يطلب Uint8Array مدعوماً بـ ArrayBuffer؛ Buffer عقدة أعمّ منه. */
function toBytes(value: Uint8Array): Bytes {
  return new Uint8Array(value);
}

const NOT_FOUND = 'لم نعثر على هذا الحساب — قد يكون حُذف. حدّث القائمة.';

export function createAccountsService(options: AccountsServiceOptions): AccountsService {
  const { repositories, registry, opener, cipher } = options;
  const now = options.now ?? (() => new Date());

  async function owned(userId: string, accountId: string): Promise<AccountRecord> {
    const account = await repositories.accounts.findOwned(userId, accountId);
    if (!account) throw ApiFailure.notFound(NOT_FOUND);
    return account;
  }

  function toAccount(record: AccountRecord, deviceCount: number): Account {
    return {
      id: record.id,
      integrationId: record.integrationId,
      label: record.label,
      status: record.status,
      deviceCount,
      ...(record.credentialsExpireAt
        ? { credentialsExpireAt: record.credentialsExpireAt.toISOString() }
        : {}),
      ...(record.lastCheckedAt ? { lastCheckedAt: record.lastCheckedAt.toISOString() } : {}),
      createdAt: record.createdAt.toISOString(),
    };
  }

  /** يتحقّق من الاعتمادات قبل حفظها — لا نحفظ حساباً لا يعمل. */
  async function verifyCredentials(
    integrationId: string,
    credentials: Record<string, string>,
  ): Promise<void> {
    const info = registry.infoFor(integrationId);
    if (!info) {
      throw new ApiFailure(
        404,
        'UNKNOWN_INTEGRATION',
        'لا نعرف شركة بهذا المعرّف — راجع قائمة الشركات المتاحة في /integrations.',
      );
    }
    const missing = missingCredentials(info.fields, credentials);
    if (missing.length > 0) {
      throw new ApiFailure(
        400,
        'MISSING_CREDENTIALS',
        `بيانات ناقصة: ${missing.join('، ')} — أكمِلها وأعد المحاولة.`,
      );
    }

    // معرّف مؤقّت: التحقّق لا يترجم أجهزة، والمزامنة بعده تفتح التكامل
    // بالمعرّف الحقيقي.
    const integration = registry.create(integrationId, { accountId: 'unsaved', credentials });
    try {
      await integration.verify();
    } finally {
      integration.dispose();
    }
  }

  /** مزامنة واحدة تخدم الإنشاء والتحديث والطلب الصريح. */
  async function syncAccount(account: AccountRecord): Promise<SyncResult> {
    const integration = opener.open(account);
    try {
      const devices = await integration.fetchDevices();
      const outcome = await repositories.devices.replaceForAccount(
        account.id,
        devices.map((device) => ({
          nativeId: device.nativeId,
          integrationId: device.integrationId,
          name: device.name,
          category: device.category,
          online: device.online,
          model: device.model,
          productName: device.productName,
          iconUrl: device.iconUrl ?? null,
          room: device.room ?? null,
          isSubDevice: device.isSubDevice,
        })),
      );
      const at = now();
      await repositories.accounts.update(account.id, { lastCheckedAt: at, status: 'active' });

      return {
        accountId: account.id,
        deviceCount: outcome.total,
        added: outcome.added,
        removed: outcome.removed,
        at: at.toISOString(),
      };
    } catch (error) {
      // اعتمادات مرفوضة تُعلَّم على الحساب كي يظهر التنبيه في الواجهة
      // بدل أن يكتشف المستخدم العطل حين لا يستجيب جهازه.
      if (error instanceof IntegrationError && (error.kind === 'credentials' || error.kind === 'auth')) {
        await repositories.accounts.update(account.id, {
          status: 'invalid_credentials',
          lastCheckedAt: now(),
        });
      }
      throw error;
    } finally {
      integration.dispose();
    }
  }

  return {
    integrations: () => registry.available,

    async list(userId) {
      const records = await repositories.accounts.listByUser(userId);
      const counts = await repositories.accounts.countDevices(records.map((record) => record.id));
      return records.map((record) => toAccount(record, counts.get(record.id) ?? 0));
    },

    async create(userId, input) {
      await verifyCredentials(input.integrationId, input.credentials);

      const sealed = cipher.seal(input.credentials);
      const record = await repositories.accounts.create({
        userId,
        integrationId: input.integrationId,
        label: input.label.trim(),
        secretsCipher: toBytes(sealed.cipher),
        secretsIv: toBytes(sealed.iv),
        secretsTag: toBytes(sealed.tag),
        keyVersion: sealed.keyVersion,
      });

      const result = await syncAccount(record);
      return toAccount({ ...record, lastCheckedAt: new Date(result.at) }, result.deviceCount);
    },

    async update(userId, accountId, patch) {
      const record = await owned(userId, accountId);

      if (patch.credentials) {
        await verifyCredentials(record.integrationId, patch.credentials);
      }
      const sealed = patch.credentials ? cipher.seal(patch.credentials) : undefined;

      const updated = await repositories.accounts.update(accountId, {
        ...(patch.label === undefined ? {} : { label: patch.label.trim() }),
        ...(sealed
          ? {
              secretsCipher: toBytes(sealed.cipher),
              secretsIv: toBytes(sealed.iv),
              secretsTag: toBytes(sealed.tag),
              keyVersion: sealed.keyVersion,
              status: 'active' as const,
            }
          : {}),
      });

      const counts = await repositories.accounts.countDevices([accountId]);
      return toAccount(updated, counts.get(accountId) ?? 0);
    },

    async remove(userId, accountId) {
      await owned(userId, accountId);
      // الأجهزة والسجلّ يسقطان بالتتالي — حذف الحساب يعني حذف أثره كاملاً.
      await repositories.accounts.remove(accountId);
    },

    async sync(userId, accountId) {
      return syncAccount(await owned(userId, accountId));
    },
  };
}
