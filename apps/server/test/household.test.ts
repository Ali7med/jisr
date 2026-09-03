import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildHarness, type TestHarness } from './support/app.ts';

let harness: TestHarness;
let owner: { authorization: string };
let member: { authorization: string };

const DEVICE_ID = 'fake:d1';
const MEMBER_EMAIL = 'family@jisr.test';

async function invite(email = MEMBER_EMAIL): Promise<string> {
  const response = await harness.app.inject({
    method: 'POST',
    url: '/household/invitations',
    headers: owner,
    payload: { email, label: 'أخي' },
  });
  return (response.json() as { token: string }).token;
}

async function joinAsMember(): Promise<string> {
  const token = await invite();
  const accepted = await harness.app.inject({
    method: 'POST',
    url: '/household/invitations/accept',
    headers: member,
    payload: { token },
  });
  return (accepted.json() as { id: string }).id;
}

/** المعرّف الداخلي للجهاز — الأذون تُضبط به لا بمعرّف العقد. */
async function internalDeviceId(): Promise<string> {
  const me = await harness.app.inject({ method: 'GET', url: '/auth/me', headers: owner });
  const ownerId = (me.json() as { id: string }).id;
  const [device] = await harness.repositories.devices.listVisible(ownerId);
  return device?.id ?? '';
}

beforeEach(async () => {
  harness = await buildHarness();
  owner = await harness.authHeader('owner@jisr.test');
  member = await harness.authHeader(MEMBER_EMAIL);

  await harness.app.inject({
    method: 'POST',
    url: '/accounts',
    headers: owner,
    payload: { integrationId: 'fake', label: 'بيتي', credentials: { token: 'سرّ' } },
  });
});

afterEach(async () => {
  await harness.app.close();
});

