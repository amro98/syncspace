import { z } from 'zod'

import { PAGINATION } from '../constants/pagination'

/**
 * Opaque entity identifier. The concrete ID format (UUID / CUID) is decided in
 * the database-design phase; consumers must treat IDs as opaque strings.
 */
export const idSchema = z.string().trim().min(1).max(64)

export const isoDateTimeSchema = z.iso.datetime({ offset: true })

/** Query-string input for cursor-paginated list endpoints. */
export const cursorPaginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
})

export type CursorPaginationQuery = z.infer<typeof cursorPaginationQuerySchema>

/** Builds the response schema for a cursor-paginated list of `item`. */
export function cursorPageSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  })
}
