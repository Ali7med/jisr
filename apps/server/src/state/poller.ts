import type { FastifyBaseLogger } from 'fastify';
import { makeDeviceId } from '@jisr/shared';
import type { Repositories } from '../db/repositories.ts';
import { IntegrationError } from '../integrations/errors.ts';
import type { IntegrationOpener } from '../integrations/opener.ts';
import type { StatePipeline } from './pipeline.ts';

/**
 * مُستقصي الحالة — **حلّ مؤقّت صريح**.
 *
 * الوصول اللحظي الحقيقي هو دفع الشركة لرسائلها (P2.1)، وهو ما يحقّق
 * «< ٢ ثانية» في معيار قبول P2. الاستقصاء لا يحقّقه ولا يمكنه: تقصير
 * الفترة يلتهم حصّة الاستدعاءات (الدراسة § 7). لذلك **يبدأ معطّلاً**،
 * ويُفعَّل بـ `STATE_POLL_INTERVAL_SECONDS` لمن يقبل المقايضة.
 *
 * قيمته الدائمة: يُثبت أنابيب الحالة (المقارنة · الحفظ · النشر) قبل
 * وصول الدفع، فلا يبقى منها شيء غير مُختبَر حين يصل.
 */
export interface StatePoller {
  /** دورة واحدة — تستدعيها الاختبارات مباشرة بلا مؤقّتات. */
  tick(): Promise<void>;
  start(): void;
  stop(): void;
}

export interface StatePollerOptions {
  readonly repositories: Repositories;
  readonly opener: IntegrationOpener;
  readonly pipeline: StatePipeline;
  readonly intervalMs: number;
  readonly log: FastifyBaseLogger;
}

export function createStatePoller(options: StatePollerOptions): StatePoller {
  const { repositories, opener, pipeline, intervalMs, log } = options;
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function tick(): Promise<void> {
    // دورة سابقة ما زالت تعمل: نتخطّى بدل تكديس الطلبات على الشركة.
    if (running) return;
    running = true;

    try {
      const accounts = await repositories.accounts.listActive();
      for (const account of accounts) {
        const devices = await repositories.devices.listByAccount(account.id);
        const online = devices.filter((device) => device.online);
        if (online.length === 0) continue;

        const integration = opener.open(account);
        try {
          for (const device of online) {
            const values = await integration.fetchState(device.nativeId);
            await pipeline.apply({
              userId: account.userId,
              deviceId: device.id,
              publicDeviceId: makeDeviceId(device.integrationId, device.nativeId),
              values,
            });
          }
        } catch (error) {
          // حساب واحد يفشل لا يوقف بقية الحسابات.
          log.warn(
            {
              accountId: account.id,
              kind: error instanceof IntegrationError ? error.kind : 'unknown',
            },
            'تعذّر استقصاء حالة حساب',
          );
        } finally {
          integration.dispose();
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    tick,

    start() {
      if (timer || intervalMs <= 0) return;
      timer = setInterval(() => {
        void tick().catch((error: unknown) => log.error({ err: error }, 'فشل استقصاء الحالة'));
      }, intervalMs);
      timer.unref();
      log.info({ intervalMs }, 'بدأ استقصاء الحالة (حلّ مؤقّت حتى دفع الرسائل — P2.1)');
    },

    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
  };
}
