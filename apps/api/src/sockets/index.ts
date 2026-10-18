import type { Server as HttpServer } from 'node:http'

import { rooms } from '@syncspace/shared'
import { Server } from 'socket.io'

import { corsOptions } from '@/config/cors'
import { logger } from '@/lib/logger'

import { authenticateSocket } from './authenticate'
import { denyAllRoomAccess, type RoomAccessPolicy } from './room-access'
import { registerRoomHandlers } from './room-handlers'
import type { TypedServer } from './types'

export interface SocketServerOptions {
  roomAccess?: RoomAccessPolicy
}

/**
 * Creates the Socket.IO server on top of the HTTP server. Every connection is
 * authenticated during the handshake and automatically joins its personal
 * `user:<userId>` room (used for notifications and multi-tab sync).
 */
export function createSocketServer(
  httpServer: HttpServer,
  { roomAccess = denyAllRoomAccess }: SocketServerOptions = {},
): TypedServer {
  const io: TypedServer = new Server(httpServer, {
    cors: { origin: corsOptions.origin, credentials: corsOptions.credentials },
    serveClient: false,
  })

  io.use(authenticateSocket)

  io.on('connection', (socket) => {
    const { userId } = socket.data
    const log = logger.child({ socketId: socket.id, userId })

    void socket.join(rooms.user(userId))
    registerRoomHandlers(socket, roomAccess)

    log.debug('Socket connected')
    socket.on('disconnect', (reason) => {
      log.debug({ reason }, 'Socket disconnected')
    })
  })

  return io
}

export { realtime } from './realtime'
export type { TypedServer, TypedSocket } from './types'
