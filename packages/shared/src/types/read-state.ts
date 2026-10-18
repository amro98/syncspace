import type { z } from 'zod'

import type {
  destinationUnreadSchema,
  markReadInputSchema,
  readCursorSchema,
  unreadSummarySchema,
} from '../schemas/read-state'

export type ReadCursor = z.infer<typeof readCursorSchema>
export type MarkReadInput = z.infer<typeof markReadInputSchema>
export type DestinationUnread = z.infer<typeof destinationUnreadSchema>
export type UnreadSummary = z.infer<typeof unreadSummarySchema>
