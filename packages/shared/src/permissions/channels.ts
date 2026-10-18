import type { ChannelContext, WorkspaceActor } from './context'
import { isWorkspaceAdmin, isWorkspaceMember } from './roles'

/** Any member may create public or private channels (they become a member of private ones). */
export function canCreateChannel(actor: WorkspaceActor): boolean {
  return isWorkspaceMember(actor)
}

/**
 * Read a channel and its messages.
 * - PUBLIC: every workspace member.
 * - PRIVATE: explicit channel members, plus workspace OWNER/ADMIN (oversight and moderation).
 * Archived channels stay readable.
 */
export function canAccessChannel(actor: WorkspaceActor, channel: ChannelContext): boolean {
  if (!isWorkspaceMember(actor)) return false
  if (channel.type === 'PUBLIC') return true
  return channel.isMember || isWorkspaceAdmin(actor)
}

/**
 * Post messages (and react/reply). Archived channels are read-only. In PRIVATE
 * channels only explicit members post — admin oversight is read + moderate,
 * not speak.
 */
export function canPostInChannel(actor: WorkspaceActor, channel: ChannelContext): boolean {
  if (!isWorkspaceMember(actor) || channel.isArchived) return false
  return channel.type === 'PUBLIC' || channel.isMember
}

/** Self-join is only possible for public channels; private channels require being added. */
export function canJoinChannel(actor: WorkspaceActor, channel: ChannelContext): boolean {
  return (
    isWorkspaceMember(actor) &&
    channel.type === 'PUBLIC' &&
    !channel.isArchived &&
    !channel.isMember
  )
}

/** Rename, edit description, change type, archive/unarchive, delete. OWNER/ADMIN. */
export function canManageChannel(actor: WorkspaceActor, channel: ChannelContext): boolean {
  return isWorkspaceAdmin(actor) && canAccessChannel(actor, channel)
}

/**
 * Add a workspace member to a PRIVATE channel: existing channel members and
 * OWNER/ADMIN. (Public channels need no membership rows to grant access.)
 */
export function canAddChannelMember(actor: WorkspaceActor, channel: ChannelContext): boolean {
  if (!isWorkspaceMember(actor) || channel.type !== 'PRIVATE' || channel.isArchived) return false
  return channel.isMember || isWorkspaceAdmin(actor)
}

/** Remove someone from a channel: yourself (leave) or, for OWNER/ADMIN, anyone. */
export function canRemoveChannelMember(
  actor: WorkspaceActor,
  channel: ChannelContext,
  targetUserId: string,
): boolean {
  if (!isWorkspaceMember(actor)) return false
  if (targetUserId === actor.userId) return channel.isMember
  return isWorkspaceAdmin(actor) && canAccessChannel(actor, channel)
}
