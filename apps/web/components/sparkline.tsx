'use client';

import { toDisplay, type Capability, type HistoryPoint } from '@jisr/shared';

/**
 * رسم سجلّ بسيط بـ SVG خالص — بلا مكتبة رسوم.
 *
 * الاعتمادية تُضاف حين تُكسب شيئاً: خطّ واحد لسلسلة واحدة لا يستحق حزمة
 * تُشحن للمستخدم ويجب تحديثها (الهيكلية § 3).
 */
export function Sparkline({
  points,
  capability,
  width = 640,
  height = 180,
}: {
  points: HistoryPoint[];
  capability: Capability;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return <p className="muted">لا توجد قراءات كافية في هذه المدة لرسم خط.</p>;
  }

  const values = points.map((point) => toDisplay(capability, point.value));
  const times = points.map((point) => new Date(point.at).getTime());

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = maxValue - minValue || 1;
  const start = times[0] ?? 0;
  const duration = (times.at(-1) ?? start) - start || 1;

  const padding = 28;
  const x = (time: number) =>
    padding + ((time - start) / duration) * (width - padding * 2);
  const y = (value: number) =>
    height - padding - ((value - minValue) / span) * (height - padding * 2);

  const path = points
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L';
      return `${command}${x(times[index] ?? start).toFixed(1)},${y(values[index] ?? 0).toFixed(1)}`;
    })
    .join(' ');

  const unit = capability.unit ? ` ${capability.unit}` : '';

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`رسم ${capability.key}: من ${minValue}${unit} إلى ${maxValue}${unit}`}
      >
        <path
          d={path}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* الحدّان مكتوبان: رسم بلا مقياس يضلّل أكثر مما يفيد */}
        <text x={padding} y={16} fill="var(--muted)" fontSize="12">
          {maxValue.toLocaleString('ar')}
          {unit}
        </text>
        <text x={padding} y={height - 6} fill="var(--muted)" fontSize="12">
          {minValue.toLocaleString('ar')}
          {unit}
        </text>
      </svg>
      <figcaption className="hint">
        {points.length} قراءة · من {new Date(start).toLocaleString('ar')} إلى{' '}
        {new Date(times.at(-1) ?? start).toLocaleString('ar')}
      </figcaption>
    </figure>
  );
}
