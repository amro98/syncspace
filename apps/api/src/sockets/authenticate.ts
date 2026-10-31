import type { ErrorCode } from '@syncspace/shared'
import type { ExtendedError } from 'socket.io'

import { SESSION_COOKIE } from '@/config/auth'
import { logger } from '@/lib/logger'
import { authenticateSessionToken } from '@/modules/auth/session'
import { parseCookieHeader } from '@/utils/cookies'

import type { TypedSocket } from './types'

/** Error delivered to the client's `connect_error` handler (`err.message`, `err.data.code`). */
function connectError(code: ErrorCode, message: string): ExtendedError {
  return Object.assign(new Error(message), { data: { code } })
}

/**
 * Handshake authentication. Uses the same httpOnly session cookie as the REST
 * API (including the token-version revocation check), so the browser client
 * connects with `withCredentials: true` and never handles the token itself.
 */
export async function authenticateSocket(
  socket: TypedSocket,
  next: (error?: ExtendedError) => void,
): Promise<void> {
  const token = parseCookieHeader(socket.handshake.headers.cookie).get(SESSION_COOKIE)
  if (!token) {
    next(connectError('UNAUTHENTICATED', 'Authentication required'))
    return
  }
  try {
    socket.data.userId = (await authenticateSessionToken(token)).userId
    next()
  } catch (error) {
    if (!(error instanceof Error && 'code' in error)) {
      logger.error({ err: error }, 'Socket authentication failed unexpectedly')
    }
    next(connectError('UNAUTHENTICATED', 'Invalid or expired session'))
  }
}
