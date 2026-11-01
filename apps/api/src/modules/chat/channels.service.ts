import {
  canAccessChannel,
  canAddChannelMember,
  canCreateChannel,
  canManageChannel,
  canRemoveChannelMember,
  type Channel,
  type ChannelMember,
  type ChannelSummary,
  type CreateChannelInput,
  isWorkspaceAdmin,
  rooms,
  SERVER_EVENTS,
  slugify,
  type UpdateChannelInput,
} from '@syncspace/shared'

import { AppError, badRequest } from '@/lib/errors'
import { authorize, toChannelContext } from '@/lib/permissions'
import { getPrisma } from '@/lib/prisma'
import { isUniqueViolation } from '@/lib/prisma-errors'
import { emptyToNull } from '@/utils/zod'
import { realtime } from '@/sockets/realtime'
import type { WorkspaceAccess } from '@/modules/workspaces/workspace-access'

import { channelAudience, type ChannelAccess, loadChannel } from './destinations'
import { channelSelect, type ChannelRow, toChannelDto, toPublicUser } from './presenters'
import { channelUnreadCounts } from './read-state.service'

/** Channels the viewer may see, with per-viewer membership and unread state. */
export async function listChannels(workspace: WorkspaceAccess): Promise<ChannelSummary[]> {
  const { actor, workspaceId } = workspace
  const admin = isWorkspaceAdmin(actor)
  const channels = await getPrisma().channel.findMany({
    where: {
      workspaceId,
      // Admins see every private channel (oversight); others only those they belong to.
      ...(!admin && { OR: [{ type: 'PUBLIC' }, { members: { some: { userId: actor.userId } } }] }),
    },
    select: {
      ...channelSelect,
      members: { where: { userId: actor.userId }, select: { userId: true } },
    },
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
  })

  const visible = channels.filter((channel) =>
    canAccessChannel(actor, toChannelContext(channel, channel.members.length > 0)),
  )
  const unread = await channelUnreadCounts(
    actor.userId,
    workspace.membership.joinedAt,
    visible.map((channel) => channel.id),
  )

  return visible.map((channel) => {
    const state = unread.get(channel.id)
    return {
      ...toChannelDto(channel),
      isMember: channel.type === 'PUBLIC' || channel.members.length > 0,
      unreadCount: state?.unread ?? 0,
      lastReadAt: (state?.lastReadAt ?? workspace.membership.joinedAt).toISOString(),
      lastReadMessageId: state?.lastReadMessageId ?? null,
    }
  })
}

