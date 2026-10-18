import {
  channelRoomPayloadSchema,
  CLIENT_EVENTS,
  rooms,
  workspaceRoomPayloadSchema,
} from '@syncspace/shared'

import { forbidden } from '@/lib/errors'

import { respond } from './ack'
import type { RoomAccessPolicy } from './room-access'
import type { TypedSocket } from './types'

/**
 * Subscription management: clients ask to join the rooms for whatever they are
 * currently viewing. Joins are authorized; leaves are always allowed.
 */
export function registerRoomHandlers(socket: TypedSocket, access: RoomAccessPolicy): void {
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
      await socket.leave(rooms.channel(channelId))
      return null
    })
  })
}
