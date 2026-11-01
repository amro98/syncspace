import {
  channelRoomPayloadSchema,
  CLIENT_EVENTS,
  conversationRoomPayloadSchema,
  rooms,
  typingPayloadSchema,
  workspaceRoomPayloadSchema,
} from '@syncspace/shared'

import { forbidden } from '@/lib/errors'

import { respond } from './ack'
import type { RoomAccessPolicy } from './room-access'
import { destinationRoom, type TypingTracker } from './typing'
import type { TypedSocket } from './types'

/**
 * Subscription management: clients ask to join the rooms for whatever they are
 * currently viewing. Joins are authorized against persistent membership;
 * leaves are always allowed. Typing is accepted only from sockets already in
 * the destination's room (joining proved access, so no per-keystroke DB check).
 */
export function registerRoomHandlers(
  socket: TypedSocket,
  access: RoomAccessPolicy,
  typing: TypingTracker,
): void {
  const { userId } = socket.data

  socket.on(CLIENT_EVENTS.WORKSPACE_JOIN, (payload, ack) => {
    void respond(socket, ack, async () => {
      const { workspaceId } = workspaceRoomPayloadSchema.parse(payload)
      if (!(await access.canJoinWorkspace(userId, workspaceId))) throw forbidden()
      await socket.join(rooms.workspace(workspaceId))
      return null
    })
  })

  socket.on(CLIENT_EVENTS.WORKSPACE_LEAVE, (payload, ack) => {
    void respond(socket, ack, async () => {
      const { workspaceId } = workspaceRoomPayloadSchema.parse(payload)
      await socket.leave(rooms.workspace(workspaceId))
      return null
    })
  })

  socket.on(CLIENT_EVENTS.CHANNEL_JOIN, (payload, ack) => {
    void respond(socket, ack, async () => {
      const { workspaceId, channelId } = channelRoomPayloadSchema.parse(payload)
      if (!(await access.canJoinChannel(userId, workspaceId, channelId))) throw forbidden()
      await socket.join(rooms.channel(channelId))
      return null
    })
  })

  socket.on(CLIENT_EVENTS.CHANNEL_LEAVE, (payload, ack) => {
    void respond(socket, ack, async () => {
      const { channelId } = channelRoomPayloadSchema.parse(payload)
      typing.stop({ kind: 'channel', id: channelId }, userId)
      await socket.leave(rooms.channel(channelId))
      return null
    })
  })

  socket.on(CLIENT_EVENTS.CONVERSATION_JOIN, (payload, ack) => {
    void respond(socket, ack, async () => {
      const { workspaceId, conversationId } = conversationRoomPayloadSchema.parse(payload)
      if (!(await access.canJoinConversation(userId, workspaceId, conversationId))) {
        throw forbidden()
      }
      await socket.join(rooms.conversation(conversationId))
      return null
    })
  })

  socket.on(CLIENT_EVENTS.CONVERSATION_LEAVE, (payload, ack) => {
    void respond(socket, ack, async () => {
      const { conversationId } = conversationRoomPayloadSchema.parse(payload)
      typing.stop({ kind: 'conversation', id: conversationId }, userId)
      await socket.leave(rooms.conversation(conversationId))
      return null
    })
  })

  socket.on(CLIENT_EVENTS.TYPING_START, (payload) => {
    const parsed = typingPayloadSchema.safeParse(payload)
    if (!parsed.success) return
    const { destination } = parsed.data
    if (!socket.rooms.has(destinationRoom(destination))) return
    typing.start(destination, userId)
  })

  socket.on(CLIENT_EVENTS.TYPING_STOP, (payload) => {
    const parsed = typingPayloadSchema.safeParse(payload)
    if (!parsed.success) return
    typing.stop(parsed.data.destination, userId)
  })
}
