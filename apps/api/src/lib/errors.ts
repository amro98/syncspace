import { ERROR_STATUS, type ErrorCode, type ValidationIssue } from '@syncspace/shared'
import { ZodError } from 'zod'

import { env } from '@/config/env'
import { toValidationIssues } from '@/utils/zod'

/**
 * The only error type that is allowed to reach clients with its message intact.
 * Anything else is reported as a generic INTERNAL_ERROR.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly issues: ValidationIssue[] | undefined

  constructor(
    code: ErrorCode,
    message: string,
    options: { issues?: ValidationIssue[]; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.status = ERROR_STATUS[code]
    this.issues = options.issues
  }
}

export const badRequest = (message = 'Bad request') => new AppError('BAD_REQUEST', message)

export const unauthenticated = (message = 'Authentication required') =>
  new AppError('UNAUTHENTICATED', message)

export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError('FORBIDDEN', message)

export const notFound = (message = 'Resource not found') => new AppError('NOT_FOUND', message)

export const conflict = (message = 'Resource conflict') => new AppError('CONFLICT', message)

/** Errors raised by body-parser carry a `type` and an HTTP `status`. */
function isBodyParserError(error: unknown): error is Error & { type: string; status: number } {
  return (
    error instanceof Error &&
    typeof (error as { type?: unknown }).type === 'string' &&
    typeof (error as { status?: unknown }).status === 'number'
  )
}

/**
 * Normalises any thrown value into an AppError. Used by both the HTTP error
 * handler and socket acknowledgements so the two transports report errors
 * identically. Unknown errors become INTERNAL_ERROR.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error

  if (error instanceof ZodError) {
    return new AppError('VALIDATION_ERROR', 'Validation failed', {
      issues: toValidationIssues(error),
      cause: error,
    })
  }

  if (isBodyParserError(error)) {
    if (error.type === 'entity.parse.failed') {
      return new AppError('BAD_REQUEST', 'Malformed JSON request body', { cause: error })
    }
    if (error.type === 'entity.too.large') {
      return new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large', { cause: error })
    }
    if (error.status < 500) {
      return new AppError('BAD_REQUEST', 'Invalid request body', { cause: error })
    }
  }

  // Never leak internals in production; keep the message in development for debugging.
  const message =
    !env.isProduction && error instanceof Error ? error.message : 'Internal server error'
  return new AppError('INTERNAL_ERROR', message, { cause: error })
}
