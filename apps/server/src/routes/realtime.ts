import type { FastifyPluginAsync } from 'fastify';
import type { RealtimeEvent } from '@jisr/shared';
import type { StateBus } from '../state/bus.ts';

/**
 * القناة اللحظية — قناة لكل مستخدم.
 *
 * **المصادقة برسالة لا برابط:** المتصفّح لا يستطيع إرسال ترويسة
 * `Authorization` مع WebSocket، والحلّ الشائع (`?token=`) يضع رمز وصول
 * في رابط تُسجّله الخوادم والوسطاء. فنقبل ترويسة لمن يستطيع (wscat،
 * الهاتف)، ونقبل رسالة `{"type":"auth","token":"…"}` أول ما يتصل
 * لغيره — ونغلق الاتصال إن لم تصل خلال مهلة قصيرة.
 */
const AUTH_TIMEOUT_MS = 10_000;

/** رموز إغلاق خاصة بالتطبيق (المدى 4000–4999 محجوز لنا في المعيار). */
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_BAD_MESSAGE = 4400;

export interface RealtimeOptions {
  readonly bus: StateBus;
}

export const realtimeRoutes: FastifyPluginAsync<RealtimeOptions> = async (app, opts) => {
  const { bus } = opts;

  app.get('/ws', { websocket: true }, (socket, request) => {
    let unsubscribe: (() => void) | null = null;

    const timeout = setTimeout(() => {
      if (!unsubscribe) {
        socket.close(CLOSE_UNAUTHORIZED, 'لم تصل رسالة المصادقة — أرسل {"type":"auth","token":"…"}');
      }
    }, AUTH_TIMEOUT_MS);
    timeout.unref?.();

    function send(event: RealtimeEvent): void {
      socket.send(JSON.stringify(event));
    }

    function authenticate(token: string): void {
      let userId: string;
      try {
        userId = app.jwt.verify<{ sub: string }>(token).sub;
      } catch {
        socket.close(CLOSE_UNAUTHORIZED, 'رمز الوصول غير صالح أو منتهٍ — سجّل الدخول من جديد.');
        return;
      }

      clearTimeout(timeout);
      unsubscribe = bus.subscribe(userId, send);
      send({ type: 'hello', at: new Date().toISOString() });
      request.log.info({ userId }, 'اشتراك لحظي جديد');
    }

    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      authenticate(header.slice('Bearer '.length));
    }

    socket.on('message', (raw: Buffer) => {
      // بعد المصادقة لا نتوقّع رسائل من العميل: القناة أحادية الاتجاه.
      if (unsubscribe) return;

      let message: unknown;
      try {
        message = JSON.parse(raw.toString('utf8'));
      } catch {
        socket.close(CLOSE_BAD_MESSAGE, 'رسالة غير مفهومة — نتوقّع JSON.');
        return;
      }

      const parsed = message as { type?: unknown; token?: unknown };
      if (parsed.type !== 'auth' || typeof parsed.token !== 'string') {
        socket.close(CLOSE_BAD_MESSAGE, 'أول رسالة يجب أن تكون {"type":"auth","token":"…"}');
        return;
      }
      authenticate(parsed.token);
    });

    // إلغاء الاشتراك عند الإغلاق إلزامي: بدونه يتسرّب المستمع مع كل اتصال.
    socket.on('close', () => {
      clearTimeout(timeout);
      unsubscribe?.();
      unsubscribe = null;
    });
  });
};
