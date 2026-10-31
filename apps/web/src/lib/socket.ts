import type { ClientToServerEvents, ServerToClientEvents } from '@syncspace/shared'
import { io, type Socket } from 'socket.io-client'

import { env } from '@/lib/env'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: AppSocket | undefined

/**
 * The single typed Socket.IO client for the app.
 *
 * - Authenticates with the same httpOnly cookie as REST (`withCredentials`).
 * - Never auto-connects: the connection lifecycle is owned by the realtime
 *   provider that will be mounted once a session exists.
 * - Realtime events update the TanStack Query cache (invalidate or
 *   setQueryData) — they are never stored as a parallel copy of server state.
 */
export function getSocket(): AppSocket {
  socket ??= io(env.VITE_API_BASE_URL, {
    withCredentials: true,
    autoConnect: false,
  })
  return socket
}

/**
 * Closes the connection (sign-out). The next session reconnects through
 * `getSocket().connect()`, and the server re-authenticates the new cookie.
 */
export function disconnectSocket(): void {
  socket?.disconnect()
}
