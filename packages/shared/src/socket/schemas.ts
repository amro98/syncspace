import { z } from 'zod'

import { PRESENCE_STATUSES } from '../constants/presence'
import { idSchema, isoDateTimeSchema } from '../schemas/common'

// ---------------------------------------------------------------------------
// Client -> server payloads. The server validates every inbound payload with
// these schemas; socket input is untrusted exactly like HTTP input.
// ---------------------------------------------------------------------------

export const workspaceRoomPayloadSchema = z.object({
  workspaceId: idSchema,
})

export const channelRoomPayloadSchema = z.object({
  workspaceId: idSchema,
  channelId: idSchema,
})

// ---------------------------------------------------------------------------
// Server -> client payloads.
//
// Until the domain DTOs exist, update events carry identifiers only and act as
// cache-invalidation signals: the client invalidates the matching TanStack
// Query keys. Once DTOs land, events may also carry the committed entity so the
// client can write it into the cache directly.
// ---------------------------------------------------------------------------

export const workspaceUpdatedPayloadSchema = z.object({
  workspaceId: idSchema,
})

export const channelUpdatedPayloadSchema = z.object({
  workspaceId: idSchema,
  channelId: idSchema,
})

export const presenceUpdatedPayloadSchema = z.object({
  userId: idSchema,
  status: z.enum(PRESENCE_STATUSES),
  lastActiveAt: isoDateTimeSchema,
})

export const notificationCreatedPayloadSchema = z.object({
  notificationId: idSchema,
})
