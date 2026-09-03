import { Type, type Static } from '@sinclair/typebox';
import { NotifySeverity } from './automation.js';

/**
 * إشعار داخل التطبيق.
 *
 * يصل لحظياً عبر القناة **ويبقى في القاعدة**: من كان هاتفه مغلقاً حين
 * وقع الحدث يجب أن يجده حين يفتحه. دفع FCM (P5.3) يُبنى فوق هذا لا بدلاً
 * منه — الإشعار الذي يعيش في الخادم وحده يضيع مع أول فشل دفع.
 */
export const Notification = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    title: Type.String(),
    body: Type.String(),
    severity: Type.Ref(NotifySeverity),
    read: Type.Boolean(),
    createdAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'Notification', additionalProperties: false },
);
export type Notification = Static<typeof Notification>;

export const NotificationList = Type.Object(
  {
    notifications: Type.Array(Type.Ref(Notification)),
    unread: Type.Integer({ minimum: 0 }),
  },
  { $id: 'NotificationList', additionalProperties: false },
);
export type NotificationList = Static<typeof NotificationList>;

/** حدث إشعار على القناة اللحظية. */
export const NotificationEvent = Type.Object(
  {
    type: Type.Literal('notification'),
    notification: Type.Ref(Notification),
    at: Type.String({ format: 'date-time' }),
  },
  { $id: 'NotificationEvent', additionalProperties: false },
);
export type NotificationEvent = Static<typeof NotificationEvent>;
