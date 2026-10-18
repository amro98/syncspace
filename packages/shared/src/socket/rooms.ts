/**
 * Socket.IO room naming convention. Rooms are always built through these
 * helpers — never by string concatenation at call sites.
 *
 *   workspace:<workspaceId>       everyone currently viewing a workspace
 *   channel:<channelId>           everyone currently viewing a channel
 *   conversation:<conversationId> participants of a direct-message conversation
 *   user:<userId>                 every connected socket of one user (multi-tab / multi-device)
 */
export const ROOM_KINDS = ['workspace', 'channel', 'conversation', 'user'] as const

export type RoomKind = (typeof ROOM_KINDS)[number]

export type RoomName<TKind extends RoomKind = RoomKind> = `${TKind}:${string}`

function room<TKind extends RoomKind>(kind: TKind, id: string): RoomName<TKind> {
  if (id.length === 0 || id.includes(':')) {
    throw new Error(`Invalid ${kind} room id: "${id}"`)
  }
  return `${kind}:${id}`
}

export const rooms = {
  workspace: (workspaceId: string) => room('workspace', workspaceId),
  channel: (channelId: string) => room('channel', channelId),
  conversation: (conversationId: string) => room('conversation', conversationId),
  user: (userId: string) => room('user', userId),
} as const
