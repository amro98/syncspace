import { randomUUID } from 'node:crypto'

import { pinoHttp } from 'pino-http'

import { logger } from '@/lib/logger'

const REQUEST_ID_HEADER = 'x-request-id'

/**
 * The URL as logged: the path and the NAMES of query parameters, never their
 * values (OAuth codes/state, search terms, cursors). `/a?code=x&state=y`
 * becomes `/a?code=…&state=…`.
 */
export function scrubUrl(url: string | undefined): string {
  if (!url) return ''
  const queryStart = url.indexOf('?')
  if (queryStart < 0) return url
  const keys = [...new URLSearchParams(url.slice(queryStart + 1)).keys()]
  return `${url.slice(0, queryStart)}?${keys.map((key) => `${encodeURIComponent(key)}=…`).join('&')}`
}
const REQUEST_ID_PATTERN = /^[\w-]{1,128}$/

/**
 * Per-request structured logging. Every request gets an id (reusing a sane
 * inbound `X-Request-Id`, e.g. from Render's proxy) that is echoed back in the
 * response header and included in error bodies.
 */
export const requestLogger = pinoHttp({
  logger,
  // Minimal by design: no headers (cookies), no query values, no response
  // headers (e.g. the signed storage URL in an attachment redirect).
  serializers: {
    req: (req: { id: unknown; method: string; url?: string; remoteAddress?: string }) => ({
      id: req.id,
      method: req.method,
      url: scrubUrl(req.url),
      remoteAddress: req.remoteAddress,
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
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