/** First free slug among base, base-2, base-3 … within the workspace. */
async function availableSlug(workspaceId: string, name: string, excludeId?: string) {
  const base = slugify(name) || 'channel'
  const taken = new Set(
    (
      await getPrisma().channel.findMany({
        where: {
          workspaceId,
          slug: { startsWith: base },
          ...(excludeId && { id: { not: excludeId } }),
        },
        select: { slug: true },
      })
    ).map((channel) => channel.slug),
  )
  if (!taken.has(base)) return base
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base.slice(0, 44)}-${String(suffix)}`
    if (!taken.has(candidate)) return candidate
  }
}

async function broadcastChannel(event: 'created' | 'updated', channel: ChannelRow) {
  realtime.emit(
    await channelAudience(channel),
    event === 'created' ? SERVER_EVENTS.CHANNEL_CREATED : SERVER_EVENTS.CHANNEL_UPDATED,
    { channel: toChannelDto(channel) },
  )
}

export async function createChannel(
  workspace: WorkspaceAccess,
  input: CreateChannelInput,
): Promise<ChannelSummary> {
  authorize(canCreateChannel(workspace.actor), 'You cannot create channels in this workspace.')
  const prisma = getPrisma()
  const { workspaceId, actor } = workspace

  // Slug races are possible between the availability check and the insert; retry.
  for (let attempt = 0; ; attempt += 1) {
    const slug = await availableSlug(workspaceId, input.name)
    try {
      const channel = await prisma.$transaction(async (tx) => {
        const created = await tx.channel.create({
          data: {
            workspaceId,
            name: input.name,
            slug,
            description: emptyToNull(input.description),
            type: input.type,
            createdById: actor.userId,
          },
          select: { id: true },
        })
        // The creator of a private channel is its first member.
        if (input.type === 'PRIVATE') {
          await tx.channelMember.create({
            data: { channelId: created.id, workspaceId, userId: actor.userId },
          })
        }
        return tx.channel.findUniqueOrThrow({ where: { id: created.id }, select: channelSelect })
      })
      await broadcastChannel('created', channel)
      return {
        ...toChannelDto(channel),
        isMember: true,
        unreadCount: 0,
        lastReadAt: channel.createdAt.toISOString(),
        lastReadMessageId: null,
      }
    } catch (error) {
      if (isUniqueViolation(error, 'slug') && attempt < 3) continue
      throw error
    }
  }
}

export async function updateChannel(
  workspace: WorkspaceAccess,
  channelId: string,
  input: UpdateChannelInput,
): Promise<Channel> {
  const access = await loadChannel(workspace, channelId)
  authorize(
    canManageChannel(workspace.actor, access.context),
    'Only workspace owners and admins can edit channels.',
  )

  const data: { name?: string; slug?: string; description?: string | null } = {}
  if (input.name !== undefined && input.name !== access.channel.name) {
    data.name = input.name
    const slug = slugify(input.name) || 'channel'
    if (slug !== access.channel.slug) {
      data.slug = await availableSlug(workspace.workspaceId, input.name, channelId)
    }
  }
  if (input.description !== undefined) data.description = emptyToNull(input.description)

  const channel = await getPrisma().channel.update({
    where: { id: channelId },
    data,
    select: channelSelect,
  })
  await broadcastChannel('updated', channel)
  return toChannelDto(channel)
}

/**
 * Archive instead of delete: the channel stays readable but becomes read-only.
 * Guard: the last active PUBLIC channel cannot be archived — every workspace
 * keeps somewhere everyone can talk (normally #general).
 */
export async function setChannelArchived(
  workspace: WorkspaceAccess,
  channelId: string,
  archived: boolean,
): Promise<Channel> {
  const access = await loadChannel(workspace, channelId)
  authorize(
    canManageChannel(workspace.actor, access.context),
    'Only workspace owners and admins can archive channels.',
  )
  if (archived === (access.channel.archivedAt !== null)) return toChannelDto(access.channel)

  const prisma = getPrisma()
  if (archived && access.channel.type === 'PUBLIC') {
    const otherActivePublic = await prisma.channel.count({
      where: {
        workspaceId: workspace.workspaceId,
        type: 'PUBLIC',
        archivedAt: null,
        id: { not: channelId },
      },
    })
    if (otherActivePublic === 0) {
      throw new AppError(
        'CONFLICT',
        'This is the last public channel. Keep at least one public channel active.',
      )
    }
  }

  const channel = await prisma.channel.update({
    where: { id: channelId },
    data: { archivedAt: archived ? new Date() : null },
    select: channelSelect,
  })
  await broadcastChannel('updated', channel)
  return toChannelDto(channel)
}

// ---------------------------------------------------------------------------
// Private channel members
// ---------------------------------------------------------------------------

function requirePrivate(access: ChannelAccess) {
  if (access.channel.type !== 'PRIVATE') {
    throw badRequest(
      'Public channels are open to every workspace member; they have no member list.',
    )
  }
}

export async function listChannelMembers(
  workspace: WorkspaceAccess,
  channelId: string,
): Promise<ChannelMember[]> {
  const access = await loadChannel(workspace, channelId)
  requirePrivate(access)
  const members = await getPrisma().channelMember.findMany({
    where: { channelId },
    select: {
      joinedAt: true,
      user: { select: { id: true, name: true, avatarUrl: true } },
      workspaceMember: { select: { role: true } },
    },
    orderBy: { user: { name: 'asc' } },
  })
  return members.map((member) => ({
    ...toPublicUser(member.user),
    role: member.workspaceMember.role,
    joinedAt: member.joinedAt.toISOString(),
  }))
}

export async function addChannelMember(
  workspace: WorkspaceAccess,
  channelId: string,
  userId: string,
): Promise<ChannelMember[]> {
  const access = await loadChannel(workspace, channelId)
  requirePrivate(access)
  authorize(
    canAddChannelMember(workspace.actor, access.context),
    access.channel.archivedAt
      ? 'This channel is archived.'
      : 'Only channel members and workspace admins can add people.',
  )

  const prisma = getPrisma()
  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.workspaceId, userId } },
    select: { id: true },
  })
  if (!target) throw badRequest('Only members of this workspace can be added.')

  await prisma.channelMember.createMany({
    data: [{ channelId, workspaceId: workspace.workspaceId, userId }],
    skipDuplicates: true,
  })

  const channel = await prisma.channel.findUniqueOrThrow({
    where: { id: channelId },
    select: channelSelect,
  })
  // The new member gains access now: their sidebar learns about the channel.
  realtime.emit(rooms.user(userId), SERVER_EVENTS.CHANNEL_CREATED, {
    channel: toChannelDto(channel),
  })
  await broadcastChannel('updated', channel)
  return listChannelMembers(workspace, channelId)
}

/**
 * Removes someone (or yourself) from a private channel. Unless they still have
 * access as a workspace admin, their sockets leave the channel room at once
 * and their clients are told to drop the channel.
 */
export async function removeChannelMember(
  workspace: WorkspaceAccess,
  channelId: string,
  userId: string,
): Promise<void> {
  const access = await loadChannel(workspace, channelId)
  requirePrivate(access)
  authorize(
    canRemoveChannelMember(workspace.actor, access.context, userId),
    'Only workspace owners and admins can remove other people.',
  )

  const prisma = getPrisma()
  await prisma.channelMember.deleteMany({ where: { channelId, userId } })

  const targetMembership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.workspaceId, userId } },
    select: { role: true },
  })
  const stillHasAccess = canAccessChannel(
    { userId, role: targetMembership?.role ?? null },
    { ...access.context, isMember: false },
  )
  if (!stillHasAccess) {
    realtime.leaveRoom(rooms.user(userId), rooms.channel(channelId))
    realtime.emit(rooms.user(userId), SERVER_EVENTS.CHANNEL_REMOVED, {
      workspaceId: workspace.workspaceId,
      channelId,
    })
  }

  const channel = await prisma.channel.findUniqueOrThrow({
    where: { id: channelId },
    select: channelSelect,
  })
  await broadcastChannel('updated', channel)
}
