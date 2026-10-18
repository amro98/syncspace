import type { WorkspaceRole } from '../constants/domain'
import type { WorkspaceActor } from './context'

/** Higher rank = more privileged. Strictly hierarchical: OWNER > ADMIN > MEMBER. */
const ROLE_RANK: Record<WorkspaceRole, number> = {
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
}

export type MemberActor = WorkspaceActor & { role: WorkspaceRole }

/** The actor belongs to the resource's workspace. Every other rule builds on this. */
export function isWorkspaceMember(actor: WorkspaceActor): actor is MemberActor {
  return actor.role !== null
}

/** `role` is at least as privileged as `minimum`. A non-member (`null`) never qualifies. */
export function hasRoleAtLeast(role: WorkspaceRole | null, minimum: WorkspaceRole): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[minimum]
}

/** Workspace administrators: OWNER and ADMIN. */
export function isWorkspaceAdmin(actor: WorkspaceActor): boolean {
  return hasRoleAtLeast(actor.role, 'ADMIN')
}

export function isWorkspaceOwner(actor: WorkspaceActor): boolean {
  return actor.role === 'OWNER'
}
