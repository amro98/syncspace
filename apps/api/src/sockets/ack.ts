import type { SocketAck, SocketAckCallback } from '@syncspace/shared'

import { toAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

import type { TypedSocket } from './types'

/**
 * Runs a socket event handler and always answers the acknowledgement with the
 * shared `SocketAck` shape. Errors are normalised exactly like REST errors.
 * Socket input is untrusted: a missing/invalid ack callback is tolerated.
 */
export async function respond<TData>(
  socket: TypedSocket,
  ack: SocketAckCallback<TData> | undefined,
  handler: () => Promise<TData>,
): Promise<void> {
  let response: SocketAck<TData>
  try {
    response = { ok: true, data: await handler() }
  } catch (error) {
    const appError = toAppError(error)
    if (appError.status >= 500) {
      logger.error(
        { err: error, socketId: socket.id, userId: socket.data.userId },
        'Socket handler failed',
      )
    }
    response = { ok: false, error: { code: appError.code, message: appError.message } }
  }
  if (typeof ack === 'function') ack(response)
}
