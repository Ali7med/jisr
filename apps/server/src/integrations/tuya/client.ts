import { IntegrationError } from '../errors.ts';
import { baseUrlOf, TuyaPaths, TuyaTuning, type TuyaDataCenter } from './config.ts';
import { tuyaError, tuyaMalformedError, tuyaNetworkError } from './errors.ts';
import { signedHeaders } from './signer.ts';

/** توكن وصول Tuya مع لحظة انتهائه المحسوبة محلياً. */
export interface TuyaToken {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** قد يعود فارغاً في وضع المشروع (simple mode). */
  readonly uid: string;
  readonly expiresAtMs: number;
}

export interface TuyaClientOptions {
  readonly accessId: string;
  readonly accessSecret: string;
  readonly dataCenter: TuyaDataCenter;
  /** يُحقن في الاختبارات — لا شبكة حقيقية فيها. */
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

export interface TuyaClient {
  get(path: string, query?: Readonly<Record<string, string>>): Promise<unknown>;
  post(path: string, body?: Record<string, unknown>): Promise<unknown>;
  dispose(): void;
}

/**
 * عميل HTTP موقّع لـ Tuya Cloud OpenAPI. مسؤولياته الثلاث:
 * 1. توقيع كل طلب (HMAC-SHA256).
 * 2. جلب التوكن وتجديده، مع منع الطلبات المتوازية من جلبه مرّات.
 * 3. فكّ ظرف `{success, code, msg, result}` ورمي `IntegrationError`.
 */
export function createTuyaClient(options: TuyaClientOptions): TuyaClient {
  const { accessId, accessSecret, dataCenter } = options;
  const doFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  const baseUrl = baseUrlOf(dataCenter);

  let token: TuyaToken | null = null;
  let tokenInFlight: Promise<TuyaToken> | null = null;

  function needsRefresh(current: TuyaToken): boolean {
    return now() > current.expiresAtMs - TuyaTuning.tokenRefreshMarginMs;
  }

  async function request(
    method: string,
    path: string,
    query: Readonly<Record<string, string>> | undefined,
    headers: Record<string, string>,
    body: string | undefined,
  ): Promise<unknown> {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await doFetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(TuyaTuning.requestTimeoutMs),
      });
    } catch (error) {
      // Tuya ترسل 200 مع success=false، فما يصل هنا هو انقطاع شبكة فعلي.
      throw tuyaNetworkError(error instanceof Error ? error.message : undefined);
    }

    const text = await response.text();
    return unwrap(text);
  }

  /** يفكّ ظرف Tuya ويرمي عند الفشل. */
  function unwrap(text: string): unknown {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw tuyaMalformedError('استجابة غير مفهومة من خوادم Tuya.');
    }

    if (typeof data !== 'object' || data === null) {
      throw tuyaMalformedError('استجابة غير متوقعة من خوادم Tuya.');
    }

    const envelope = data as { success?: unknown; result?: unknown; code?: unknown; msg?: unknown };
    if (envelope.success === true) return envelope.result;

    throw tuyaError(
      typeof envelope.code === 'number' ? envelope.code : undefined,
      typeof envelope.msg === 'string' ? envelope.msg : undefined,
    );
  }

  /**
   * نجلب توكناً جديداً بدل استخدام `refresh_token`: في وضع المشروع
   * الاستدعاء رخيص ولا يحتاج حالة سابقة، وهذا يتجنّب حالة عالقة عند
   * انتهاء `refresh_token` بدوره.
   */
  async function fetchToken(): Promise<TuyaToken> {
    const path = TuyaPaths.token;
    const query = { grant_type: '1' };
    const timestampMs = now();

    const result = await request(
      'GET',
      path,
      query,
      signedHeaders({ clientId: accessId, secret: accessSecret, timestampMs, method: 'GET', path, query }),
      undefined,
    );

    if (typeof result !== 'object' || result === null) {
      throw tuyaMalformedError('استجابة توكن غير متوقعة من Tuya.');
    }
    const raw = result as Record<string, unknown>;
    const accessToken = typeof raw['access_token'] === 'string' ? raw['access_token'] : '';
    if (!accessToken) {
      throw tuyaMalformedError('لم يُرجع Tuya توكن وصول صالحاً.');
    }

    const expireSeconds = typeof raw['expire_time'] === 'number' ? raw['expire_time'] : 7200;
    const fresh: TuyaToken = {
      accessToken,
      refreshToken: typeof raw['refresh_token'] === 'string' ? raw['refresh_token'] : '',
      uid: typeof raw['uid'] === 'string' ? raw['uid'] : '',
      expiresAtMs: now() + expireSeconds * 1000,
    };
    token = fresh;
    return fresh;
  }

  async function ensureToken(): Promise<TuyaToken> {
    const current = token;
    if (current && !needsRefresh(current)) return current;

    // طلبات متوازية كثيرة تصل هنا معاً؛ نجلب التوكن مرة واحدة ونشاركه.
    tokenInFlight ??= fetchToken().finally(() => {
      tokenInFlight = null;
    });
    return tokenInFlight;
  }

  async function send(
    method: string,
    path: string,
    query: Readonly<Record<string, string>> | undefined,
    body: Record<string, unknown> | undefined,
    allowRetry = true,
  ): Promise<unknown> {
    const current = await ensureToken();
    const bodyText = body === undefined ? undefined : JSON.stringify(body);

    try {
      return await request(
        method,
        path,
        query,
        signedHeaders({
          clientId: accessId,
          secret: accessSecret,
          timestampMs: now(),
          method,
          path,
          query,
          body: bodyText,
          accessToken: current.accessToken,
        }),
        bodyText,
      );
    } catch (error) {
      // توكن منتهٍ رغم حسابنا المحلي: نجدّده ونعيد المحاولة مرة واحدة فقط.
      if (error instanceof IntegrationError && error.isAuthProblem && allowRetry) {
        token = null;
        return send(method, path, query, body, false);
      }
      throw error;
    }
  }

  return {
    get: (path, query) => send('GET', path, query, undefined),
    post: (path, body) => send('POST', path, undefined, body),
    dispose: () => {
      token = null;
    },
  };
}
