import type { FastifyBaseLogger } from 'fastify';
import type { AccountsService } from './service.ts';

/**
 * حارس صلاحية الحسابات — يفحص دورياً بدل انتظار شكوى المستخدم.
 *
 * المخاطرة التي يعالجها موثّقة في [الدراسة § 7]: اشتراك المشروع لدى
 * الشركة ينتهي (تجربة Tuya المجانية أوضح مثال)، فتتوقّف الأجهزة فجأة
 * والمستخدم لا يعرف السبب. الفحص يقلب المفاجأة إلى تنبيه مسبق.
 */
export interface AccountGuard {
  tick(): Promise<void>;
  start(): void;
  stop(): void;
}

export interface AccountGuardOptions {
  readonly accounts: AccountsService;
  readonly intervalMs: number;
  readonly log: FastifyBaseLogger;
}

export function createAccountGuard(options: AccountGuardOptions): AccountGuard {
  const { accounts, intervalMs, log } = options;
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function tick(): Promise<void> {
    // دورة سابقة ما زالت تعمل: نتخطّى بدل تكديس الطلبات على الشركات.
    if (running) return;
    running = true;

    try {
      const result = await accounts.checkAll();
      if (result.failed > 0) {
        log.warn(result, 'حسابات تحتاج تدخّل المستخدم');
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
        void tick().catch((error: unknown) => log.error({ err: error }, 'فشل فحص الحسابات'));
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
