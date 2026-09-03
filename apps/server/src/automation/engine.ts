import type { FastifyBaseLogger } from 'fastify';
import type { AutomationAction, StateValue } from '@jisr/shared';
import type { AutomationRecord, Repositories } from '../db/repositories.ts';
import type { DevicesService } from '../devices/service.ts';
import { conditionsMet, scheduleDue, stateTriggerMatches } from './evaluate.ts';
import type { Notifier } from './notifier.ts';
import type { ScenesService } from './scenes.ts';

/**
 * محرّك الأتمتة — داخل العملية، بمُشغِّلَين ([ADR-0015]):
 *
 * - **الحالة**: كل قراءة متغيّرة تمرّ به فوراً، بلا طابور بين الحدث
 *   والإجراء.
 * - **الوقت**: دورة كل دقيقة تسأل «ماذا استحقّ؟».
 *
 * «٢٤/٧» يتحقّق بأن هذا يعمل على السيرفر — والهاتف مغلق.
 */
export interface AutomationEngine {
  /** يستدعيه أنبوب الحالة عند كل تغيّر. */
  onStateChange(update: {
    userId: string;
    deviceId: string;
    values: readonly StateValue[];
  }): Promise<void>;
  /** دورة مُشغِّل الوقت — تستدعيها الاختبارات مباشرة بلا مؤقّتات. */
  tickSchedules(now?: Date): Promise<void>;
  start(): void;
  stop(): void;
}

export interface AutomationEngineOptions {
  readonly repositories: Repositories;
  readonly devices: DevicesService;
  readonly scenes: ScenesService;
  readonly notifier: Notifier;
  readonly log: FastifyBaseLogger;
  readonly tickMs?: number;
  readonly now?: () => Date;
}

const TICK_MS = 60_000;

export function createAutomationEngine(options: AutomationEngineOptions): AutomationEngine {
  const { repositories, devices, scenes, notifier, log } = options;
  const now = options.now ?? (() => new Date());
  const tickMs = options.tickMs ?? TICK_MS;

  let timer: NodeJS.Timeout | null = null;
  let ticking = false;

  /**
   * آخر قيمة معروفة لكل قدرة — تقرأها الشروط.
   *
   * تُبنى من التغيّرات المارّة لا من استعلام لحظي: سؤال الشركة عن حالة
   * جهاز ثانٍ عند كل حدث يضاعف الاستدعاءات ويُبطئ الاستجابة.
   * **الأثر المقبول والموثّق**: شرط على جهاز لم تصل قراءته بعد إعادة
   * التشغيل يفشل — والفشل هنا أأمن من التخمين.
   */
  const known = new Map<string, unknown>();
  const stateKey = (deviceId: string, key: string) => `${deviceId} ${key}`;
  const stateOf = (deviceId: string, key: string) => known.get(stateKey(deviceId, key));

  async function runAction(userId: string, action: AutomationAction): Promise<string> {
    switch (action.kind) {
      case 'command':
        await devices.execute(userId, action.deviceId, [
          { key: action.key, value: action.value },
        ]);
        return `أمر ${action.key}`;

      case 'scene': {
        const scene = await repositories.scenes.findById(action.sceneId);
        if (!scene || scene.userId !== userId) {
          throw new Error('المشهد المرتبط بهذه الأتمتة لم يعد موجوداً.');
        }
        const result = await scenes.runOwned(userId, scene);
        if (result.failed > 0) {
          throw new Error(`مشهد ${scene.name}: فشلت ${result.failed} خطوة.`);
        }
        return `مشهد ${scene.name}`;
      }

      case 'notify':
        await notifier.notify(userId, {
          title: action.title,
          body: action.body,
          severity: action.severity,
        });
        return 'إشعار';
    }
  }

  async function runActions(automation: AutomationRecord, reason: string): Promise<void> {
    const at = now();
    const done: string[] = [];
    const failed: string[] = [];

    for (const action of automation.actions) {
      try {
        done.push(await runAction(automation.userId, action));
      } catch (error) {
        // إجراء يفشل لا يُلغي البقية — والسبب يُسجَّل بالعربية للمستخدم.
        failed.push(error instanceof Error ? error.message : 'تعذّر تنفيذ الإجراء.');
      }
    }

    await repositories.automations.markRun(automation.id, at);
    await repositories.automations.recordRun(automation.id, {
      succeeded: failed.length === 0,
      detail:
        failed.length === 0
          ? `${reason} — ${done.join('، ')}`
          : `${reason} — فشل: ${failed.join('، ')}`,
      ranAt: at,
    });

    if (failed.length > 0) {
      log.warn({ automationId: automation.id, failed }, 'إجراءات أتمتة فشلت');
    }
  }

  async function tickSchedules(at: Date = now()): Promise<void> {
    const automations = await repositories.automations.listEnabled();
    const context = { now: at, stateOf };

    for (const automation of automations) {
      const trigger = automation.trigger;
      if (trigger.kind !== 'schedule') continue;
      if (!scheduleDue(trigger, at, automation.lastRunAt)) continue;
      if (!conditionsMet(automation.conditions, context)) continue;

      await runActions(automation, `موعد ${trigger.at}`);
    }
  }

  return {
    async onStateChange(update) {
      for (const value of update.values) {
        known.set(stateKey(update.deviceId, value.key), value.value);
      }

      const automations = await repositories.automations.listEnabled();
      const context = { now: now(), stateOf };

      for (const automation of automations) {
        const trigger = automation.trigger;
        if (automation.userId !== update.userId || trigger.kind !== 'state') continue;

        const fired = update.values.some((value) =>
          stateTriggerMatches(trigger, {
            deviceId: update.deviceId,
            key: value.key,
            value: value.value,
          }),
        );
        if (!fired || !conditionsMet(automation.conditions, context)) continue;

        await runActions(automation, `تغيّرت حالة ${update.deviceId}`);
      }
    },

    tickSchedules,

    start() {
      if (timer) return;
      timer = setInterval(() => {
        // دورة سابقة ما زالت تعمل: نتخطّى بدل تكديس التنفيذ.
        if (ticking) return;
        ticking = true;
        void tickSchedules()
          .catch((error: unknown) => log.error({ err: error }, 'فشلت دورة الأتمتة الموقوتة'))
          .finally(() => {
            ticking = false;
          });
      }, tickMs);
      timer.unref();
    },

    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
  };
}
