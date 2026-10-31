import { canAccessChannel, canViewWorkspace, toActor, toChannelContext } from '@/lib/permissions'
import { getPrisma } from '@/lib/prisma'

/**
 * Authorization seam for joining realtime rooms. Joining a room grants read
 * access to everything broadcast into it, so it is checked against persistent
 * membership with the same policy functions as REST — never trusted from the
 * client.
 */
export interface RoomAccessPolicy {
  canJoinWorkspace(userId: string, workspaceId: string): Promise<boolean>
  canJoinChannel(userId: string, workspaceId: string, channelId: string): Promise<boolean>
}

/** Denies everything. The default when no policy is supplied (secure by default). */
export const denyAllRoomAccess: RoomAccessPolicy = {
  canJoinWorkspace: () => Promise.resolve(false),
  canJoinChannel: () => Promise.resolve(false),
}

/** Production policy: workspace membership, and channel access per the channel rules. */
export const membershipRoomAccess: RoomAccessPolicy = {
  async canJoinWorkspace(userId, workspaceId) {
    const membership = await getPrisma().workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    })
    return canViewWorkspace(toActor(userId, membership))
  },

  async canJoinChannel(userId, workspaceId, channelId) {
    const prisma = getPrisma()
    const [membership, channel, channelMember] = await Promise.all([
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { role: true },
      }),
      prisma.channel.findFirst({
        where: { id: channelId, workspaceId },
        select: { type: true, archivedAt: true },
      }),
      prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { userId: true },
      }),
    ])
    if (!channel) return false
    return canAccessChannel(
      toActor(userId, membership),
      toChannelContext(channel, channelMember !== null),
    )
  },
}