describe('الدعوات', () => {
  it('الرمز يظهر مرة واحدة عند الإنشاء ولا يعود في القائمة', async () => {
    const token = await invite();
    expect(token).toBeTruthy();

    const list = await harness.app.inject({
      method: 'GET',
      url: '/household/invitations',
      headers: owner,
    });
    expect(list.body).not.toContain(token);
  });

  it('رمز مُعاد توجيهه لبريد آخر يُرفض — والرسالة تقول ما العمل', async () => {
    const token = await invite('someone@else.test');
    const response = await harness.app.inject({
      method: 'POST',
      url: '/household/invitations/accept',
      headers: member,
      payload: { token },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'INVITATION_EMAIL_MISMATCH' });
    expect((response.json() as { message: string }).message).toMatch(/سجّل الدخول بنفس البريد/);
  });

  it('رمز غير صالح يُرفض برسالة عربية', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/household/invitations/accept',
      headers: member,
      payload: { token: 'رمز-مخترع' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'INVALID_INVITATION' });
  });

  it('دعوة النفس تُرفض بدل إنشاء عضوية بلا معنى', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/household/invitations',
      headers: owner,
      payload: { email: 'owner@jisr.test', label: 'أنا' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('الصلاحيات — معيار قبول P6', () => {
  it('عضو بلا أذون لا يرى شيئاً ولا يتحكّم: 404 لأنه لا يعرف بوجوده', async () => {
    await joinAsMember();

    const list = await harness.app.inject({ method: 'GET', url: '/devices', headers: member });
    expect((list.json() as { devices: unknown[] }).devices).toHaveLength(0);

    const command = await harness.app.inject({
      method: 'POST',
      url: `/devices/${DEVICE_ID}/commands`,
      headers: member,
      payload: { commands: [{ key: 'switch_1', value: true }] },
    });
    expect(command.statusCode).toBe(404);
  });

  it('إذن رؤية بلا تحكّم: يرى الجهاز ويُرفض أمره بـ 403 لا 404', async () => {
    const membershipId = await joinAsMember();
    await harness.app.inject({
      method: 'PUT',
      url: `/household/members/${membershipId}/permissions`,
      headers: owner,
      payload: { permissions: [{ deviceId: await internalDeviceId(), canControl: false }] },
    });

    const list = await harness.app.inject({ method: 'GET', url: '/devices', headers: member });
    expect((list.json() as { devices: unknown[] }).devices).toHaveLength(1);

    const command = await harness.app.inject({
      method: 'POST',
      url: `/devices/${DEVICE_ID}/commands`,
      headers: member,
      payload: { commands: [{ key: 'switch_1', value: true }] },
    });

    expect(command.statusCode).toBe(403);
    expect(command.json()).toMatchObject({ code: 'FORBIDDEN' });
    expect(harness.fake.executed).toHaveLength(0);
  });

  it('إذن تحكّم كامل: الأمر يمرّ', async () => {
    const membershipId = await joinAsMember();
    await harness.app.inject({
      method: 'PUT',
      url: `/household/members/${membershipId}/permissions`,
      headers: owner,
      payload: { permissions: [{ deviceId: await internalDeviceId(), canControl: true }] },
    });

    const command = await harness.app.inject({
      method: 'POST',
      url: `/devices/${DEVICE_ID}/commands`,
      headers: member,
      payload: { commands: [{ key: 'switch_1', value: true }] },
    });

    expect(command.statusCode).toBe(200);
    expect(harness.fake.executed).toHaveLength(1);
  });

  it('سحب الإذن يُعيد المنع فوراً', async () => {
    const membershipId = await joinAsMember();
    const deviceId = await internalDeviceId();
    const setTo = (canControl: boolean) =>
      harness.app.inject({
        method: 'PUT',
        url: `/household/members/${membershipId}/permissions`,
        headers: owner,
        payload: { permissions: canControl ? [{ deviceId, canControl: true }] : [] },
      });

    await setTo(true);
    await setTo(false);

    const list = await harness.app.inject({ method: 'GET', url: '/devices', headers: member });
    expect((list.json() as { devices: unknown[] }).devices).toHaveLength(0);
  });

  it('إزالة العضو تُنهي وصوله', async () => {
    const membershipId = await joinAsMember();
    await harness.app.inject({
      method: 'PUT',
      url: `/household/members/${membershipId}/permissions`,
      headers: owner,
      payload: { permissions: [{ deviceId: await internalDeviceId(), canControl: true }] },
    });
    await harness.app.inject({
      method: 'DELETE',
      url: `/household/members/${membershipId}`,
      headers: owner,
    });

    const command = await harness.app.inject({
      method: 'POST',
      url: `/devices/${DEVICE_ID}/commands`,
      headers: member,
      payload: { commands: [{ key: 'switch_1', value: true }] },
    });
    expect(command.statusCode).toBe(404);
  });

  it('عضو لا يدير مساحة المالك — قوائمه تخصّ مساحته هو', async () => {
    await joinAsMember();
    const members = await harness.app.inject({
      method: 'GET',
      url: '/household/members',
      headers: member,
    });
    expect((members.json() as { members: unknown[] }).members).toHaveLength(0);
  });
});

describe('سجلّ النشاط', () => {
  it('كل فعل تحكّم يُنسب لفاعله — بما فيه أفعال المالك', async () => {
    const membershipId = await joinAsMember();
    await harness.app.inject({
      method: 'PUT',
      url: `/household/members/${membershipId}/permissions`,
      headers: owner,
      payload: { permissions: [{ deviceId: await internalDeviceId(), canControl: true }] },
    });

    await harness.app.inject({
      method: 'POST',
      url: `/devices/${DEVICE_ID}/commands`,
      headers: owner,
      payload: { commands: [{ key: 'switch_1', value: false }] },
    });
    await harness.app.inject({
      method: 'POST',
      url: `/devices/${DEVICE_ID}/commands`,
      headers: member,
      payload: { commands: [{ key: 'switch_1', value: true }] },
    });

    const log = await harness.app.inject({
      method: 'GET',
      url: '/household/activity',
      headers: owner,
    });
    const entries = (log.json() as { entries: { actorName: string; action: string }[] }).entries;

    expect(entries.filter((entry) => entry.action === 'command')).toHaveLength(2);
    expect(entries.some((entry) => entry.action === 'join')).toBe(true);
  });
});
