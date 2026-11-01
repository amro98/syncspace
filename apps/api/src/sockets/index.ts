import type { Server as HttpServer } from 'node:http'

import { rooms, SERVER_EVENTS } from '@syncspace/shared'
import { Server } from 'socket.io'

import { corsOptions } from '@/config/cors'
import { logger } from '@/lib/logger'
import { getPrisma } from '@/lib/prisma'

import { authenticateSocket } from './authenticate'
import { presence } from './presence'
import { denyAllRoomAccess, type RoomAccessPolicy } from './room-access'
import { registerRoomHandlers } from './room-handlers'
import { createTypingTracker, TYPING_TTL_MS } from './typing'
import type { TypedServer } from './types'

export interface SocketServerOptions {
  roomAccess?: RoomAccessPolicy
  /** Delay before a fully disconnected user is announced offline (page reloads). */
  presenceGraceMs?: number
  typingTtlMs?: number
}

const DEFAULT_PRESENCE_GRACE_MS = 5_000

/** Announces a presence change to every workspace the user belongs to. */
async function broadcastPresence(io: TypedServer, userId: string, status: 'online' | 'offline') {
  const prisma = getPrisma()
  const now = new Date()
  const [memberships] = await Promise.all([
    prisma.workspaceMember.findMany({ where: { userId }, select: { workspaceId: true } }),
    // "Last seen" is persisted only when the user goes fully offline.
    status === 'offline'
      ? prisma.user.update({ where: { id: userId }, data: { lastSeenAt: now } }).catch(() => null)
      : Promise.resolve(null),
  ])
  if (memberships.length === 0) return
  io.to(memberships.map((membership) => rooms.workspace(membership.workspaceId))).emit(
    SERVER_EVENTS.PRESENCE_UPDATED,
    { userId, status, lastActiveAt: now.toISOString() },
  )
}

/**
 * Creates the Socket.IO server on top of the HTTP server. Every connection is
 * authenticated during the handshake, joins its personal `user:<userId>` room,
 * and is counted for presence (online while any tab/device is connected).
 */
export function createSocketServer(
  httpServer: HttpServer,
  {
    roomAccess = denyAllRoomAccess,
    presenceGraceMs = DEFAULT_PRESENCE_GRACE_MS,
    typingTtlMs = TYPING_TTL_MS,
  }: SocketServerOptions = {},
): TypedServer {
  const io: TypedServer = new Server(httpServer, {
    cors: { origin: corsOptions.origin, credentials: corsOptions.credentials },
    serveClient: false,
  })
  const typing = createTypingTracker(io, typingTtlMs)

  io.use(authenticateSocket)

  io.on('connection', (socket) => {
    const { userId } = socket.data
    const log = logger.child({ socketId: socket.id, userId })

    void socket.join(rooms.user(userId))
    registerRoomHandlers(socket, roomAccess, typing)

    if (presence.connect(userId)) {
      broadcastPresence(io, userId, 'online').catch((error: unknown) => {
        log.warn({ err: error }, 'Failed to broadcast presence')
      })
    }

    log.debug('Socket connected')
    socket.on('disconnect', (reason) => {
      log.debug({ reason }, 'Socket disconnected')
      typing.stopEverywhere(userId)
      presence.disconnect(userId, presenceGraceMs, () => {
        broadcastPresence(io, userId, 'offline').catch((error: unknown) => {
          log.warn({ err: error }, 'Failed to broadcast presence')
        })
      })
    })
  })

  return io
}

export { realtime } from './realtime'
export type { TypedServer, TypedSocket } from './types'
