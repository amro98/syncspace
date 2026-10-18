import type { WorkspaceRole } from '../constants/domain'
import type { InviteContext, MemberSubject, WorkspaceActor } from './context'
import { isWorkspaceAdmin, isWorkspaceMember, isWorkspaceOwner } from './roles'

/** Read anything in the workspace that is not further restricted (private channels, DMs). */
export function canViewWorkspace(actor: WorkspaceActor): boolean {
  return isWorkspaceMember(actor)
}

/** Workspace settings (name, slug). OWNER only. */
export function canManageWorkspace(actor: WorkspaceActor): boolean {
  return isWorkspaceOwner(actor)
}

export function canDeleteWorkspace(actor: WorkspaceActor): boolean {
  return isWorkspaceOwner(actor)
}

/** Hand ownership to another existing member. The previous owner becomes ADMIN. */
export function canTransferOwnership(actor: WorkspaceActor, target: MemberSubject): boolean {
  return isWorkspaceOwner(actor) && target.userId !== actor.userId && target.role !== 'OWNER'
}

/** Open member administration at all (list pending invites, change roles, remove people). */
export function canManageMembers(actor: WorkspaceActor): boolean {
  return isWorkspaceAdmin(actor)
}

/**
 * Whether the actor may grant `role` (by invitation or role change).
 * OWNER is never granted — ownership only moves by transfer. Only the OWNER
 * manages admins; admins may bring in regular members.
 */
export function canGrantRole(actor: WorkspaceActor, role: WorkspaceRole): boolean {
  switch (role) {
    case 'OWNER':
      return false
    case 'ADMIN':
      return isWorkspaceOwner(actor)
    case 'MEMBER':
      return isWorkspaceAdmin(actor)
  }
}

export function canInviteMember(actor: WorkspaceActor, role: WorkspaceRole): boolean {
  return canGrantRole(actor, role)
}

/** Revoking (or resending) an invite requires the right to grant its role. */
export function canRevokeInvite(actor: WorkspaceActor, invite: InviteContext): boolean {
  return canGrantRole(actor, invite.role)
}

/**
 * Change another member's role between ADMIN and MEMBER. Only the OWNER can
 * (because it always involves the ADMIN role), the owner's own role cannot be
 * changed this way, and nobody can be made OWNER.
 */
export function canChangeMemberRole(
  actor: WorkspaceActor,
  target: MemberSubject,
  newRole: WorkspaceRole,
): boolean {
  return (
    isWorkspaceOwner(actor) &&
    target.userId !== actor.userId &&
    target.role !== 'OWNER' &&
    newRole !== 'OWNER'
  )
}

/** Leave voluntarily. The OWNER must transfer ownership (or delete the workspace) first. */
export function canLeaveWorkspace(actor: WorkspaceActor): boolean {
  return isWorkspaceMember(actor) && actor.role !== 'OWNER'
}

/**
 * Remove a member. Nobody can remove the OWNER. The OWNER can remove anyone
 * else; ADMINs can remove MEMBERs only. Removing yourself is leaving.
 */
export function canRemoveMember(actor: WorkspaceActor, target: MemberSubject): boolean {
  if (target.role === 'OWNER') return false
  if (target.userId === actor.userId) return canLeaveWorkspace(actor)
  if (isWorkspaceOwner(actor)) return true
  return actor.role === 'ADMIN' && target.role === 'MEMBER'
}
