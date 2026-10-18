import { canAccessChannel, canPostInChannel } from './channels'
import type { MessageContext, MessageDestination, WorkspaceActor } from './context'
import { canAccessConversation, canPostInConversation } from './conversations'
import { isWorkspaceAdmin } from './roles'

export function canViewDestination(
  actor: WorkspaceActor,
  destination: MessageDestination,
): boolean {
  return destination.kind === 'channel'
    ? canAccessChannel(actor, destination.channel)
    : canAccessConversation(actor, destination.conversation)
}

export function canPostMessage(actor: WorkspaceActor, destination: MessageDestination): boolean {
  return destination.kind === 'channel'
    ? canPostInChannel(actor, destination.channel)
    : canPostInConversation(actor, destination.conversation)
}

/**
 * Editing is AUTHOR-ONLY — nobody, including the OWNER, may put words in
 * someone else's mouth. The author must still be able to post where the
 * message lives (archived channel = read-only; removed from channel = no edit).
 */
export function canEditMessage(actor: WorkspaceActor, message: MessageContext): boolean {
  return (
    !message.isDeleted &&
    message.authorId === actor.userId &&
    canPostMessage(actor, message.destination)
  )
}

/**
 * Deleting (soft delete) is allowed for:
 * - the author, wherever they can still post;
 * - workspace OWNER/ADMIN as MODERATION in channels they can access — including
 *   archived and private channels. There is no moderation of DMs/group
 *   conversations (their privacy is absolute).
 */
export function canDeleteMessage(actor: WorkspaceActor, message: MessageContext): boolean {
  if (message.isDeleted) return false
  if (message.authorId === actor.userId && canPostMessage(actor, message.destination)) return true
  return canModerateMessage(actor, message)
}

/** The deletion is a moderation action (not the author's own) — useful for audit/UI copy. */
export function canModerateMessage(actor: WorkspaceActor, message: MessageContext): boolean {
  return (
    !message.isDeleted &&
    message.destination.kind === 'channel' &&
    isWorkspaceAdmin(actor) &&
    canAccessChannel(actor, message.destination.channel)
  )
}

export function canReactToMessage(actor: WorkspaceActor, message: MessageContext): boolean {
  return !message.isDeleted && canPostMessage(actor, message.destination)
}

/** Threads are one level deep: replies cannot be replied to. */
export function canReplyToMessage(actor: WorkspaceActor, message: MessageContext): boolean {
  return !message.isDeleted && !message.isReply && canPostMessage(actor, message.destination)
}
