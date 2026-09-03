import type { PrismaClient } from '@prisma/client';
import type { MemberRole } from '@jisr/shared';
import type {
  ActivityRepository,
  InvitationRecord,
  InvitationRepository,
  MembershipRecord,
  MembershipRepository,
} from './repositories.ts';

interface MembershipRow {
  id: string;
  ownerId: string;
  memberId: string;
  label: string;
  role: string;
  createdAt: Date;
  member: { email: string; displayName: string };
  permissions: { deviceId: string; canControl: boolean; device: { name: string } }[];
}

function toMembership(row: MembershipRow): MembershipRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    memberId: row.memberId,
    memberEmail: row.member.email,
    memberName: row.member.displayName,
    label: row.label,
    role: row.role as MemberRole,
    createdAt: row.createdAt,
    permissions: row.permissions.map((permission) => ({
      deviceId: permission.deviceId,
      deviceName: permission.device.name,
      canControl: permission.canControl,
    })),
  };
}

const WITH_DETAILS = {
  member: { select: { email: true, displayName: true } },
  permissions: { include: { device: { select: { name: true } } } },
} as const;

export function createMembershipRepository(prisma: PrismaClient): MembershipRepository {
  return {
    async listForOwner(ownerId) {
      const rows = await prisma.membership.findMany({
        where: { ownerId },
        include: WITH_DETAILS,
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toMembership);
    },

    async find(ownerId, membershipId) {
      const row = await prisma.membership.findFirst({
        where: { id: membershipId, ownerId },
        include: WITH_DETAILS,
      });
      return row ? toMembership(row) : null;
    },

    async create(input) {
      const row = await prisma.membership.create({
        data: { ...input, role: 'member' },
        include: WITH_DETAILS,
      });
      return toMembership(row);
    },

    async remove(membershipId) {
      await prisma.membership.delete({ where: { id: membershipId } });
    },

    /**
     * استبدال كامل لا تعديل جزئي: «اضبط أذونات فلان» عملية واحدة ذرّية،
     * والتعديل الجزئي يترك أذوناً منسية لأجهزة حُذفت من القائمة.
     */
    async setPermissions(membershipId, permissions) {
      await prisma.$transaction([
        prisma.devicePermission.deleteMany({ where: { membershipId } }),
        prisma.devicePermission.createMany({
          data: permissions.map((permission) => ({ membershipId, ...permission })),
        }),
      ]);
    },
  };
}

function toInvitation(row: {
  id: string;
  ownerId: string;
  email: string;
  label: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}): InvitationRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    email: row.email,
    label: row.label,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    createdAt: row.createdAt,
  };
}

export function createInvitationRepository(prisma: PrismaClient): InvitationRepository {
  return {
    async listForOwner(ownerId) {
      const rows = await prisma.invitation.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toInvitation);
    },

    async create(input) {
      return toInvitation(await prisma.invitation.create({ data: input }));
    },

    async findValidByHash(tokenHash, now) {
      const row = await prisma.invitation.findUnique({ where: { tokenHash } });
      if (!row || row.acceptedAt !== null || row.expiresAt <= now) return null;
      return toInvitation(row);
    },

    async markAccepted(id, at) {
      await prisma.invitation.update({ where: { id }, data: { acceptedAt: at } });
    },

    async remove(ownerId, id) {
      await prisma.invitation.deleteMany({ where: { id, ownerId } });
    },
  };
}

export function createActivityRepository(prisma: PrismaClient): ActivityRepository {
  return {
    async record(input) {
      await prisma.activityEntry.create({
        data: {
          ownerId: input.ownerId,
          actorId: input.actorId,
          deviceId: input.deviceId ?? null,
          action: input.action,
          detail: input.detail,
        },
      });
    },

    async listForOwner(ownerId, limit) {
      const rows = await prisma.activityEntry.findMany({
        where: { ownerId },
        orderBy: { at: 'desc' },
        take: limit,
        include: { actor: { select: { displayName: true } } },
      });
      return rows.map((row) => ({
        actorName: row.actor.displayName,
        action: row.action,
        detail: row.detail,
        deviceId: row.deviceId,
        at: row.at,
      }));
    },
  };
}
