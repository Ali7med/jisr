import type { FastifyBaseLogger } from 'fastify';
import type { Repositories } from '../db/repositories.ts';

/**
 * سياسة الاستبقاء — تعمل **من اليوم الأول** لا حين تمتلئ القاعدة
 * ([ADR-0013]). سلسلة زمنية بلا حذف تكبر حتى تصير الاستعادة من نسخة
 * احتياطية أطول من مهلة التوقّف المقبولة.
 */
export interface RetentionJob {
  /** دورة واحدة — تُرجع عدد الصفوف المحذوفة. */
  tick(): Promise<number>;
  start(): void;
  stop(): void;
}

export interface RetentionJobOptions {
  readonly repositories: Repositories;
  readonly retentionDays: number;
  readonly intervalMs: number;
  readonly log: FastifyBaseLogger;
  readonly now?: () => Date;
}

const DAY_MS = 86_400_000;

export function createRetentionJob(options: RetentionJobOptions): RetentionJob {
  const { repositories, retentionDays, intervalMs, log } = options;
  const now = options.now ?? (() => new Date());
  let timer: NodeJS.Timeout | null = null;

  async function tick(): Promise<number> {
    const cutoff = new Date(now().getTime() - retentionDays * DAY_MS);
    const removed = await repositories.history.prune(cutoff);
    if (removed > 0) {
      log.info({ removed, cutoff: cutoff.toISOString() }, 'حُذفت قراءات تجاوزت مدة الاستبقاء');
    }
    return removed;
  }

  return {
    tick,

    start() {
      if (timer || retentionDays <= 0) return;
      timer = setInterval(() => {
        void tick().catch((error: unknown) => log.error({ err: error }, 'فشل تنظيف السجلّ'));
      }, intervalMs);
      timer.unref();
    },

    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
  };
}
