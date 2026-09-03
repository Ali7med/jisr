import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IntegrationError } from '../src/integrations/errors.ts';
import { buildHarness, type TestHarness } from './support/app.ts';

let harness: TestHarness;
let auth: { authorization: string };

const CREDENTIALS = { token: 'سرّ', note: 'بيت' };

async function createAccount(overrides: Record<string, unknown> = {}) {
  return harness.app.inject({
    method: 'POST',
    url: '/accounts',
    headers: auth,
    payload: { integrationId: 'fake', label: 'بيتي', credentials: CREDENTIALS, ...overrides },
  });
}

beforeEach(async () => {
  harness = await buildHarness();
  auth = await harness.authHeader();
});

afterEach(async () => {
  await harness.app.close();
});

describe('GET /integrations', () => {
  it('يعرض الشركات بحقولها كي يُبنى النموذج بلا شاشة مخصّصة', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/integrations', headers: auth });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { integrations: { id: string; fields: unknown[] }[] };
    expect(body.integrations[0]?.id).toBe('fake');
    expect(body.integrations[0]?.fields).toHaveLength(2);
  });

  it('يرفض بلا توكن برسالة عربية', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/integrations' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    expect((response.json() as { message: string }).message).toMatch(/تسجيل دخول/);
  });
});

describe('POST /accounts', () => {
  it('يتحقّق ثم يحفظ ثم يزامن الأجهزة', async () => {
    const response = await createAccount();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      integrationId: 'fake',
      label: 'بيتي',
      status: 'active',
      deviceCount: 1,
    });
  });

  it('لا يعيد الاعتمادات أبداً في أي استجابة', async () => {
    await createAccount();
    const list = await harness.app.inject({ method: 'GET', url: '/accounts', headers: auth });

    expect(list.body).not.toContain('سرّ');
    expect(list.body).not.toContain('token');
  });

  it('حقل مطلوب ناقص يعطي 400 يذكر اسم الحقل المعروض', async () => {
    const response = await createAccount({ credentials: { note: 'بلا رمز' } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'MISSING_CREDENTIALS' });
    expect((response.json() as { message: string }).message).toMatch(/الرمز/);
  });

  it('شركة غير معروفة تعطي 404 لا 500', async () => {
    const response = await createAccount({ integrationId: 'لا-يوجد' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'UNKNOWN_INTEGRATION' });
  });

  it('اعتمادات ترفضها الشركة لا تُحفظ إطلاقاً', async () => {
    harness.fake.verifyFailsWith = new IntegrationError('التوقيع غير صالح.', {
      integrationId: 'fake',
      kind: 'credentials',
    });

    const response = await createAccount();
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'INTEGRATION_CREDENTIALS' });

    const list = await harness.app.inject({ method: 'GET', url: '/accounts', headers: auth });
    expect((list.json() as { accounts: unknown[] }).accounts).toHaveLength(0);
  });
});

describe('دورة حياة الحساب', () => {
  it('المزامنة تُسقط ما اختفى وتضيف ما ظهر', async () => {
    const created = await createAccount();
    const accountId = (created.json() as { id: string }).id;

    harness.fake.devices = [
      { nativeId: 'd2', name: 'مروحة', category: 'fan', online: false },
      { nativeId: 'd3', name: 'مقبس', category: 'socket', online: true },
    ];

    const response = await harness.app.inject({
      method: 'POST',
      url: `/accounts/${accountId}/sync`,
      headers: auth,
    });

    expect(response.json()).toMatchObject({ deviceCount: 2, added: 2, removed: 1 });
  });

  it('فشل مصادقة أثناء المزامنة يُعلِّم الحساب كي يظهر التنبيه', async () => {
    const created = await createAccount();
    const accountId = (created.json() as { id: string }).id;

    harness.fake.failWith = new IntegrationError('انتهت الجلسة.', {
      integrationId: 'fake',
      kind: 'auth',
    });

    const sync = await harness.app.inject({
      method: 'POST',
      url: `/accounts/${accountId}/sync`,
      headers: auth,
    });
    expect(sync.statusCode).toBe(401);

    harness.fake.failWith = null;
    const list = await harness.app.inject({ method: 'GET', url: '/accounts', headers: auth });
    expect((list.json() as { accounts: { status: string }[] }).accounts[0]?.status).toBe(
      'invalid_credentials',
    );
  });

  it('تعديل التسمية لا يلمس الاعتمادات', async () => {
    const created = await createAccount();
    const accountId = (created.json() as { id: string }).id;

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/accounts/${accountId}`,
      headers: auth,
      payload: { label: 'بيت العائلة' },
    });

    expect(response.json()).toMatchObject({ label: 'بيت العائلة', deviceCount: 1 });
  });

  it('الحذف يزيل الحساب وأجهزته', async () => {
    const created = await createAccount();
    const accountId = (created.json() as { id: string }).id;

    const response = await harness.app.inject({
      method: 'DELETE',
      url: `/accounts/${accountId}`,
      headers: auth,
    });
    expect(response.statusCode).toBe(204);

    const devices = await harness.app.inject({ method: 'GET', url: '/devices', headers: auth });
    expect((devices.json() as { devices: unknown[] }).devices).toHaveLength(0);
  });

  it('حساب مستخدم آخر «غير موجود» لا «ممنوع»', async () => {
    const created = await createAccount();
    const accountId = (created.json() as { id: string }).id;
    const other = await harness.authHeader('other@jisr.test');

    const response = await harness.app.inject({
      method: 'DELETE',
      url: `/accounts/${accountId}`,
      headers: other,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('حارس الصلاحية (الدراسة § 7)', () => {
  it('انتهاء اشتراك المشروع يُعلّم الحساب expired ويردّ 402', async () => {
    const created = await createAccount();
    const accountId = (created.json() as { id: string }).id;

    harness.fake.failWith = new IntegrationError(
      'انتهت فترة التجربة المجانية للمشروع — جدّدها من لوحة الشركة.',
      { integrationId: 'fake', kind: 'expired' },
    );

    const sync = await harness.app.inject({
      method: 'POST',
      url: `/accounts/${accountId}/sync`,
      headers: auth,
    });
    expect(sync.statusCode).toBe(402);
    expect(sync.json()).toMatchObject({ code: 'INTEGRATION_EXPIRED' });

    harness.fake.failWith = null;
    const list = await harness.app.inject({ method: 'GET', url: '/accounts', headers: auth });
    expect((list.json() as { accounts: { status: string }[] }).accounts[0]?.status).toBe('expired');
  });

  it('عطل عابر (حصّة أو شبكة) لا يُعلّم الحساب — التنبيه الكاذب أسوأ من لا تنبيه', async () => {
    const created = await createAccount();
    const accountId = (created.json() as { id: string }).id;

    harness.fake.failWith = new IntegrationError('تجاوزت الحصّة لهذا الشهر.', {
      integrationId: 'fake',
      kind: 'quota',
    });
    await harness.app.inject({
      method: 'POST',
      url: `/accounts/${accountId}/sync`,
      headers: auth,
    });

    harness.fake.failWith = null;
    const list = await harness.app.inject({ method: 'GET', url: '/accounts', headers: auth });
    expect((list.json() as { accounts: { status: string }[] }).accounts[0]?.status).toBe('active');
  });
});
