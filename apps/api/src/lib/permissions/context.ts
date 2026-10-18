import type {
  BoardContext,
  ChannelContext,
  ConversationContext,
  MessageContext,
  TaskContext,
  WorkspaceActor,
} from '@syncspace/shared'

import type {
  Board,
  Channel,
  Conversation,
  Message,
  Task,
  WorkspaceMember,
} from '@/generated/prisma/client'

/**
 * Pure mappers from database rows to the normalised permission contexts used
 * by the policy in @syncspace/shared. Services load the rows (membership of
 * the RESOURCE's workspace, the actor's channel membership, ...) and pass them
 * here — permission rules never query the database themselves.
 */

export function toActor(
  userId: string,
  membership: Pick<WorkspaceMember, 'role'> | null,
): WorkspaceActor {
  return { userId, role: membership?.role ?? null }
}

export function toChannelContext(
  channel: Pick<Channel, 'type' | 'archivedAt'>,
  actorIsChannelMember: boolean,
): ChannelContext {
  return {
    type: channel.type,
    isArchived: channel.archivedAt !== null,
    isMember: actorIsChannelMember,
  }
}

export function toConversationContext(
  conversation: Pick<Conversation, 'type'>,
  actorIsParticipant: boolean,
): ConversationContext {
  return { type: conversation.type, isParticipant: actorIsParticipant }
}

/** Exactly one of `channel` / `conversation` must be given, mirroring the message XOR invariant. */
export function toMessageContext(
  message: Pick<Message, 'authorId' | 'deletedAt' | 'parentMessageId'>,
  destination: { channel: ChannelContext } | { conversation: ConversationContext },
): MessageContext {
  return {
    authorId: message.authorId,
    isDeleted: message.deletedAt !== null,
    isReply: message.parentMessageId !== null,
    destination:
      'channel' in destination
        ? { kind: 'channel', channel: destination.channel }
        : { kind: 'conversation', conversation: destination.conversation },
  }
}

export function toBoardContext(board: Pick<Board, 'createdById' | 'archivedAt'>): BoardContext {
  return { createdById: board.createdById, isArchived: board.archivedAt !== null }
}

export function toTaskContext(
  task: Pick<Task, 'createdById'>,
  board: Pick<Board, 'createdById' | 'archivedAt'>,
): TaskContext {
  return { createdById: task.createdById, board: toBoardContext(board) }
}
