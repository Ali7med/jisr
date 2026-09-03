import { Type, type Static } from '@sinclair/typebox';
import { Device, StateValue } from './device.js';

/**
 * أحداث القناة اللحظية (WebSocket).
 *
 * القناة **لكل مستخدم**: لا يصل حدث جهاز إلا لمن يملك حسابه. والحدث
 * يحمل ما تغيّر فقط — لا لقطة كاملة في كل مرة.
 */

/** أول رسالة بعد نجاح المصادقة — تُثبت للعميل أن القناة حيّة. */
export const HelloEvent = Type.Object(
  {
    type: Type.Literal('hello'),
    at: Type.String({ format: 'date-time' }),
  },
  { $id: 'HelloEvent', additionalProperties: false },
);
export type HelloEvent = Static<typeof HelloEvent>;

/** قيم تغيّرت على جهاز — القيم غير المتغيّرة لا تُرسل. */
export const StateEvent = Type.Object(
  {
    type: Type.Literal('state'),
    deviceId: Type.String({ minLength: 1 }),
    values: Type.Array(Type.Ref(StateValue)),
    at: Type.String({ format: 'date-time' }),
  },
  { $id: 'StateEvent', additionalProperties: false },
);
export type StateEvent = Static<typeof StateEvent>;

/** تغيّر في بيانات الجهاز نفسه — اتصاله أو اسمه أو ظهوره بعد مزامنة. */
export const DeviceEvent = Type.Object(
  {
    type: Type.Literal('device'),
    device: Type.Ref(Device),
    at: Type.String({ format: 'date-time' }),
  },
  { $id: 'DeviceEvent', additionalProperties: false },
);
export type DeviceEvent = Static<typeof DeviceEvent>;

export const RealtimeEvent = Type.Union(
  [Type.Ref(HelloEvent), Type.Ref(StateEvent), Type.Ref(DeviceEvent)],
  { $id: 'RealtimeEvent' },
);
export type RealtimeEvent = Static<typeof RealtimeEvent>;

/**
 * رسالة المصادقة التي يرسلها العميل أول ما يتصل.
 *
 * التوكن في **جسم رسالة** لا في رابط: الروابط تُسجَّل في سجلّات الخوادم
 * والوسطاء، فوضع رمز وصول فيها تسريب مؤجّل.
 */
export const RealtimeAuthMessage = Type.Object(
  {
    type: Type.Literal('auth'),
    token: Type.String({ minLength: 1 }),
  },
  { $id: 'RealtimeAuthMessage', additionalProperties: false },
);
export type RealtimeAuthMessage = Static<typeof RealtimeAuthMessage>;
