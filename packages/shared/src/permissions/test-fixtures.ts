import type { WorkspaceRole } from '../constants/domain'
import type { ChannelContext, MemberSubject, WorkspaceActor } from './context'

export const OWNER: WorkspaceActor = { userId: 'u-owner', role: 'OWNER' }
export const ADMIN: WorkspaceActor = { userId: 'u-admin', role: 'ADMIN' }
export const MEMBER: WorkspaceActor = { userId: 'u-member', role: 'MEMBER' }
/** Signed in, but not a member of the resource's workspace. */
export const OUTSIDER: WorkspaceActor = { userId: 'u-outsider', role: null }

export const ACTORS = { OWNER, ADMIN, MEMBER, OUTSIDER } as const
export type ActorName = keyof typeof ACTORS

export function subject(actor: WorkspaceActor): MemberSubject {
  if (actor.role === null) throw new Error('Outsiders cannot be subjects')
  return { userId: actor.userId, role: actor.role }
}

export function otherMember(role: WorkspaceRole): MemberSubject {
  return { userId: `u-other-${role.toLowerCase()}`, role }
}

export function channel(overrides: Partial<ChannelContext> = {}): ChannelContext {
  return { type: 'PUBLIC', isArchived: false, isMember: false, ...overrides }
}

/** Expands `{ OWNER: true, ... }` into it.each rows: [actorName, actor, expected]. */
export function matrix(expected: Record<ActorName, boolean>) {
  return (Object.keys(expected) as ActorName[]).map(
    (name) => [name, ACTORS[name], expected[name]] as const,
  )
}
