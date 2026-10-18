/**
 * List endpoints use cursor pagination (stable under concurrent inserts, which
 * matters for chat history and realtime-updated lists).
 */
export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 100,
} as const
