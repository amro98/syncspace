import type {
  ChannelSummary,
  ConversationSummary,
  MessageDestination,
  PublicUser,
  WorkspaceActor,
} from '@syncspace/shared'
import { canPostMessage } from '@syncspace/shared'

/**
 * Bridges API DTOs to the shared permission policy, so the UI shows exactly
 * the controls the API will allow (the API still enforces them).
 */
// Policies are interned (one shared object per combination), so passing them to
// memoized message rows never causes re-renders by identity alone.
const policies = new Map<string, MessageDestination>()
function intern(key: string, create: () => MessageDestination): MessageDestination {
  let policy = policies.get(key)
  if (!policy) {
    policy = create()
    policies.set(key, policy)
  }
  return policy
}

export function channelPolicy(
  channel: Pick<ChannelSummary, 'type' | 'archivedAt' | 'isMember'>,
): MessageDestination {
  const isArchived = channel.archivedAt !== null
  return intern(
    `channel:${channel.type}:${String(isArchived)}:${String(channel.isMember)}`,
    () => ({
      kind: 'channel',
      channel: { type: channel.type, isArchived, isMember: channel.isMember },
    }),
  )
}

/** Conversations are only listed to participants. */
export function conversationPolicy(
  conversation: Pick<ConversationSummary, 'type'>,
): MessageDestination {
  return intern(`conversation:${conversation.type}`, () => ({
    kind: 'conversation',
    conversation: { type: conversation.type, isParticipant: true },
  }))
}

/** Why the composer is unavailable, or null when the actor may post. */
export function postingBlockedReason(
  actor: WorkspaceActor,
  policy: MessageDestination,
): string | null {
  if (canPostMessage(actor, policy)) return null
  if (policy.kind === 'channel' && policy.channel.isArchived) {
    return 'This channel is archived. Its history stays readable, but nobody can post.'
  }
  if (policy.kind === 'channel' && policy.channel.type === 'PRIVATE') {
    return 'You can read this private channel as a workspace admin. Only its members can post.'
  }
  return 'You cannot post here.'
}

/** Everyone in the conversation except the viewer (a self-DM lists the viewer). */
export function otherParticipants(
  conversation: ConversationSummary,
  viewerId: string,
): PublicUser[] {
  const others = conversation.participants.filter((p) => p.id !== viewerId)
  return others.length > 0 ? others : conversation.participants
}

export function conversationTitle(conversation: ConversationSummary, viewerId: string): string {
  if (conversation.type === 'GROUP' && conversation.name) return conversation.name
  return otherParticipants(conversation, viewerId)
    .map((p) => p.name)
    .join(', ')
}
