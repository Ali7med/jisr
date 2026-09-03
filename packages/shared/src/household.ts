import { Type, type Static } from '@sinclair/typebox';

/**
 * العائلة والصلاحيات (P6).
 *
 * نموذج «المساحة»: أجهزة كل مستخدم تعيش في مساحته، وقد يدعو غيره إليها.
 * **المنع هو الأصل**: العضو لا يرى جهازاً إلا إن مُنح إذناً عليه، ولا
 * يتحكّم إلا إن كان الإذن يشمل التحكّم.
 */

export const MemberRole = Type.Union([Type.Literal('owner'), Type.Literal('member')], {
  $id: 'MemberRole',
});
export type MemberRole = Static<typeof MemberRole>;

/** إذن عضو على جهاز. */
export const DevicePermission = Type.Object(
  {
    deviceId: Type.String({ minLength: 1 }),
    deviceName: Type.String(),
    canControl: Type.Boolean(),
  },
  { $id: 'DevicePermission', additionalProperties: false },
);
export type DevicePermission = Static<typeof DevicePermission>;

/** عضو في مساحة المالك، كما يراه المالك. */
export const Member = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    email: Type.String(),
    displayName: Type.String(),
    label: Type.String(),
    role: Type.Ref(MemberRole),
    permissions: Type.Array(Type.Ref(DevicePermission)),
    createdAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'Member', additionalProperties: false },
);
export type Member = Static<typeof Member>;

export const MemberList = Type.Object(
  { members: Type.Array(Type.Ref(Member)) },
  { $id: 'MemberList', additionalProperties: false },
);
export type MemberList = Static<typeof MemberList>;

/** ما يضبطه المالك لعضو: قائمة الأجهزة المسموحة صراحةً. */
export const PermissionsInput = Type.Object(
  {
    permissions: Type.Array(
      Type.Object(
        { deviceId: Type.String({ minLength: 1 }), canControl: Type.Boolean() },
        { additionalProperties: false },
      ),
    ),
  },
  { $id: 'PermissionsInput', additionalProperties: false },
);
export type PermissionsInput = Static<typeof PermissionsInput>;

export const InvitationInput = Type.Object(
  {
    email: Type.String({ format: 'email' }),
    label: Type.String({ maxLength: 40 }),
  },
  { $id: 'InvitationInput', additionalProperties: false },
);
export type InvitationInput = Static<typeof InvitationInput>;

/**
 * الدعوة كما تُعاد للمالك.
 *
 * `token` يظهر **مرة واحدة عند الإنشاء فقط** — يُخزَّن مجزّأً كرمز
 * التجديد، فتسريب القاعدة لا يمنح دخولاً إلى مساحة أحد. المالك ينسخه
 * ويرسله بنفسه (لا بريد صادر بعد).
 */
export const Invitation = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    email: Type.String(),
    label: Type.String(),
    expiresAt: Type.String({ format: 'date-time' }),
    accepted: Type.Boolean(),
    token: Type.Optional(Type.String()),
    createdAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'Invitation', additionalProperties: false },
);
export type Invitation = Static<typeof Invitation>;

export const InvitationList = Type.Object(
  { invitations: Type.Array(Type.Ref(Invitation)) },
  { $id: 'InvitationList', additionalProperties: false },
);
export type InvitationList = Static<typeof InvitationList>;

export const AcceptInvitationRequest = Type.Object(
  { token: Type.String({ minLength: 1 }) },
  { $id: 'AcceptInvitationRequest', additionalProperties: false },
);
export type AcceptInvitationRequest = Static<typeof AcceptInvitationRequest>;

/** سطر في سجلّ النشاط: مَن فعل ماذا ومتى. */
export const ActivityEntry = Type.Object(
  {
    actorName: Type.String(),
    action: Type.String(),
    detail: Type.String(),
    deviceId: Type.Optional(Type.String()),
    at: Type.String({ format: 'date-time' }),
  },
  { $id: 'ActivityEntry', additionalProperties: false },
);
export type ActivityEntry = Static<typeof ActivityEntry>;

export const ActivityList = Type.Object(
  { entries: Type.Array(Type.Ref(ActivityEntry)) },
  { $id: 'ActivityList', additionalProperties: false },
);
export type ActivityList = Static<typeof ActivityList>;
