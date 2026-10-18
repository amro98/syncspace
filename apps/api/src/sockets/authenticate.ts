import type { ErrorCode } from '@syncspace/shared'
import type { ExtendedError } from 'socket.io'

import { ACCESS_TOKEN_COOKIE } from '@/config/auth'
import { verifyAccessToken } from '@/lib/tokens'
import { parseCookieHeader } from '@/utils/cookies'

import type { TypedSocket } from './types'

/** Error delivered to the client's `connect_error` handler (`err.message`, `err.data.code`). */
function connectError(code: ErrorCode, message: string): ExtendedError {
  return Object.assign(new Error(message), { data: { code } })
}

/**
 * Handshake authentication. Uses the same httpOnly access-token cookie as the
 * REST API, so the browser client connects with `withCredentials: true` and
 * never handles the token itself.
 */
export function authenticateSocket(socket: TypedSocket, next: (error?: ExtendedError) => void) {
  const token = parseCookieHeader(socket.handshake.headers.cookie).get(ACCESS_TOKEN_COOKIE)
  if (!token) {
    next(connectError('UNAUTHENTICATED', 'Authentication required'))
    return
  }
  try {
    socket.data.userId = verifyAccessToken(token).sub
    next()
  } catch {
    next(connectError('UNAUTHENTICATED', 'Invalid or expired session'))
  }
}
