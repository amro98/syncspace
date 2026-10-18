import type { RequestHandler } from 'express'

import { isAllowedOrigin } from '@/config/cors'
import { forbidden } from '@/lib/errors'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF defence-in-depth for cookie authentication: state-changing requests
 * that come from a browser must originate from an allowed origin. Requests
 * without an Origin header (server-to-server, CLI tools) are not browser CSRF
 * vectors and are allowed through to normal authentication.
 */
export const verifyOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.headers.origin
  if (SAFE_METHODS.has(req.method) || origin === undefined || isAllowedOrigin(origin)) {
    next()
    return
  }
  throw forbidden('Origin not allowed')
}
