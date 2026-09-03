import type {
  Account,
  AccountList,
  ApiError,
  AuthSession,
  AuthTokens,
  Automation,
  AutomationInput,
  AutomationList,
  AutomationRunList,
  CommandResult,
  DeviceList,
  DeviceSnapshot,
  HistoryResponse,
  IntegrationList,
  NotificationList,
  Scene,
  SceneInput,
  SceneList,
  SceneRunResult,
  SyncResult,
} from '@jisr/shared';

/**
 * عميل سيرفر جسر للمتصفّح.
 *
 * الأنواع مستوردة من `@jisr/shared` — **نفس المخطّطات التي يتحقّق بها
 * السيرفر** (ADR-0010)، فتغيير العقد يكسر البناء هنا بدل أن يكسر الصفحة
 * عند المستخدم.
 */
export const SERVER_URL = process.env['NEXT_PUBLIC_JISR_SERVER_URL'] ?? 'http://localhost:3000';

export class ApiFailure extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiFailure';
    this.code = code;
    this.status = status;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface ApiOptions {
  tokens: Tokens | null;
  /** يُستدعى بعد تجديد ناجح، وبـ `null` حين تنتهي الجلسة فعلاً. */
  onTokens: (tokens: Tokens | null) => void;
}

const OFFLINE = 'تعذّر الوصول إلى خادم جسر. تحقّق من اتصالك أو من عمل الخادم.';

export function createApi(options: ApiOptions) {
  async function call<T>(
    path: string,
    init: RequestInit = {},
    allowRefresh = true,
  ): Promise<T> {
    const tokens = options.tokens;

    let response: Response;
    try {
      response = await fetch(`${SERVER_URL}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new ApiFailure(OFFLINE, 'OFFLINE', 0);
    }

    // رمز منتهٍ: نجدّد مرة واحدة ثم نعيد الطلب.
    if (response.status === 401 && allowRefresh && tokens) {
      const renewed = await refresh(tokens);
      if (renewed) {
        options.onTokens(renewed);
        return createApi({ ...options, tokens: renewed }).call<T>(path, init, false);
      }
      options.onTokens(null);
    }

    if (response.status === 204) return undefined as T;

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = (body ?? {}) as Partial<ApiError>;
      throw new ApiFailure(
        error.message ?? 'تعذّر إتمام الطلب. حاول بعد قليل.',
        error.code ?? `HTTP_${response.status}`,
        response.status,
      );
    }
    return body as T;
  }

  async function refresh(tokens: Tokens): Promise<Tokens | null> {
    try {
      const response = await fetch(`${SERVER_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (!response.ok) return null;

      const renewed = (await response.json()) as AuthTokens;
      return { accessToken: renewed.accessToken, refreshToken: renewed.refreshToken };
    } catch {
      // انقطاع شبكة ليس انتهاء جلسة.
      return null;
    }
  }

  const post = <T>(path: string, body?: unknown) =>
    call<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

  return {
    call,

    register: (email: string, password: string, displayName: string) =>
      post<AuthSession>('/auth/register', { email, password, displayName }),
    login: (email: string, password: string) =>
      post<AuthSession>('/auth/login', { email, password }),
    logout: (refreshToken: string) => post<void>('/auth/logout', { refreshToken }),

    integrations: () => call<IntegrationList>('/integrations'),
    accounts: () => call<AccountList>('/accounts'),
    createAccount: (input: {
      integrationId: string;
      label: string;
      credentials: Record<string, string>;
    }) => post<Account>('/accounts', input),
    deleteAccount: (id: string) => call<void>(`/accounts/${id}`, { method: 'DELETE' }),
    syncAccount: (id: string) => post<SyncResult>(`/accounts/${id}/sync`),

    devices: () => call<DeviceList>('/devices'),
    device: (id: string) => call<DeviceSnapshot>(`/devices/${encodeURIComponent(id)}`),
    command: (id: string, key: string, value: unknown) =>
      post<CommandResult>(`/devices/${encodeURIComponent(id)}/commands`, {
        commands: [{ key, value }],
      }),
    history: (id: string, key: string, hours: number) => {
      const end = new Date();
      const start = new Date(end.getTime() - hours * 3_600_000);
      const query = new URLSearchParams({
        keys: key,
        start: start.toISOString(),
        end: end.toISOString(),
        limit: '500',
      });
      return call<HistoryResponse>(
        `/devices/${encodeURIComponent(id)}/history?${query.toString()}`,
      );
    },

    automations: () => call<AutomationList>('/automations'),
    createAutomation: (input: AutomationInput) => post<Automation>('/automations', input),
    updateAutomation: (id: string, input: AutomationInput) =>
      call<Automation>(`/automations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    deleteAutomation: (id: string) => call<void>(`/automations/${id}`, { method: 'DELETE' }),
    /** سجلّ التنفيذ — به يصير «لماذا لم تعمل أتمتتي؟» سؤالاً له جواب (ADR-0015). */
    automationRuns: (id: string) => call<AutomationRunList>(`/automations/${id}/runs`),

    scenes: () => call<SceneList>('/scenes'),
    createScene: (input: SceneInput) => post<Scene>('/scenes', input),
    deleteScene: (id: string) => call<void>(`/scenes/${id}`, { method: 'DELETE' }),
    /** لا يرمي حين يفشل جهاز: النجاح الجزئي يعود في `failures` كي تُعرض الأسباب. */
    runScene: (id: string) => post<SceneRunResult>(`/scenes/${id}/run`),

    notifications: () => call<NotificationList>('/notifications'),
    markNotificationsRead: () => post<void>('/notifications/read'),
  };
}

export type Api = ReturnType<typeof createApi>;
