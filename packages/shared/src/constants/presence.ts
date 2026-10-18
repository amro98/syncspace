export const PRESENCE_STATUSES = ['online', 'away', 'offline'] as const

export type PresenceStatus = (typeof PRESENCE_STATUSES)[number]
