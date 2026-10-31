import { createServer } from 'node:http'

import { createApp } from '@/app'
import { env } from '@/config/env'
import { logger } from '@/lib/logger'
import { disconnectPrisma } from '@/lib/prisma'
import { createSocketServer, realtime } from '@/sockets'
import { membershipRoomAccess } from '@/sockets/room-access'

const SHUTDOWN_TIMEOUT_MS = 10_000

const httpServer = createServer(createApp())
const io = createSocketServer(httpServer, { roomAccess: membershipRoomAccess })
realtime.attach(io)

if (env.usingDevJwtSecret) {
  logger.warn('JWT_SECRET is not set; using an insecure development secret')
}

httpServer.listen(env.PORT, () => {
  logger.info(`SyncSpace API listening on http://localhost:${String(env.PORT)} (${env.NODE_ENV})`)
})

let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'Shutting down')

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out; forcing exit')
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  forceExit.unref()

  realtime.detach()
  // Closes all socket connections and the underlying HTTP server.
  await io.close()
  await disconnectPrisma()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection')
  process.exit(1)
})
