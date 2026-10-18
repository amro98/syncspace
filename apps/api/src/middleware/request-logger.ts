import { randomUUID } from 'node:crypto'

import { pinoHttp } from 'pino-http'

import { logger } from '@/lib/logger'

const REQUEST_ID_HEADER = 'x-request-id'
const REQUEST_ID_PATTERN = /^[\w-]{1,128}$/

/**
 * Per-request structured logging. Every request gets an id (reusing a sane
 * inbound `X-Request-Id`, e.g. from Render's proxy) that is echoed back in the
 * response header and included in error bodies.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const inbound = req.headers[REQUEST_ID_HEADER]
    const id =
      typeof inbound === 'string' && REQUEST_ID_PATTERN.test(inbound) ? inbound : randomUUID()
    res.setHeader(REQUEST_ID_HEADER, id)
    return id
  },
  customLogLevel(_req, res, error) {
    if (error || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  autoLogging: {
    ignore: (req) => req.url?.startsWith('/health') ?? false,
  },
})
