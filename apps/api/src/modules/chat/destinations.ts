import {
  type ChannelContext,
  type ConversationContext,
  type Destination,
  type MessageDestination,
  type RoomName,
  rooms,
} from '@syncspace/shared'

import {
  canAccessChannel,
  canAccessConversation,
  canViewWorkspace,
  ensureVisible,
  toActor,
  toChannelContext,
  toConversationContext,
} from '@/lib/permissions'
import { getPrisma } from '@/lib/prisma'
import type { WorkspaceAccess } from '@/modules/workspaces/workspace-access'

import {
  channelSelect,
  type ChannelRow,
  conversationSelect,
  type ConversationRow,
  messageSelect,
  type MessageRow,
} from './presenters'

/**
 * Destination access: everything a chat operation needs to know about "where"
 * — the row, the viewer's normalised permission context, and the Prisma
 * filter for its messages. Loading one ALWAYS verifies the viewer can see it
 * (404 otherwise), so services never touch a destination without a check.
 */

interface DestinationBase {
  workspace: WorkspaceAccess
  destination: Destination
  /** Prisma filter selecting this destination's messages. */
  messageWhere: { channelId: string } | { conversationId: string }
  /** Policy input for message rules (canPostMessage, canEditMessage, ...). */
  policy: MessageDestination
}

export interface ChannelAccess extends DestinationBase {
  kind: 'channel'
  channel: ChannelRow
  context: ChannelContext
}

export interface ConversationAccess extends DestinationBase {
  kind: 'conversation'
  conversation: ConversationRow
  context: ConversationContext
}

export type DestinationAccess = ChannelAccess | ConversationAccess

export async function loadChannel(
  workspace: WorkspaceAccess,
  channelId: string,
): Promise<ChannelAccess> {
  const prisma = getPrisma()
  const [channel, membership] = await Promise.all([
    prisma.channel.findFirst({
      where: { id: channelId, workspaceId: workspace.workspaceId },
      select: channelSelect,
    }),
    prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId: workspace.actor.userId } },
      select: { userId: true },
    }),
  ])
  ensureVisible(channel !== null, 'Channel not found')
  if (!channel) throw new Error('unreachable')

  const context = toChannelContext(channel, membership !== null)
  ensureVisible(canAccessChannel(workspace.actor, context), 'Channel not found')
  return {
    kind: 'channel',
    workspace,
    channel,
    context,
    destination: { kind: 'channel', id: channel.id },
    messageWhere: { channelId: channel.id },
    policy: { kind: 'channel', channel: context },
  }
}

export async function loadConversation(
  workspace: WorkspaceAccess,
  conversationId: string,
): Promise<ConversationAccess> {
  const conversation = await getPrisma().conversation.findFirst({
    where: { id: conversationId, workspaceId: workspace.workspaceId },
    select: conversationSelect,
  })
  ensureVisible(conversation !== null, 'Conversation not found')
  if (!conversation) throw new Error('unreachable')

  const isParticipant = conversation.participants.some(
    (participant) => participant.user.id === workspace.actor.userId,
  )
  const context = toConversationContext(conversation, isParticipant)
  ensureVisible(canAccessConversation(workspace.actor, context), 'Conversation not found')
  return {
    kind: 'conversation',
    workspace,
    conversation,
    context,
    destination: { kind: 'conversation', id: conversation.id },
    messageWhere: { conversationId: conversation.id },
    policy: { kind: 'conversation', conversation: context },
  }
}

export function loadDestination(
  workspace: WorkspaceAccess,
  destination: Destination,
): Promise<DestinationAccess> {
  return destination.kind === 'channel'
    ? loadChannel(workspace, destination.id)
    : loadConversation(workspace, destination.id)
}

/**
 * Loads a message by id for message-level routes (/messages/:id): verifies
 * workspace membership and destination access exactly like the scoped routes.
 * Anything the viewer may not see is a 404.
 */
export async function loadMessage(
  userId: string,
  messageId: string,
): Promise<{ message: MessageRow; access: DestinationAccess }> {
  const prisma = getPrisma()
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: messageSelect,
  })
  ensureVisible(message !== null, 'Message not found')
  if (!message) throw new Error('unreachable')

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: message.workspaceId, userId } },
    select: { role: true, joinedAt: true },
  })
  ensureVisible(canViewWorkspace(toActor(userId, membership)), 'Message not found')
  if (!membership) throw new Error('unreachable')

  const workspace: WorkspaceAccess = {
    workspaceId: message.workspaceId,
    actor: { userId, role: membership.role },
    membership,
  }
  const access = message.channelId
    ? await loadChannel(workspace, message.channelId)
    : await loadConversation(workspace, message.conversationId ?? '')
  return { message, access }
}

/**
 * Sockets that must receive events about this destination's messages: viewers
 * (the destination room) plus everyone whose sidebar tracks it — the workspace
 * room for public channels, member/participant user rooms otherwise. Socket.IO
 * delivers once per socket even when it is in several of these rooms.
 */
export async function destinationAudience(access: DestinationAccess): Promise<RoomName[]> {
  if (access.kind === 'conversation') {
    return [
      rooms.conversation(access.conversation.id),
      ...access.conversation.participants.map((participant) => rooms.user(participant.user.id)),
    ]
  }
  return channelAudience(access.channel)
}

export async function channelAudience(channel: { id: string; workspaceId: string; type: string }) {
  if (channel.type === 'PUBLIC') {
    return [rooms.channel(channel.id), rooms.workspace(channel.workspaceId)]
  }
  const members = await getPrisma().channelMember.findMany({
    where: { channelId: channel.id },
    select: { userId: true },
  })
  return [rooms.channel(channel.id), ...members.map((member) => rooms.user(member.userId))]
}
