import type { Notification, NotifySeverity } from '@jisr/shared';
import type { Repositories } from '../db/repositories.ts';
import type { StateBus } from '../state/bus.ts';

/**
 * إرسال الإشعارات.
 *
 * **يُخزَّن أولاً ثم يُدفع**: من كان هاتفه مغلقاً حين وقع الحدث يجب أن
 * يجد الإشعار حين يفتحه. الإشعار الذي يعيش في القناة وحدها يضيع مع أول
 * انقطاع — وهذا بالضبط ما يقع فيه إشعار «تسرّب غاز».
 *
 * دفع FCM (P5.3) يصير منفذاً إضافياً خلف هذه الواجهة، لا بديلاً عنها.
 */
export interface Notifier {
  notify(
    userId: string,
    input: { title: string; body: string; severity: NotifySeverity },
  ): Promise<Notification>;
}

export function toNotification(record: {
  id: string;
  title: string;
  body: string;
  severity: NotifySeverity;
  readAt: Date | null;
  createdAt: Date;
}): Notification {
  return {
    id: record.id,
    title: record.title,
    body: record.body,
    severity: record.severity,
    read: record.readAt !== null,
    createdAt: record.createdAt.toISOString(),
  };
}

export function createNotifier(repositories: Repositories, bus: StateBus): Notifier {
  return {
    async notify(userId, input) {
      const stored = await repositories.notifications.create({ userId, ...input });
      const notification = toNotification(stored);

      bus.publish(userId, {
        type: 'notification',
        notification,
        at: notification.createdAt,
      });
      return notification;
    },
  };
}
