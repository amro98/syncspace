import type { ChannelType, ConversationType, WorkspaceRole } from '../constants/domain'

/**
 * Normalised inputs for permission checks.
 *
 * Every context is scoped to ONE workspace (the one that owns the resource) and
 * is expressed from the ACTOR's point of view (e.g. `isMember` means "the actor
 * is a member of this channel"). The API builds these from the database; the
 * web client builds them from data it already has. The rules never see Express
 * requests, Prisma models or dates — only these plain values.
 */

export interface WorkspaceActor {
  userId: string
  /** The actor's role in the resource's workspace; `null` when not a member. */
  role: WorkspaceRole | null
}

/** A workspace member being acted upon (role changes, removal, ownership transfer). */
export interface MemberSubject {
  userId: string
  role: WorkspaceRole
}

export interface ChannelContext {
  type: ChannelType
  isArchived: boolean
  /** The actor has a ChannelMember row for this channel. */
  isMember: boolean
}

export interface ConversationContext {
  type: ConversationType
  /** The actor is a ConversationParticipant. */
  isParticipant: boolean
}

export type MessageDestination =
  | { kind: 'channel'; channel: ChannelContext }
  | { kind: 'conversation'; conversation: ConversationContext }

export interface MessageContext {
  authorId: string
  isDeleted: boolean
  /** The message is itself a thread reply (threads are one level deep). */
  isReply: boolean
  destination: MessageDestination
}

export interface BoardContext {
  createdById: string | null
  isArchived: boolean
}

export interface TaskContext {
  createdById: string | null
  board: BoardContext
}

export interface InviteContext {
  role: WorkspaceRole
}
