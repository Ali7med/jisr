import {
  makeDeviceId,
  parseDeviceId,
  DEVICE_CATEGORY_LABELS_AR,
  type Capability,
  type Command,
  type CommandResult,
  type Device,
  type DeviceCategory,
  type DeviceSnapshot,
  type HistoryResponse,
} from '@jisr/shared';
import type { AccountRecord, DeviceRecord, Repositories } from '../db/repositories.ts';
import { ApiFailure } from '../errors.ts';
import type { IntegrationOpener } from '../integrations/opener.ts';
import type { IntegrationRegistry } from '../integrations/registry.ts';

export interface DevicesServiceOptions {
  readonly repositories: Repositories;
  readonly registry: IntegrationRegistry;
  readonly opener: IntegrationOpener;
  readonly now?: () => Date;
}

export interface HistoryRequest {
  readonly keys: readonly string[];
  readonly start: Date;
  readonly end: Date;
  readonly limit: number;
}

export interface DevicesService {
  list(userId: string): Promise<Device[]>;
  snapshot(userId: string, deviceId: string): Promise<DeviceSnapshot>;
  execute(userId: string, deviceId: string, commands: readonly Command[]): Promise<CommandResult>;
  history(userId: string, deviceId: string, query: HistoryRequest): Promise<HistoryResponse>;
}

const NOT_FOUND = 'لم نعثر على هذا الجهاز — قد يكون حُذف من حسابك لدى الشركة. زامِن الحساب.';

/** فئة مخزّنة لا نعرفها (بعد ترقية غيّرت القائمة) تُعرض «أخرى» ولا تُسقط الجهاز. */
function toCategory(stored: string): DeviceCategory {
  return stored in DEVICE_CATEGORY_LABELS_AR ? (stored as DeviceCategory) : 'other';
}

function toDevice(record: DeviceRecord): Device {
  return {
    id: makeDeviceId(record.integrationId, record.nativeId),
    integrationId: record.integrationId,
    accountId: record.accountId,
    nativeId: record.nativeId,
    name: record.name,
    category: toCategory(record.category),
    online: record.online,
    model: record.model,
    productName: record.productName,
    ...(record.iconUrl ? { iconUrl: record.iconUrl } : {}),
    ...(record.room ? { room: record.room } : {}),
    isSubDevice: record.isSubDevice,
    capabilities: record.capabilities,
  };
}

export function createDevicesService(options: DevicesServiceOptions): DevicesService {
  const { repositories, registry, opener } = options;
  const now = options.now ?? (() => new Date());

  async function owned(
    userId: string,
    deviceId: string,
  ): Promise<{ device: DeviceRecord; account: AccountRecord }> {
    let parsed: { integrationId: string; nativeId: string };
    try {
      parsed = parseDeviceId(deviceId);
    } catch {
      throw ApiFailure.notFound(NOT_FOUND);
    }
    const found = await repositories.devices.findOwned(userId, parsed.integrationId, parsed.nativeId);
    if (!found) throw ApiFailure.notFound(NOT_FOUND);
    return found;
  }

  return {
    async list(userId) {
      return (await repositories.devices.listByUser(userId)).map(toDevice);
    },

    /**
     * القدرات تُجلب **كسولاً مرة واحدة** وتُخزَّن: وصفها لا يتغيّر عملياً،
     * وجلبها لكل جهاز في كل مزامنة يستهلك حصّة الشركة بلا داعٍ
     * (الدراسة § 7 — حدود الحصص).
     */
    async snapshot(userId, deviceId) {
      const { device, account } = await owned(userId, deviceId);
      const integration = opener.open(account);
      try {
        let capabilities: Capability[] = device.capabilities;
        if (capabilities.length === 0) {
          capabilities = await integration.fetchCapabilities(device.nativeId);
          if (capabilities.length > 0) {
            await repositories.devices.saveCapabilities(device.id, capabilities);
          }
        }
        const values = await integration.fetchState(device.nativeId);

        return {
          device: { ...toDevice(device), capabilities },
          values,
          at: now().toISOString(),
        };
      } finally {
        integration.dispose();
      }
    },

    /**
     * القبول يعني «أُرسل للشركة»، لا «نفّذه الجهاز» — التأكيد يأتي بتغيّر
     * الحالة (WS في P2.2)، وهذا ما يجعل التحكّم التفاؤلي صادقاً.
     */
    async execute(userId, deviceId, commands) {
      const { device, account } = await owned(userId, deviceId);
      const integration = opener.open(account);
      try {
        await integration.execute(device.nativeId, commands);
        return { deviceId, accepted: true, at: now().toISOString() };
      } finally {
        integration.dispose();
      }
    },

    /**
     * سجلّنا أولاً (ADR-0013). وحتى يمتلئ بمسجّل P2.3، نسدّ الفجوة من
     * سحابة الشركة إن كانت تدعم السجلّ — والمصدر يُصرَّح به في الردّ.
     */
    async history(userId, deviceId, query) {
      const { device, account } = await owned(userId, deviceId);

      const rows = await repositories.history.list({
        deviceId: device.id,
        keys: query.keys,
        start: query.start,
        end: query.end,
        limit: query.limit,
      });

      if (rows.length > 0) {
        return {
          deviceId,
          source: 'server',
          points: rows.map((row) => ({
            key: row.key,
            value: row.value,
            at: row.recordedAt.toISOString(),
          })),
        };
      }

      const info = registry.infoFor(device.integrationId);
      if (!info?.supportsHistory) {
        return { deviceId, source: 'server', points: [] };
      }

      const integration = opener.open(account);
      try {
        const points = await integration.fetchHistory(device.nativeId, {
          keys: query.keys,
          start: query.start,
          end: query.end,
          limit: query.limit,
        });
        return { deviceId, source: 'integration', points };
      } finally {
        integration.dispose();
      }
    },
  };
}
