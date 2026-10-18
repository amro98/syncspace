import { z } from 'zod'

import { ERROR_CODES } from '../constants/error-codes'

export const errorCodeSchema = z.enum(ERROR_CODES)

/** A single field-level validation problem. `path` is dot-joined (e.g. `members.0.email`). */
export const validationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
})

/**
 * Every non-2xx API response has exactly this shape.
 * Successful responses return the resource directly (no envelope).
 */
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    issues: z.array(validationIssueSchema).optional(),
    requestId: z.string().optional(),
  }),
})

/** Liveness: the process is up. Never touches dependencies. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
})

/** Readiness: dependencies (database) are reachable. */
export const readinessResponseSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  checks: z.object({
    database: z.enum(['ok', 'error', 'not_configured']),
  }),
})
