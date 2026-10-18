import { z } from 'zod'

import {
  ASSIGNABLE_WORKSPACE_ROLES,
  CHANNEL_TYPES,
  CONVERSATION_TYPES,
  LIMITS,
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_TYPES,
  TASK_PRIORITIES,
  WORKSPACE_ROLES,
} from '../constants/domain'

export const workspaceRoleSchema = z.enum(WORKSPACE_ROLES)
export const assignableWorkspaceRoleSchema = z.enum(ASSIGNABLE_WORKSPACE_ROLES)
export const channelTypeSchema = z.enum(CHANNEL_TYPES)
export const conversationTypeSchema = z.enum(CONVERSATION_TYPES)
export const taskPrioritySchema = z.enum(TASK_PRIORITIES)
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES)
export const notificationEntityTypeSchema = z.enum(NOTIFICATION_ENTITY_TYPES)

/** Matches the database CHECK constraint on users.email / workspace_invites.email. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))

/** URL slug, matching the database CHECK constraint (`^[a-z0-9]+(-[a-z0-9]+)*$`). */
export const slugSchema = z
  .string()
  .max(LIMITS.SLUG_MAX)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens')

/** `#RRGGBB`, matching the database CHECK constraint on task_labels.color. */
export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a #RRGGBB colour')
