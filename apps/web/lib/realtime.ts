'use client';

import { useEffect, useRef, useState } from 'react';
import type { Notification as JisrNotification, StateValue } from '@jisr/shared';
import { SERVER_URL } from './api';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

export interface StateEventPayload {
  deviceId: string;
  values: StateValue[];
  at: string;
}

export interface RealtimeHandlers {
  onState?: ((event: StateEventPayload) => void) | undefined;
  onNotification?: ((notification: JisrNotification) => void) | undefined;
}

interface Subscriber {
  /** مرجع لا نسخة: تبديل الدالة بين رسمتين لا يستحق فتح قناة جديدة. */
  handlers: { current: RealtimeHandlers };
  onStatus: (status: RealtimeStatus) => void;
}

function socketUrl(): string {
  const url = new URL(SERVER_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  return url.toString();
}

/**
 * قناة واحدة لكل التبويب، لا واحدة لكل خطّاف.
 *
 * الجرس في الشريط العلوي والصفحة تحته يشتركان في الأحداث نفسها؛ فتح
 * وصلتين للمستخدم ذاته يضاعف حمل السيرفر بلا مقابل، ويجعل نقطة «لحظي»
 * تقول شيئاً وحال الصفحة شيئاً آخر.
 */
const subscribers = new Set<Subscriber>();
let socket: WebSocket | null = null;
let token: string | null = null;
let status: RealtimeStatus = 'disconnected';
let attempt = 0;
let retry: ReturnType<typeof setTimeout> | null = null;
let teardown: ReturnType<typeof setTimeout> | null = null;

function publish(next: RealtimeStatus): void {
  status = next;
  for (const subscriber of subscribers) subscriber.onStatus(next);
}

function open(): void {
  if (!token || socket) return;
  publish('connecting');

  // المصادقة برسالة لا برابط: المتصفّح لا يرسل ترويسات مع WebSocket،
  // و`?token=` يضع رمز الوصول في سجلّات الخوادم والوسطاء.
  const opened = new WebSocket(socketUrl());
  socket = opened;

  opened.onopen = () => opened.send(JSON.stringify({ type: 'auth', token }));

  opened.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as { type?: string };

    if (message.type === 'hello') {
      attempt = 0;
      publish('connected');
      return;
    }
    if (message.type === 'state') {
      const payload = message as unknown as StateEventPayload;
      for (const subscriber of subscribers) subscriber.handlers.current.onState?.(payload);
      return;
    }
    if (message.type === 'notification') {
      const payload = message as unknown as { notification: JisrNotification };
      for (const subscriber of subscribers) {
        subscriber.handlers.current.onNotification?.(payload.notification);
      }
    }
  };

  opened.onclose = () => {
    // وصلة قديمة تُغلق بعد أن استُبدلت لا تعني انقطاعاً.
    if (socket !== opened) return;
    socket = null;
    publish('disconnected');
    if (!token || subscribers.size === 0) return;

    // مهل تصاعدية: سيرفر متعثّر لا يُفيده ألف محاولة بالثانية.
    const delay = Math.min(1000 * 2 ** attempt, 30_000);
    attempt += 1;
    retry = setTimeout(open, delay);
  };
}

function close(): void {
  if (retry) {
    clearTimeout(retry);
    retry = null;
  }
  const opened = socket;
  socket = null;
  attempt = 0;
  status = 'disconnected';
  opened?.close();
}

function subscribe(nextToken: string, subscriber: Subscriber): () => void {
  if (teardown) {
    clearTimeout(teardown);
    teardown = null;
  }
  if (nextToken !== token) {
    token = nextToken;
    close();
  }

  subscribers.add(subscriber);
  subscriber.onStatus(status);
  open();

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size > 0) return;

    // إغلاق مؤجّل: الانتقال بين صفحتين يفكّ مشتركاً ويركّب آخر في اللحظة
    // نفسها، وقطع القناة بينهما يُظهر «غير متصل» كذباً على كل تنقّل.
    teardown = setTimeout(() => {
      teardown = null;
      if (subscribers.size === 0) close();
    }, 500);
  };
}

/**
 * اشتراك في القناة اللحظية. مرّر ما يهمّك فقط: صفحة الجهاز تريد قراءاته،
 * والجرس يريد الإشعارات، والشريط العلوي يريد حالة الاتصال وحدها.
 */
export function useRealtime(
  accessToken: string | null,
  onState?: (event: StateEventPayload) => void,
  onNotification?: (notification: JisrNotification) => void,
): RealtimeStatus {
  const [current, setCurrent] = useState<RealtimeStatus>('disconnected');
  const handlers = useRef<RealtimeHandlers>({});
  handlers.current = { onState, onNotification };

  useEffect(() => {
    if (!accessToken) {
      setCurrent('disconnected');
      return;
    }
    return subscribe(accessToken, { handlers, onStatus: setCurrent });
  }, [accessToken]);

  return current;
}
