import type { RoomName, ServerEventName, ServerToClientEvents } from '@syncspace/shared'

import { logger } from '@/lib/logger'

import type { TypedServer } from './types'

let io: TypedServer | null = null

/**
 * The only way application code publishes realtime events.
 *
 * Rule: call `realtime.emit` only AFTER the database write has committed —
 * never inside a transaction and never instead of persisting. A dropped socket
 * event must at worst cause a stale view that the next refetch corrects.
 */
export const realtime = {
  attach(server: TypedServer): void {
    io = server
  },

  detach(): void {
    io = null
  },

  emit<TEvent extends ServerEventName>(
    room: RoomName | RoomName[],
    event: TEvent,
    ...args: Parameters<ServerToClientEvents[TEvent]>
  ): void {
    if (!io) {
      // Expected in unit tests and scripts that run without a socket server.
      logger.debug({ room, event }, 'Realtime server not attached; event dropped')
      return
    }
    io.to(room).emit(event, ...args)
  },
}
