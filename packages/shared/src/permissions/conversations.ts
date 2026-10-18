import type { ConversationContext, WorkspaceActor } from './context'
import { isWorkspaceMember } from './roles'

/**
 * Direct and group conversations are private to their participants. Unlike
 * private channels, workspace OWNER/ADMIN get NO implicit access — DMs are not
 * moderated by workspace administrators.
 */
export function canAccessConversation(
  actor: WorkspaceActor,
  conversation: ConversationContext,
): boolean {
  return isWorkspaceMember(actor) && conversation.isParticipant
}

export function canPostInConversation(
  actor: WorkspaceActor,
  conversation: ConversationContext,
): boolean {
  return canAccessConversation(actor, conversation)
}

/** Any workspace member may start a DM or group conversation with other workspace members. */
export function canStartConversation(actor: WorkspaceActor): boolean {
  return isWorkspaceMember(actor)
}

/** GROUP only: participants can add people. A DIRECT conversation is fixed to its pair. */
export function canAddConversationParticipant(
  actor: WorkspaceActor,
  conversation: ConversationContext,
): boolean {
  return conversation.type === 'GROUP' && canAccessConversation(actor, conversation)
}

export function canRenameConversation(
  actor: WorkspaceActor,
  conversation: ConversationContext,
): boolean {
  return conversation.type === 'GROUP' && canAccessConversation(actor, conversation)
}

/** Participants may leave a GROUP. A DIRECT conversation can only be hidden client-side. */
export function canLeaveConversation(
  actor: WorkspaceActor,
  conversation: ConversationContext,
): boolean {
  return conversation.type === 'GROUP' && canAccessConversation(actor, conversation)
}
