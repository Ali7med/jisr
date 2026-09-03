import type { RealtimeEvent } from '@jisr/shared';

/**
 * ناقل أحداث لحظي **داخل العملية الواحدة**.
 *
 * حدّ معروف وموثّق: مع أكثر من نسخة سيرفر لن يصل الحدث إلا لمشتركي
 * النسخة التي نشرته. حين نحتاج أكثر من نسخة (P2.8 يقيس متى) نستبدل
 * التنفيذ بـ Redis pub/sub خلف نفس الواجهة — بلا تغيير في المسارات.
 */
export type RealtimeListener = (event: RealtimeEvent) => void;

export interface StateBus {
  publish(userId: string, event: RealtimeEvent): void;
  /** يُرجع دالة إلغاء الاشتراك — استدعاؤها إلزامي عند إغلاق الاتصال. */
  subscribe(userId: string, listener: RealtimeListener): () => void;
  /** عدد المشتركين — تقرؤه المراقبة، وتؤكّد به الاختبارات عدم التسريب. */
  subscriberCount(userId?: string): number;
}

export function createStateBus(): StateBus {
  const channels = new Map<string, Set<RealtimeListener>>();

  return {
    publish(userId, event) {
      const listeners = channels.get(userId);
      if (!listeners) return;
      for (const listener of listeners) {
        // مشترك واحد يرمي لا يمنع البقية من تلقّي الحدث.
        try {
          listener(event);
        } catch {
          /* تجاهُل مقصود: الإرسال لمقبس مغلق ليس خطأ يستحق إسقاط النشر */
        }
      }
    },

    subscribe(userId, listener) {
      const listeners = channels.get(userId) ?? new Set<RealtimeListener>();
      listeners.add(listener);
      channels.set(userId, listeners);

      return () => {
        const current = channels.get(userId);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) channels.delete(userId);
      };
    },

    subscriberCount(userId) {
      if (userId !== undefined) return channels.get(userId)?.size ?? 0;
      let total = 0;
      for (const listeners of channels.values()) total += listeners.size;
      return total;
    },
  };
}
