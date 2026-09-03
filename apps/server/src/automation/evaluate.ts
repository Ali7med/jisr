import type {
  AutomationCondition,
  CompareOp,
  ScheduleTrigger,
  StateTrigger,
  TimeCondition,
} from '@jisr/shared';

/**
 * منطق الأتمتة **خالص**: لا قاعدة بيانات ولا شبكة ولا مؤقّتات.
 *
 * هذا مقصود: «هل يجب أن تعمل هذه الأتمتة الآن؟» هو السؤال الذي يخطئ فيه
 * كل محرّك أتمتة، وعزله في دوالّ خالصة يجعل الإجابة قابلة للاختبار
 * بالحالات الحدّية (منتصف الليل · المناطق الزمنية · إعادة التشغيل).
 */

export function compare(op: CompareOp, actual: unknown, expected: unknown): boolean {
  if (op === 'changed') return true;
  if (op === 'eq') return equals(actual, expected);
  if (op === 'ne') return !equals(actual, expected);

  // الموازنات العددية على غير عدد لا معنى لها — نقول «لا» بدل تخمين.
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;

  switch (op) {
    case 'gt':
      return actual > expected;
    case 'gte':
      return actual >= expected;
    case 'lt':
      return actual < expected;
    case 'lte':
      return actual <= expected;
    default:
      return false;
  }
}

function equals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/** هل هذه القراءة الواصلة تُشغّل هذه الأتمتة؟ */
export function stateTriggerMatches(
  trigger: StateTrigger,
  event: { deviceId: string; key: string; value: unknown },
): boolean {
  if (trigger.deviceId !== event.deviceId || trigger.key !== event.key) return false;
  return compare(trigger.op, event.value, trigger.value);
}

export interface LocalTime {
  /** دقائق منذ منتصف الليل بتوقيت المستخدم. */
  readonly minutes: number;
  /** 0 = الأحد. */
  readonly day: number;
  /** `YYYY-MM-DD` بتوقيت المستخدم — يميّز «اليوم» عبر المناطق. */
  readonly date: string;
}

const WEEKDAYS: Readonly<Record<string, number>> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * وقت المستخدم المحلي بلا مكتبة تواريخ.
 *
 * منطقة زمنية غير صالحة تعود إلى UTC بدل أن ترمي: أتمتة تعمل بتوقيت
 * خاطئ أهون من محرّك يسقط لكل المستخدمين بسبب سلسلة نصية واحدة.
 */
export function localTime(now: Date, timezone: string): LocalTime {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
  } catch {
    return localTime(now, 'UTC');
  }

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  // بعض المناطق تُصيّر منتصف الليل «24» لا «00»
  const hour = Number(value('hour')) % 24;

  return {
    minutes: hour * 60 + Number(value('minute')),
    day: WEEKDAYS[value('weekday')] ?? 0,
    date: `${value('year')}-${value('month')}-${value('day')}`,
  };
}

export function parseClock(clock: string): number {
  const [hours = '0', minutes = '0'] = clock.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** تجاوز منتصف الليل مسموح: 22:00 ← 06:00 نافذة صالحة. */
export function withinWindow(minutes: number, from: number, to: number): boolean {
  return from <= to ? minutes >= from && minutes <= to : minutes >= from || minutes <= to;
}

/** مهلة سماح لارتعاش المؤقّت وإعادة التشغيل — دقيقة فائتة أفضل من أتمتة لا تعمل. */
export const SCHEDULE_GRACE_MINUTES = 5;

/**
 * هل حان وقت أتمتة موقوتة، ولم تعمل بعد اليوم؟
 *
 * `lastRunAt` هو ما يمنع التكرار — ولذلك يعيش في القاعدة لا في الذاكرة
 * ([ADR-0015]): إعادة تشغيل السيرفر بعد التنفيذ يجب ألّا تُنفّذه ثانية.
 */
export function scheduleDue(
  trigger: ScheduleTrigger,
  now: Date,
  lastRunAt: Date | null,
): boolean {
  const local = localTime(now, trigger.timezone);
  if (trigger.days.length > 0 && !trigger.days.includes(local.day)) return false;

  const due = parseClock(trigger.at);
  const late = local.minutes - due;
  if (late < 0 || late > SCHEDULE_GRACE_MINUTES) return false;

  if (!lastRunAt) return true;
  const previous = localTime(lastRunAt, trigger.timezone);
  // عملت اليوم عند موعدها أو بعده ⇒ لا تُعاد
  return previous.date !== local.date || previous.minutes < due;
}

export function timeConditionMet(condition: TimeCondition, now: Date): boolean {
  const local = localTime(now, condition.timezone);
  return withinWindow(local.minutes, parseClock(condition.from), parseClock(condition.to));
}

export interface ConditionContext {
  readonly now: Date;
  /** آخر قيمة معروفة لقدرة — `undefined` تعني «لا نعرف». */
  stateOf(deviceId: string, key: string): unknown;
}

/**
 * كل الشروط يجب أن تتحقّق (AND).
 *
 * **شرط على قيمة لا نعرفها يفشل**: تشغيل مكيّف لأننا «لا نعرف الحرارة»
 * سلوك لا يقبله مستخدم.
 */
export function conditionsMet(
  conditions: readonly AutomationCondition[],
  context: ConditionContext,
): boolean {
  return conditions.every((condition) => {
    if (condition.kind === 'time_between') return timeConditionMet(condition, context.now);

    const actual = context.stateOf(condition.deviceId, condition.key);
    if (actual === undefined) return false;
    return compare(condition.op, actual, condition.value);
  });
}
