import {
  toDisplay,
  type Automation,
  type AutomationAction,
  type AutomationCondition,
  type AutomationTrigger,
  type Capability,
  type CompareOp,
  type NotifySeverity,
} from '@jisr/shared';

/**
 * تحويل عقد الأتمتة إلى جملة عربية مقروءة.
 *
 * المستخدم يبني أتمتته من قوائم لا من نصّ، لكنه يجب أن **يقرأ** ما بناه
 * قبل أن يحفظه: «حين … · بشرط … · نفّذ …». وهذه الدوالّ هي المصدر الوحيد
 * لتلك الجملة، فلا تختلف صياغة القائمة عن صياغة معاينة البانِي.
 */

/**
 * المنطقة الافتراضية في الواجهة. العقد يتركها بلا قيمة افتراضية عمداً
 * (الأشكال داخل اتحاد لا تُطبَّق فيها الافتراضيات)، والواجهة تختار قيمة
 * ظاهرة يستطيع المستخدم تبديلها — لا قيمة صامتة يُفاجأ بها.
 */
export const DEFAULT_TIMEZONE = 'Asia/Baghdad';

const COMMON_TIMEZONES = [
  'Asia/Baghdad',
  'Asia/Riyadh',
  'Asia/Kuwait',
  'Asia/Dubai',
  'Asia/Qatar',
  'Asia/Beirut',
  'Asia/Amman',
  'Asia/Damascus',
  'Africa/Cairo',
  'Africa/Casablanca',
  'Europe/Istanbul',
  'UTC',
];

/** القائمة المعروضة: الشائع في المنطقة، ومنطقة المتصفّح إن كانت خارجه. */
export function timezoneOptions(current: string): string[] {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const all = [...COMMON_TIMEZONES];
  for (const zone of [local, current]) {
    if (zone && !all.includes(zone)) all.unshift(zone);
  }
  return all;
}

export const COMPARE_LABELS: Readonly<Record<CompareOp, string>> = Object.freeze({
  eq: 'تساوي',
  ne: 'لا تساوي',
  gt: 'أكبر من',
  gte: 'أكبر من أو تساوي',
  lt: 'أصغر من',
  lte: 'أصغر من أو تساوي',
  changed: 'تغيّرت لأي قيمة',
});

export const SEVERITY_LABELS: Readonly<Record<NotifySeverity, string>> = Object.freeze({
  info: 'معلومة',
  warning: 'تنبيه',
  critical: 'حرج',
});

export const WEEKDAY_LABELS = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
] as const;

/**
 * ما تحتاجه الجملة من أسماء. الصفحة تملك القوائم، وهذه الوحدة لا تجلب
 * شيئاً — فتبقى دوالّ خالصة تُقرأ وتُختبر بلا شبكة.
 */
export interface Labels {
  device(deviceId: string): string;
  scene(sceneId: string): string;
  capability(deviceId: string, key: string): Capability | undefined;
}

/** قيمة قدرة كما يقرأها الإنسان: «يعمل» لا `true`، و«٢٣٫٥ °م» لا `235`. */
export function formatValue(capability: Capability | undefined, value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'boolean') return value ? 'يعمل' : 'متوقّف';
  if (typeof value === 'number' && capability) {
    const shown = toDisplay(capability, value);
    return `${shown.toLocaleString('ar')}${capability.unit ? ` ${capability.unit}` : ''}`;
  }
  if (typeof value === 'number') return value.toLocaleString('ar');
  return String(value);
}

function joinAr(parts: string[]): string {
  return parts.join(' و');
}

function daysText(days: number[]): string {
  if (days.length === 0 || days.length === 7) return 'كل يوم';
  const sorted = [...days].sort((a, b) => a - b);
  return joinAr(sorted.map((day) => WEEKDAY_LABELS[day] ?? `اليوم ${day}`));
}

function comparison(
  labels: Labels,
  deviceId: string,
  key: string,
  op: CompareOp,
  value: unknown,
): string {
  const device = labels.device(deviceId);
  if (op === 'changed') return `تتغيّر قراءة «${key}» في «${device}»`;
  const capability = labels.capability(deviceId, key);
  return `قراءة «${key}» في «${device}» ${COMPARE_LABELS[op]} ${formatValue(capability, value)}`;
}

export function describeTrigger(trigger: AutomationTrigger, labels: Labels): string {
  if (trigger.kind === 'schedule') {
    return `حين تحين الساعة ${trigger.at} ${daysText(trigger.days)} بتوقيت ${trigger.timezone}`;
  }
  return `حين ${comparison(labels, trigger.deviceId, trigger.key, trigger.op, trigger.value)}`;
}

export function describeCondition(condition: AutomationCondition, labels: Labels): string {
  if (condition.kind === 'time_between') {
    // تجاوز منتصف الليل مسموح في العقد، والجملة تقوله صراحةً كي لا يظنّ
    // المستخدم أن ٢٢:٠٠ ← ٠٦:٠٠ خطأ إدخال.
    const overnight = condition.from > condition.to ? ' (يمتدّ بعد منتصف الليل)' : '';
    return `الوقت بين ${condition.from} و${condition.to} بتوقيت ${condition.timezone}${overnight}`;
  }
  return comparison(labels, condition.deviceId, condition.key, condition.op, condition.value);
}

export function describeAction(action: AutomationAction, labels: Labels): string {
  if (action.kind === 'scene') return `شغّل مشهد «${labels.scene(action.sceneId)}»`;
  if (action.kind === 'notify') {
    return `أرسل إشعار «${action.title}» بدرجة ${SEVERITY_LABELS[action.severity]}`;
  }
  const capability = labels.capability(action.deviceId, action.key);
  return `اجعل «${action.key}» في «${labels.device(action.deviceId)}» ${formatValue(capability, action.value)}`;
}

/** الجملة كاملة — ما يُعرض في بطاقة الأتمتة وفي معاينة البانِي. */
export function describeAutomation(
  automation: Pick<Automation, 'trigger' | 'conditions' | 'actions'>,
  labels: Labels,
): string {
  const parts = [describeTrigger(automation.trigger, labels)];
  if (automation.conditions.length > 0) {
    parts.push(
      `بشرط ${joinAr(automation.conditions.map((condition) => describeCondition(condition, labels)))}`,
    );
  }
  parts.push(`نفّذ ${joinAr(automation.actions.map((action) => describeAction(action, labels)))}`);
  return parts.join(' · ');
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' });
}
