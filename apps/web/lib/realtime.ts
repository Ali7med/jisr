'use client';

import { useEffect, useState } from 'react';
import type { StateValue } from '@jisr/shared';
import { SERVER_URL } from './api';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

export interface StateEventPayload {
  deviceId: string;
  values: StateValue[];
  at: string;
}

function socketUrl(): string {
  const url = new URL(SERVER_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  return url.toString();
}

/**
 * اشتراك في القناة اللحظية.
 *
 * **المصادقة برسالة لا برابط**: المتصفّح لا يرسل ترويسات مع WebSocket،
 * و`?token=` يضع رمز الوصول في سجلّات الخوادم والوسطاء.
 */
export function useRealtime(
  accessToken: string | null,
  onState: (event: StateEventPayload) => void,
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');

  useEffect(() => {
    if (!accessToken) {
      setStatus('disconnected');
      return;
    }

    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let closed = false;

    const open = () => {
      setStatus('connecting');
      socket = new WebSocket(socketUrl());

      socket.onopen = () => socket?.send(JSON.stringify({ type: 'auth', token: accessToken }));
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as { type?: string };
        if (message.type === 'hello') {
          attempt = 0;
          setStatus('connected');
        } else if (message.type === 'state') {
          onState(message as unknown as StateEventPayload);
        }
      };
      socket.onclose = () => {
        if (closed) return;
        setStatus('disconnected');
        // مهل تصاعدية: سيرفر متعثّر لا يُفيده ألف محاولة بالثانية.
        const delay = Math.min(1000 * 2 ** attempt, 30_000);
        attempt += 1;
        retry = setTimeout(open, delay);
      };
    };

    open();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [accessToken, onState]);

  return status;
}
