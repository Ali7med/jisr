import { randomUUID } from 'node:crypto';
import type {
  ActivityRecord,
  ActivityRepository,
  InvitationRecord,
  InvitationRepository,
  MembershipRecord,
  MembershipRepository,
  UserRecord,
} from '../../src/db/repositories.ts';

/**
 * مستودعات العائلة في الذاكرة.
 *
 * تحتاج قارئاً للمستخدمين والأجهزة كي تُثري السجلّات بالأسماء تماماً
 * كما يفعل نظيرها في Prisma — تطابق السلوك هو ما يجعل الاختبار ذا معنى.
 */
export function createHouseholdMemory(lookup: {
  user(id: string): UserRecord | null;
  deviceName(id: string): string;
}) {
  const memberships = new Map<string, MembershipRecord>();
  const invitations = new Map<string, InvitationRecord & { tokenHash: string }>();
  const activity: (ActivityRecord & { ownerId: string })[] = [];

  const membershipRepository: MembershipRepository = {
    async listForOwner(ownerId) {
      return [...memberships.values()].filter((row) => row.ownerId === ownerId);
    },
    async find(ownerId, membershipId) {
      const row = memberships.get(membershipId);
      return row && row.ownerId === ownerId ? row : null;
    },
    async create(input) {
      const member = lookup.user(input.memberId);
      const record: MembershipRecord = {
        id: randomUUID(),
        ownerId: input.ownerId,
        memberId: input.memberId,
        memberEmail: member?.email ?? '',
        memberName: member?.displayName ?? '',
        label: input.label,
        role: 'member',
        createdAt: new Date(),
        permissions: [],
      };
      memberships.set(record.id, record);
      return record;
    },
    async remove(membershipId) {
      memberships.delete(membershipId);
    },
    async setPermissions(membershipId, permissions) {
      const current = memberships.get(membershipId);
      if (!current) return;
      memberships.set(membershipId, {
        ...current,
        permissions: permissions.map((permission) => ({
          deviceId: permission.deviceId,
          deviceName: lookup.deviceName(permission.deviceId),
          canControl: permission.canControl,
        })),
      });
    },
  };

  const invitationRepository: InvitationRepository = {
    async listForOwner(ownerId) {
      return [...invitations.values()].filter((row) => row.ownerId === ownerId);
    },
    async create(input) {
      const record = {
        id: randomUUID(),
        ownerId: input.ownerId,
        email: input.email,
        label: input.label,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        acceptedAt: null,
        createdAt: new Date(),
      };
      invitations.set(record.id, record);
      return record;
    },
    async findValidByHash(tokenHash, now) {
      const row = [...invitations.values()].find((item) => item.tokenHash === tokenHash);
      if (!row || row.acceptedAt !== null || row.expiresAt <= now) return null;
      return row;
    },
    async markAccepted(id, at) {
      const row = invitations.get(id);
      if (row) invitations.set(id, { ...row, acceptedAt: at });
    },
    async remove(ownerId, id) {
      const row = invitations.get(id);
      if (row?.ownerId === ownerId) invitations.delete(id);
    },
  };

  const activityRepository: ActivityRepository = {
    async record(input) {
      activity.push({
        ownerId: input.ownerId,
        actorName: lookup.user(input.actorId)?.displayName ?? '',
        action: input.action,
        detail: input.detail,
        deviceId: input.deviceId ?? null,
        at: new Date(),
      });
    },
    async listForOwner(ownerId, limit) {
      return activity
        .filter((row) => row.ownerId === ownerId)
        .slice(-limit)
        .reverse();
    },
  };

  return { memberships, membershipRepository, invitationRepository, activityRepository };
}
