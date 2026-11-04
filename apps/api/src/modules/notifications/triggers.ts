import { type Message, rooms } from '@syncspace/shared'

import { getPrisma } from '@/lib/prisma'
import { realtime } from '@/sockets/realtime'

import { notify } from './notifications.service'

/**
 * The notification rules — the only events that create notifications:
 *
 * - TASK_ASSIGNED  someone else assigns you to a task.
 * - TASK_UPDATED   someone else completes a task assigned to you.
 * - MESSAGE        a direct or group message while you do not have that
 *                  conversation open; at most one unread per conversation.
 * - INVITE         someone accepted the invitation you sent.
 *
 * Every trigger runs after the triggering write committed and never notifies
 * the actor. Channel messages do not notify (unread badges cover them).
 */

async function actorName(userId: string): Promise<string> {
  const user = await getPrisma().user.findUnique({ where: { id: userId }, select: { name: true } })
  return user?.name ?? 'Someone'
}

export async function notifyTaskAssigned(
  actorId: string,
  task: { id: string; workspaceId: string; title: string },
  newAssigneeIds: string[],
): Promise<void> {
  const recipients = newAssigneeIds.filter((id) => id !== actorId)
  if (recipients.length === 0) return
  const name = await actorName(actorId)
  await notify(
    recipients.map((userId) => ({
      userId,
      workspaceId: task.workspaceId,
      actorId,
      type: 'TASK_ASSIGNED',
      title: `${name} assigned you a task`,
      body: task.title,
      entityType: 'TASK',
      entityId: task.id,
    })),
  )
}

export async function notifyTaskCompleted(
  actorId: string,
  task: { id: string; workspaceId: string; title: string },
  assigneeIds: string[],
): Promise<void> {
  const recipients = assigneeIds.filter((id) => id !== actorId)
  if (recipients.length === 0) return
  const name = await actorName(actorId)
  await notify(
    recipients.map((userId) => ({
      userId,
      workspaceId: task.workspaceId,
      actorId,
      type: 'TASK_UPDATED',
      title: `${name} completed a task assigned to you`,
      body: task.title,
      entityType: 'TASK',
      entityId: task.id,
    })),
  )
}

/**
 * DM / group message: notify participants who are not looking at the
 * conversation (no socket in its room). One unread notification per
 * conversation is enough — further messages do not stack up.
 */
export async function notifyConversationMessage(
  conversation: {
    id: string
    type: 'DIRECT' | 'GROUP'
    name: string | null
    participantIds: string[]
  },
  message: Message,
): Promise<void> {
  const authorId = message.author.id
  const others = conversation.participantIds.filter((id) => id !== authorId)
  if (others.length === 0) return

  const viewing = await realtime.usersInRoom(rooms.conversation(conversation.id))
  const candidates = others.filter((id) => !viewing.has(id))
  if (candidates.length === 0) return

  const alreadyNotified = await getPrisma().notification.findMany({
    where: {
      userId: { in: candidates },
      readAt: null,
      type: 'MESSAGE',
      entityType: 'CONVERSATION',
      entityId: conversation.id,
    },
    select: { userId: true },
  })
  const skip = new Set(alreadyNotified.map((row) => row.userId))
  const recipients = candidates.filter((id) => !skip.has(id))
  if (recipients.length === 0) return

  const title =
    conversation.type === 'GROUP'
      ? `${message.author.name} in ${conversation.name ?? 'a group conversation'}`
      : `New message from ${message.author.name}`
  await notify(
    recipients.map((userId) => ({
      userId,
      workspaceId: message.workspaceId,
      actorId: authorId,
      type: 'MESSAGE',
      title,
      body: message.content,
      entityType: 'CONVERSATION',
      entityId: conversation.id,
    })),
  )
}

export async function notifyInviteAccepted(
  invite: { createdById: string | null; workspace: { id: string; name: string } },
  acceptedById: string,
): Promise<void> {
  if (!invite.createdById) return
  const name = await actorName(acceptedById)
  await notify([
    {
      userId: invite.createdById,
      workspaceId: invite.workspace.id,
      actorId: acceptedById,
      type: 'INVITE',
      title: `${name} joined ${invite.workspace.name}`,
      body: 'Your invitation was accepted.',
      entityType: 'WORKSPACE',
      entityId: invite.workspace.id,
    },
  ])
}
