import type { z } from 'zod'

import type {
  apiErrorResponseSchema,
  healthResponseSchema,
  readinessResponseSchema,
  validationIssueSchema,
} from '../schemas/api'

export type ValidationIssue = z.infer<typeof validationIssueSchema>
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>
export type ApiErrorBody = ApiErrorResponse['error']
export type HealthResponse = z.infer<typeof healthResponseSchema>
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>

/** Response shape of every cursor-paginated list endpoint. */
export interface CursorPage<TItem> {
  items: TItem[]
  nextCursor: string | null
}
