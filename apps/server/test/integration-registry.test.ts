import { describe, expect, it } from 'vitest';
import { IntegrationError, statusForKind } from '../src/integrations/errors.ts';
import { createIntegrationRegistry, missingCredentials } from '../src/integrations/registry.ts';
import { TUYA_INFO } from '../src/integrations/tuya/index.ts';

const CREDENTIALS = {
  accessId: 'id',
  accessSecret: 'secret',
  uid: 'u1',
  host: 'openapi.tuyaeu.com',
};

describe('سجلّ التكاملات', () => {
  it('يعرض بطاقات التكاملات المتاحة', () => {
    const registry = createIntegrationRegistry();
    expect(registry.available.map((info) => info.id)).toContain('tuya');
    expect(registry.infoFor('tuya')?.nameAr).toBe(TUYA_INFO.nameAr);
    expect(registry.infoFor('لا-يوجد')).toBeUndefined();
  });

  it('ينشئ تكاملاً من اعتمادات كاملة', () => {
    const integration = createIntegrationRegistry().create('tuya', {
      accountId: 'acc-1',
      credentials: CREDENTIALS,
    });
    expect(integration.info.id).toBe('tuya');
    integration.dispose();
  });

  it('تكامل غير معروف يرمي رسالة عربية بدل undefined صامت', () => {
    expect(() =>
      createIntegrationRegistry().create('غير-موجود', { accountId: 'a', credentials: {} }),
    ).toThrow(/لا نعرف تكاملاً/);
  });

  it('اعتمادات ناقصة تُذكر بأسمائها المعروضة', () => {
    const { uid: _omitted, ...partial } = CREDENTIALS;
    expect(() =>
      createIntegrationRegistry().create('tuya', { accountId: 'a', credentials: partial }),
    ).toThrow(/UID/);
  });

  it('missingCredentials تتجاهل الحقول غير المطلوبة والمسافات', () => {
    const fields = [
      { key: 'a', label: 'ألف', type: 'text' as const, options: [], required: true },
      { key: 'b', label: 'باء', type: 'text' as const, options: [], required: false },
    ];
    expect(missingCredentials(fields, { a: '  ', b: '' })).toEqual(['ألف']);
    expect(missingCredentials(fields, { a: 'x', b: '' })).toEqual([]);
  });
});

describe('أخطاء التكاملات', () => {
  it('تحمل تصنيفاً ورسالة عربية ولا تفقد الأصل', () => {
    const error = new IntegrationError('رسالة', {
      integrationId: 'tuya',
      code: 1010,
      rawMessage: 'token invalid',
      kind: 'auth',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.isAuthProblem).toBe(true);
    expect(error.rawMessage).toBe('token invalid');
  });

  it('كل تصنيف له رمز HTTP واحد لا يتكرّر تفسيره في المسارات', () => {
    expect(statusForKind('credentials')).toBe(401);
    expect(statusForKind('permission')).toBe(403);
    expect(statusForKind('quota')).toBe(429);
    expect(statusForKind('device')).toBe(409);
    expect(statusForKind('network')).toBe(502);
    expect(statusForKind('unknown')).toBe(502);
  });
});
