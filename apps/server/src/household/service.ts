import { createHash, randomBytes } from 'node:crypto';
import type {
  ActivityEntry,
  Invitation,
  InvitationInput,
  Member,
  PermissionsInput,
} from '@jisr/shared';
import type { MembershipRecord, Repositories } from '../db/repositories.ts';
import { ApiFailure } from '../errors.ts';
import { normalizeEmail } from '../db/prisma-repositories.ts';

/**
 * العائلة والصلاحيات (P6).
 *
 * **المنع هو الأصل**: العضو لا يرى جهازاً إلا بإذن صريح، ولا يتحكّم إلا
 * إن شمل الإذن التحكّم. لا «صلاحيات افتراضية» ولا وراثة.
 */
export interface HouseholdService {
  members(ownerId: string): Promise<Member[]>;
  removeMember(ownerId: string, membershipId: string): Promise<void>;
  setPermissions(
    ownerId: string,
    membershipId: string,
    input: PermissionsInput,
  ): Promise<Member>;
  invitations(ownerId: string): Promise<Invitation[]>;
  invite(ownerId: string, input: InvitationInput): Promise<Invitation>;
  revokeInvitation(ownerId: string, invitationId: string): Promise<void>;
  accept(userId: string, token: string): Promise<Member>;
  activity(ownerId: string, limit: number): Promise<ActivityEntry[]>;
}

/** صلاحية الدعوة — قصيرة عمداً: رمز معلّق للأبد سطح هجوم بلا فائدة. */
const INVITATION_TTL_DAYS = 7;

const MEMBER_NOT_FOUND = 'لم نعثر على هذا العضو — قد يكون أُزيل. حدّث القائمة.';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toMember(record: MembershipRecord): Member {
  return {
    id: record.id,
    email: record.memberEmail,
    displayName: record.memberName,
    label: record.label,
    role: record.role,
    permissions: record.permissions.map((permission) => ({
      deviceId: permission.deviceId,
      deviceName: permission.deviceName,
      canControl: permission.canControl,
    })),
    createdAt: record.createdAt.toISOString(),
  };
}

function toInvitation(record: {
  id: string;
  email: string;
  label: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}): Invitation {
  return {
    id: record.id,
    email: record.email,
    label: record.label,
    expiresAt: record.expiresAt.toISOString(),
    accepted: record.acceptedAt !== null,
    createdAt: record.createdAt.toISOString(),
  };
}

export function createHouseholdService(options: {
  repositories: Repositories;
  now?: () => Date;
}): HouseholdService {
  const { repositories } = options;
  const now = options.now ?? (() => new Date());

  async function membership(ownerId: string, membershipId: string): Promise<MembershipRecord> {
    const record = await repositories.memberships.find(ownerId, membershipId);
    if (!record) throw ApiFailure.notFound(MEMBER_NOT_FOUND);
    return record;
  }

  return {
    async members(ownerId) {
      return (await repositories.memberships.listForOwner(ownerId)).map(toMember);
    },

    async removeMember(ownerId, membershipId) {
      await membership(ownerId, membershipId);
      // الأذونات تسقط بالتتالي: إزالة عضو تعني إزالة وصوله كاملاً.
      await repositories.memberships.remove(membershipId);
    },

    async setPermissions(ownerId, membershipId, input) {
      await membership(ownerId, membershipId);
      await repositories.memberships.setPermissions(membershipId, input.permissions);
      return toMember(await membership(ownerId, membershipId));
    },

    async invitations(ownerId) {
      return (await repositories.invitations.listForOwner(ownerId)).map(toInvitation);
    },

    /**
     * الرمز يُعاد **مرة واحدة فقط** ويُخزَّن مجزّأً — كرمز التجديد.
     * المالك ينسخه ويرسله بنفسه؛ لا بريد صادر من السيرفر بعد.
     */
    async invite(ownerId, input) {
      const email = normalizeEmail(input.email);
      const owner = await repositories.users.findById(ownerId);
      if (owner && normalizeEmail(owner.email) === email) {
        throw new ApiFailure(400, 'SELF_INVITE', 'لا حاجة لدعوة نفسك — هذه مساحتك أصلاً.');
      }

      const token = randomBytes(24).toString('base64url');
      const record = await repositories.invitations.create({
        ownerId,
        email,
        label: input.label.trim(),
        tokenHash: hashToken(token),
        expiresAt: new Date(now().getTime() + INVITATION_TTL_DAYS * 86_400_000),
      });

      return { ...toInvitation(record), token };
    },

    async revokeInvitation(ownerId, invitationId) {
      await repositories.invitations.remove(ownerId, invitationId);
    },

    /**
     * القبول يشترط **تطابق البريد**: رمز يُعاد توجيهه لشخص آخر لا يفتح
     * له بيت أحد. الرسالة تقول ما العمل بدل «غير مصرّح».
     */
    async accept(userId, token) {
      const at = now();
      const invitation = await repositories.invitations.findValidByHash(hashToken(token), at);
      if (!invitation) {
        throw new ApiFailure(
          400,
          'INVALID_INVITATION',
          'الدعوة غير صالحة أو انتهت صلاحيتها — اطلب دعوة جديدة من صاحب الحساب.',
        );
      }

      const user = await repositories.users.findById(userId);
      if (!user || normalizeEmail(user.email) !== normalizeEmail(invitation.email)) {
        throw new ApiFailure(
          403,
          'INVITATION_EMAIL_MISMATCH',
          `هذه الدعوة موجّهة إلى ${invitation.email} — سجّل الدخول بنفس البريد الذي دُعيت به.`,
        );
      }
      if (invitation.ownerId === userId) {
        throw new ApiFailure(400, 'SELF_INVITE', 'هذه مساحتك أصلاً.');
      }

      const existing = (await repositories.memberships.listForOwner(invitation.ownerId)).find(
        (record) => record.memberId === userId,
      );
      if (existing) {
        await repositories.invitations.markAccepted(invitation.id, at);
        return toMember(existing);
      }

      const created = await repositories.memberships.create({
        ownerId: invitation.ownerId,
        memberId: userId,
        label: invitation.label,
      });
      await repositories.invitations.markAccepted(invitation.id, at);
      await repositories.activity.record({
        ownerId: invitation.ownerId,
        actorId: userId,
        action: 'join',
        detail: `انضمّ ${user.displayName} إلى المساحة`,
      });

      // عضو جديد يبدأ **بلا أي إذن**: المالك يمنحه ما يشاء صراحةً.
      return toMember(created);
    },

    async activity(ownerId, limit) {
      const rows = await repositories.activity.listForOwner(ownerId, limit);
      return rows.map((row) => ({
        actorName: row.actorName,
        action: row.action,
        detail: row.detail,
        ...(row.deviceId ? { deviceId: row.deviceId } : {}),
        at: row.at.toISOString(),
      }));
    },
  };
}
