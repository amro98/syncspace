import type { z } from 'zod'

import type { ErrorCode } from '../constants/error-codes'
import type {
  channelRoomPayloadSchema,
  channelUpdatedPayloadSchema,
  notificationCreatedPayloadSchema,
  presenceUpdatedPayloadSchema,
  workspaceRoomPayloadSchema,
  workspaceUpdatedPayloadSchema,
} from './schemas'

/** Events emitted by the client and handled by the server. */
export const CLIENT_EVENTS = {
  WORKSPACE_JOIN: 'workspace:join',
  WORKSPACE_LEAVE: 'workspace:leave',
  CHANNEL_JOIN: 'channel:join',
  CHANNEL_LEAVE: 'channel:leave',
} as const

/** Events emitted by the server and handled by the client. */
export const SERVER_EVENTS = {
  WORKSPACE_UPDATED: 'workspace:updated',
  CHANNEL_UPDATED: 'channel:updated',
  PRESENCE_UPDATED: 'presence:updated',
  NOTIFICATION_CREATED: 'notification:created',
} as const

export type ClientEventName = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS]
export type ServerEventName = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS]

export type WorkspaceRoomPayload = z.infer<typeof workspaceRoomPayloadSchema>
export type ChannelRoomPayload = z.infer<typeof channelRoomPayloadSchema>
export type WorkspaceUpdatedPayload = z.infer<typeof workspaceUpdatedPayloadSchema>
export type ChannelUpdatedPayload = z.infer<typeof channelUpdatedPayloadSchema>
export type PresenceUpdatedPayload = z.infer<typeof presenceUpdatedPayloadSchema>
export type NotificationCreatedPayload = z.infer<typeof notificationCreatedPayloadSchema>

/**
 * Acknowledgement returned for every client -> server event that expects one.
 * Mirrors the REST error contract (`code` + `message`).
 */
export type SocketAck<TData = null> =
  { ok: true; data: TData } | { ok: false; error: { code: ErrorCode; message: string } }

export type SocketAckCallback<TData = null> = (response: SocketAck<TData>) => void

export interface ClientToServerEvents {
  [CLIENT_EVENTS.WORKSPACE_JOIN]: (payload: WorkspaceRoomPayload, ack: SocketAckCallback) => void
  [CLIENT_EVENTS.WORKSPACE_LEAVE]: (payload: WorkspaceRoomPayload, ack: SocketAckCallback) => void
  [CLIENT_EVENTS.CHANNEL_JOIN]: (payload: ChannelRoomPayload, ack: SocketAckCallback) => void
  [CLIENT_EVENTS.CHANNEL_LEAVE]: (payload: ChannelRoomPayload, ack: SocketAckCallback) => void
}

export interface ServerToClientEvents {
  [SERVER_EVENTS.WORKSPACE_UPDATED]: (payload: WorkspaceUpdatedPayload) => void
  [SERVER_EVENTS.CHANNEL_UPDATED]: (payload: ChannelUpdatedPayload) => void
  [SERVER_EVENTS.PRESENCE_UPDATED]: (payload: PresenceUpdatedPayload) => void
  [SERVER_EVENTS.NOTIFICATION_CREATED]: (payload: NotificationCreatedPayload) => void
}

/** Events exchanged between server instances (e.g. via a Redis adapter). None yet. */
export type InterServerEvents = Record<string, never>

/** Per-socket data attached by the server's authentication middleware. */
export interface SocketData {
  userId: string
}
