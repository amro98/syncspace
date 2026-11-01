import {
  canStartConversation,
  type ConversationSummary,
  type CreateGroupConversationInput,
  directConversationKey,
  rooms,
  SERVER_EVENTS,
} from '@syncspace/shared'

import { badRequest } from '@/lib/errors'
import { authorize } from '@/lib/permissions'
import { getPrisma } from '@/lib/prisma'
import { isUniqueViolation } from '@/lib/prisma-errors'
import { emptyToNull } from '@/utils/zod'
import { realtime } from '@/sockets/realtime'
import type { WorkspaceAccess } from '@/modules/workspaces/workspace-access'

import { conversationSelect, type ConversationRow, toConversationDto } from './presenters'
import { conversationUnreadCounts } from './read-state.service'

/** The viewer's DMs and groups, most recently active first, with unread state. */
export async function listConversations(
  workspace: WorkspaceAccess,
): Promise<ConversationSummary[]> {
  const { actor, workspaceId } = workspace
  const unread = await conversationUnreadCounts(actor.userId, workspaceId)
  if (unread.size === 0) return []

  const conversations = await getPrisma().conversation.findMany({
    where: { id: { in: [...unread.keys()] }, workspaceId },
    select: conversationSelect,
    orderBy: { updatedAt: 'desc' },
  })
  return conversations.map((conversation) => {
    const state = unread.get(conversation.id)
    return {
      ...toConversationDto(conversation),
      unreadCount: state?.unread ?? 0,
      lastReadAt: (state?.lastReadAt ?? state?.joinedAt ?? conversation.createdAt).toISOString(),
      lastReadMessageId: state?.lastReadMessageId ?? null,
    }
  })
}

function freshSummary(conversation: ConversationRow): ConversationSummary {
  return {
    ...toConversationDto(conversation),
    unreadCount: 0,
    lastReadAt: conversation.createdAt.toISOString(),
    lastReadMessageId: null,
  }
}

function announce(conversation: ConversationRow) {
  realtime.emit(
    conversation.participants.map((participant) => rooms.user(participant.user.id)),
    SERVER_EVENTS.CONVERSATION_CREATED,
    { conversation: toConversationDto(conversation) },
  )
}

async function assertWorkspaceMembers(workspaceId: string, userIds: string[]) {
  const count = await getPrisma().workspaceMember.count({
    where: { workspaceId, userId: { in: userIds } },
  })
  if (count !== new Set(userIds).size) {
    throw badRequest('Everyone in a conversation must be a member of this workspace.')
  }
}

/**
 * Find-or-create the DM with `targetUserId` (a self-DM is allowed). The
 * database's unique (workspace_id, direct_key) makes this race-free: a
 * concurrent creator loses the insert and returns the winner's conversation.
 */
export async function openDirectConversation(
  workspace: WorkspaceAccess,
  targetUserId: string,
): Promise<{ conversation: ConversationSummary; created: boolean }> {
  const { actor, workspaceId } = workspace
  authorize(canStartConversation(actor))
  await assertWorkspaceMembers(workspaceId, [targetUserId])

  const prisma = getPrisma()
  const directKey = directConversationKey(actor.userId, targetUserId)
  const findExisting = () =>
    prisma.conversation.findUnique({
      where: { workspaceId_directKey: { workspaceId, directKey } },
      select: { id: true },
    })

  const existing = await findExisting()
  if (existing) {
    const [summary] = (await listConversations(workspace)).filter((c) => c.id === existing.id)
    if (summary) return { conversation: summary, created: false }
  }

  try {
    const conversation = await prisma.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: { workspaceId, type: 'DIRECT', directKey, createdById: actor.userId },
        select: { id: true },
      })
      await tx.conversationParticipant.createMany({
        data: [...new Set([actor.userId, targetUserId])].map((userId) => ({
          conversationId: created.id,
          workspaceId,
          userId,
        })),
      })
      return tx.conversation.findUniqueOrThrow({
        where: { id: created.id },
        select: conversationSelect,
      })
    })
    announce(conversation)
    return { conversation: freshSummary(conversation), created: true }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const winner = await findExisting()
    const [summary] = (await listConversations(workspace)).filter((c) => c.id === winner?.id)
    if (!summary) throw error
    return { conversation: summary, created: false }
  }
}

/** A named (or unnamed) group: the creator plus at least two other workspace members. */
export async function createGroupConversation(
  workspace: WorkspaceAccess,
  input: CreateGroupConversationInput,
): Promise<ConversationSummary> {
  const { actor, workspaceId } = workspace
  authorize(canStartConversation(actor))
  const others = input.participantIds.filter((id) => id !== actor.userId)
  if (others.length < 2) throw badRequest('Pick at least two other people for a group.')
  const participantIds = [actor.userId, ...others]
  await assertWorkspaceMembers(workspaceId, participantIds)

  const conversation = await getPrisma().$transaction(async (tx) => {
    const created = await tx.conversation.create({
      data: {
        workspaceId,
        type: 'GROUP',
        name: emptyToNull(input.name),
        createdById: actor.userId,
      },
      select: { id: true },
    })
    await tx.conversationParticipant.createMany({
      data: participantIds.map((userId) => ({ conversationId: created.id, workspaceId, userId })),
    })
    return tx.conversation.findUniqueOrThrow({
      where: { id: created.id },
      select: conversationSelect,
    })
  })
  announce(conversation)
  return freshSummary(conversation)
}
