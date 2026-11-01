import type { z } from 'zod'

import type { ErrorCode } from '../constants/error-codes'
import type {
  channelEventPayloadSchema,
  channelRemovedPayloadSchema,
  channelRoomPayloadSchema,
  conversationEventPayloadSchema,
  conversationRoomPayloadSchema,
  messageCreatedPayloadSchema,
  messageEventPayloadSchema,
  notificationCreatedPayloadSchema,
  presenceUpdatedPayloadSchema,
  reactionUpdatedPayloadSchema,
  readUpdatedPayloadSchema,
  typingPayloadSchema,
  typingUpdatedPayloadSchema,
  workspaceRoomPayloadSchema,
  workspaceUpdatedPayloadSchema,
} from './schemas'

/** Events emitted by the client and handled by the server. */
export const CLIENT_EVENTS = {
  WORKSPACE_JOIN: 'workspace:join',
  WORKSPACE_LEAVE: 'workspace:leave',
  CHANNEL_JOIN: 'channel:join',
  CHANNEL_LEAVE: 'channel:leave',
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
} as const

/**
 * Events emitted by the server. Naming: `<entity>:<past-tense>`. Archiving and
 * gaining access to a private channel are `channel:updated` / `channel:created`
 * (the payload's `archivedAt` tells them apart); thread replies are
 * `message:created` with `parentMessageId` set and `parent` filled.
 */
export const SERVER_EVENTS = {
  WORKSPACE_UPDATED: 'workspace:updated',
  CHANNEL_CREATED: 'channel:created',
  CHANNEL_UPDATED: 'channel:updated',
  CHANNEL_REMOVED: 'channel:removed',
  MESSAGE_CREATED: 'message:created',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',
  REACTION_UPDATED: 'reaction:updated',
  TYPING_UPDATED: 'typing:updated',
  PRESENCE_UPDATED: 'presence:updated',
  CONVERSATION_CREATED: 'conversation:created',
  CONVERSATION_UPDATED: 'conversation:updated',
  READ_UPDATED: 'read:updated',
  NOTIFICATION_CREATED: 'notification:created',
} as const

export type ClientEventName = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS]
export type ServerEventName = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS]

export type WorkspaceRoomPayload = z.infer<typeof workspaceRoomPayloadSchema>
export type ChannelRoomPayload = z.infer<typeof channelRoomPayloadSchema>
export type ConversationRoomPayload = z.infer<typeof conversationRoomPayloadSchema>
export type TypingPayload = z.infer<typeof typingPayloadSchema>
export type WorkspaceUpdatedPayload = z.infer<typeof workspaceUpdatedPayloadSchema>
export type ChannelEventPayload = z.infer<typeof channelEventPayloadSchema>
export type ChannelRemovedPayload = z.infer<typeof channelRemovedPayloadSchema>
export type MessageCreatedPayload = z.infer<typeof messageCreatedPayloadSchema>
export type MessageEventPayload = z.infer<typeof messageEventPayloadSchema>
export type ReactionUpdatedPayload = z.infer<typeof reactionUpdatedPayloadSchema>
export type TypingUpdatedPayload = z.infer<typeof typingUpdatedPayloadSchema>
export type PresenceUpdatedPayload = z.infer<typeof presenceUpdatedPayloadSchema>
export type ConversationEventPayload = z.infer<typeof conversationEventPayloadSchema>
export type ReadUpdatedPayload = z.infer<typeof readUpdatedPayloadSchema>
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
  [CLIENT_EVENTS.CONVERSATION_JOIN]: (
    payload: ConversationRoomPayload,
    ack: SocketAckCallback,
  ) => void
  [CLIENT_EVENTS.CONVERSATION_LEAVE]: (
    payload: ConversationRoomPayload,
    ack: SocketAckCallback,
  ) => void
  /** Fire-and-forget (no ack): throttled by the client, expired by the server. */
  [CLIENT_EVENTS.TYPING_START]: (payload: TypingPayload) => void
  [CLIENT_EVENTS.TYPING_STOP]: (payload: TypingPayload) => void
}

export interface ServerToClientEvents {
  [SERVER_EVENTS.WORKSPACE_UPDATED]: (payload: WorkspaceUpdatedPayload) => void
  [SERVER_EVENTS.CHANNEL_CREATED]: (payload: ChannelEventPayload) => void
  [SERVER_EVENTS.CHANNEL_UPDATED]: (payload: ChannelEventPayload) => void
  [SERVER_EVENTS.CHANNEL_REMOVED]: (payload: ChannelRemovedPayload) => void
  [SERVER_EVENTS.MESSAGE_CREATED]: (payload: MessageCreatedPayload) => void
  [SERVER_EVENTS.MESSAGE_UPDATED]: (payload: MessageEventPayload) => void
  [SERVER_EVENTS.MESSAGE_DELETED]: (payload: MessageEventPayload) => void
  [SERVER_EVENTS.REACTION_UPDATED]: (payload: ReactionUpdatedPayload) => void
  [SERVER_EVENTS.TYPING_UPDATED]: (payload: TypingUpdatedPayload) => void
  [SERVER_EVENTS.PRESENCE_UPDATED]: (payload: PresenceUpdatedPayload) => void
  [SERVER_EVENTS.CONVERSATION_CREATED]: (payload: ConversationEventPayload) => void
  [SERVER_EVENTS.CONVERSATION_UPDATED]: (payload: ConversationEventPayload) => void
  [SERVER_EVENTS.READ_UPDATED]: (payload: ReadUpdatedPayload) => void
  [SERVER_EVENTS.NOTIFICATION_CREATED]: (payload: NotificationCreatedPayload) => void
}

/** Events exchanged between server instances (e.g. via a Redis adapter). None yet. */
export type InterServerEvents = Record<string, never>

/** Per-socket data attached by the server's authentication middleware. */
export interface SocketData {
  userId: string
}
