import type { ApiErrorResponse } from '@syncspace/shared'
import type { ErrorRequestHandler, RequestHandler } from 'express'

import { notFound, toAppError } from '@/lib/errors'

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`Route ${req.method} ${req.path} not found`))
}

/**
 * Central error handler: every error leaves the API as `{ error: { code,
 * message, issues?, requestId } }`. Stack traces are logged, never returned.
 */
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  const appError = toAppError(error)

  if (appError.status >= 500) {
    req.log.error({ err: error }, 'Request failed')
  }

  if (res.headersSent) {
    next(error)
    return
  }

  const requestId = typeof req.id === 'string' ? req.id : undefined
  const body: ApiErrorResponse = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.issues && { issues: appError.issues }),
      ...(requestId && { requestId }),
    },
  }
  res.status(appError.status).json(body)
}
