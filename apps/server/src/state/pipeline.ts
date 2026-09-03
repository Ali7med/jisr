import type { StateValue } from '@jisr/shared';
import type { Repositories } from '../db/repositories.ts';
import type { StateBus } from './bus.ts';

/**
 * المسار الوحيد الذي تدخل منه قراءة جديدة إلى النظام.
 *
 * يفعل ثلاثة أشياء بالترتيب: يقارن بآخر قيمة معروفة، يحفظ **ما تغيّر
 * فقط**، ثم ينشره على قناة المستخدم. حفظ ما لم يتغيّر يضخّم سلسلة
 * `state_history` بلا فائدة ويقرّب موعد التقسيم الشهري (ADR-0013).
 *
 * يستدعيه اليوم مستقصي الحالة، وغداً مستهلك رسائل الشركة (P2.1) —
 * بلا تغيير هنا.
 */
export interface StateUpdate {
  readonly userId: string;
  /** المعرّف الداخلي — مفتاح `state_history`. */
  readonly deviceId: string;
  /** المعرّف المركّب — ما يراه العميل. */
  readonly publicDeviceId: string;
  readonly values: readonly StateValue[];
  readonly at?: Date;
}

export interface StatePipeline {
  /** يُرجع ما تغيّر فعلاً — فارغة تعني «لا جديد». */
  apply(update: StateUpdate): Promise<StateValue[]>;
  /** يُنسي آخر قيم جهاز — يُستدعى عند حذفه كي لا تتسرّب الذاكرة. */
  forget(deviceId: string): void;
}

export interface StatePipelineOptions {
  readonly repositories: Repositories;
  readonly bus: StateBus;
  /** يُخطر محرّك الأتمتة بما تغيّر — يُحقن كي يبقى الأنبوب مستقلاً عنه. */
  readonly onChange?: (update: {
    userId: string;
    deviceId: string;
    values: readonly StateValue[];
  }) => void;
  readonly now?: () => Date;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  // قيم Tuya المركّبة تصل ككائنات؛ المقارنة النصية أرخص من مقارنة عميقة.
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

export function createStatePipeline(options: StatePipelineOptions): StatePipeline {
  const { repositories, bus } = options;
  const now = options.now ?? (() => new Date());
  const lastKnown = new Map<string, Map<string, unknown>>();

  return {
    async apply(update) {
      const previous = lastKnown.get(update.deviceId) ?? new Map<string, unknown>();
      const changed: StateValue[] = [];

      for (const value of update.values) {
        if (previous.has(value.key) && sameValue(previous.get(value.key), value.value)) continue;
        previous.set(value.key, value.value);
        changed.push(value);
      }
      lastKnown.set(update.deviceId, previous);

      if (changed.length === 0) return [];

      const at = update.at ?? now();
      await repositories.history.record(
        changed.map((value) => ({
          deviceId: update.deviceId,
          key: value.key,
          // العدد يذهب لعمود الرسم، وما ليس عدداً يُحفظ خاماً ولا يُهمل
          value: typeof value.value === 'number' ? value.value : null,
          rawValue: typeof value.value === 'number' ? null : value.value,
          recordedAt: at,
        })),
      );

      bus.publish(update.userId, {
        type: 'state',
        deviceId: update.publicDeviceId,
        values: changed,
        at: at.toISOString(),
      });

      options.onChange?.({
        userId: update.userId,
        deviceId: update.publicDeviceId,
        values: changed,
      });

      return changed;
    },

    forget(deviceId) {
      lastKnown.delete(deviceId);
    },
  };
}
