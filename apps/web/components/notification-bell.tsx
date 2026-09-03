'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Notification as JisrNotification } from '@jisr/shared';
import { ApiFailure } from '../lib/api';
import { useSession } from '../lib/session';
import { useRealtime } from '../lib/realtime';
import { SEVERITY_LABELS, formatDateTime } from '../lib/automation-text';

/**
 * جرس الإشعارات.
 *
 * الإشعار يصل لحظياً عبر القناة **ويبقى في القاعدة**: من كان بعيداً عن
 * اللوحة حين وقع الحدث يجب أن يجده حين يعود، لا أن يضيع مع الوصلة.
 */
export function NotificationBell() {
  const { api, accessToken } = useSession();
  const [items, setItems] = useState<JisrNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.notifications();
      setItems(list.notifications);
      setUnread(list.unread);
      setError(null);
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : `${failure}`);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtime(
    accessToken,
    undefined,
    useCallback((notification: JisrNotification) => {
      // الوصول مرتين ممكن (إعادة اتصال بعد انقطاع)؛ المعرّف يمنع التكرار.
      setItems((current) => [notification, ...current.filter((item) => item.id !== notification.id)]);
      if (!notification.read) setUnread((current) => current + 1);
    }, []),
  );

  async function markAllRead() {
    // تفاؤلي: العدّاد يصفر فوراً، ونعيد الجلب إن رفض السيرفر.
    setUnread(0);
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    try {
      await api.markNotificationsRead();
    } catch {
      void load();
    }
  }

  return (
    <span className="bell-wrap">
      <button
        className="bell"
        aria-expanded={open}
        title={unread > 0 ? `${unread} إشعار غير مقروء` : 'الإشعارات'}
        onClick={() => setOpen(!open)}
      >
        الإشعارات
        {unread > 0 && <span className="badge">{unread.toLocaleString('ar')}</span>}
      </button>

      {open && (
        <>
          <span className="panel-backdrop" onClick={() => setOpen(false)} />
          <div className="panel">
            <div className="row-card-head">
              <strong>الإشعارات</strong>
              <button disabled={unread === 0} onClick={() => void markAllRead()}>
                تعليم الكل مقروءاً
              </button>
            </div>

            {error && <p className="notice">{error}</p>}

            {items.length === 0 && !error && (
              <p className="muted">
                لا إشعارات. ستصلك هنا نتائج الأتمتة التي اخترت لها إجراء «إرسال إشعار».
              </p>
            )}

            <ul className="notifications">
              {items.map((item) => (
                <li key={item.id} className={item.read ? '' : 'fresh'}>
                  <span className={`pill ${item.severity === 'info' ? '' : 'off'}`}>
                    {SEVERITY_LABELS[item.severity]}
                  </span>{' '}
                  <strong>{item.title}</strong>
                  {item.body && <p>{item.body}</p>}
                  <p className="hint">{formatDateTime(item.createdAt)}</p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </span>
  );
}
