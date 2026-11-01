/**
 * Domain enums shared by the web client and the API.
 *
 * These are the single source of truth for enum values outside the database.
 * The Prisma schema declares the same enums; an API test fails if the two ever
 * drift apart. Arrays are ordered meaningfully (e.g. roles from most to least
 * privileged, priorities from lowest to highest).
 */

export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

/** Roles that can be granted by invitation or role change (OWNER only moves by transfer). */
export const ASSIGNABLE_WORKSPACE_ROLES = [
  'ADMIN',
  'MEMBER',
] as const satisfies readonly WorkspaceRole[]
export type AssignableWorkspaceRole = (typeof ASSIGNABLE_WORKSPACE_ROLES)[number]

/** Social sign-in providers (Prisma enum `AuthProvider`). */
export const AUTH_PROVIDERS = ['GOOGLE', 'GITHUB'] as const
export type AuthProvider = (typeof AUTH_PROVIDERS)[number]

export const CHANNEL_TYPES = ['PUBLIC', 'PRIVATE'] as const
export type ChannelType = (typeof CHANNEL_TYPES)[number]

export const CONVERSATION_TYPES = ['DIRECT', 'GROUP'] as const
export type ConversationType = (typeof CONVERSATION_TYPES)[number]

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const NOTIFICATION_TYPES = [
  'MESSAGE',
  'MENTION',
  'TASK_ASSIGNED',
  'TASK_UPDATED',
  'INVITE',
  'SYSTEM',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const NOTIFICATION_ENTITY_TYPES = [
  'WORKSPACE',
  'CHANNEL',
  'CONVERSATION',
  'MESSAGE',
  'BOARD',
  'TASK',
  'INVITE',
] as const
export type NotificationEntityType = (typeof NOTIFICATION_ENTITY_TYPES)[number]

/** A GROUP conversation has the creator plus at least this many others (fewer = a DM). */
export const GROUP_CONVERSATION_MIN_OTHERS = 2

/** Field limits shared by client-side forms and server-side validation. */
export const LIMITS = {
  USER_NAME_MAX: 80,
  WORKSPACE_NAME_MAX: 80,
  SLUG_MAX: 48,
  CHANNEL_NAME_MAX: 80,
  CHANNEL_DESCRIPTION_MAX: 500,
  CONVERSATION_NAME_MAX: 80,
  GROUP_CONVERSATION_MAX_PARTICIPANTS: 9,
  MESSAGE_CONTENT_MAX: 10_000,
  BOARD_NAME_MAX: 80,
  COLUMN_NAME_MAX: 60,
  TASK_TITLE_MAX: 200,
  TASK_DESCRIPTION_MAX: 10_000,
  LABEL_NAME_MAX: 40,
  EMOJI_MAX: 64,
  /** Unread counts are computed up to this cap; clients render "99+". */
  UNREAD_COUNT_CAP: 100,
} as const
