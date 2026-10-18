import {
  CHANNEL_TYPES,
  CONVERSATION_TYPES,
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_TYPES,
  TASK_PRIORITIES,
  WORKSPACE_ROLES,
} from '@syncspace/shared'
import { describe, expect, it } from 'vitest'

import * as PrismaEnums from '@/generated/prisma/enums'

/**
 * The Prisma schema and @syncspace/shared both declare the domain enums. This
 * test (plus the compile-time checks below) fails the build if they drift.
 */

type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Assert<T extends true> = T

/** Compile-time parity: typecheck fails if any union differs. */
export type EnumParity = [
  Assert<Equals<PrismaEnums.WorkspaceRole, (typeof WORKSPACE_ROLES)[number]>>,
  Assert<Equals<PrismaEnums.ChannelType, (typeof CHANNEL_TYPES)[number]>>,
  Assert<Equals<PrismaEnums.ConversationType, (typeof CONVERSATION_TYPES)[number]>>,
  Assert<Equals<PrismaEnums.TaskPriority, (typeof TASK_PRIORITIES)[number]>>,
  Assert<Equals<PrismaEnums.NotificationType, (typeof NOTIFICATION_TYPES)[number]>>,
  Assert<Equals<PrismaEnums.NotificationEntityType, (typeof NOTIFICATION_ENTITY_TYPES)[number]>>,
]

const pairs = [
  ['WorkspaceRole', PrismaEnums.WorkspaceRole, WORKSPACE_ROLES],
  ['ChannelType', PrismaEnums.ChannelType, CHANNEL_TYPES],
  ['ConversationType', PrismaEnums.ConversationType, CONVERSATION_TYPES],
  ['TaskPriority', PrismaEnums.TaskPriority, TASK_PRIORITIES],
  ['NotificationType', PrismaEnums.NotificationType, NOTIFICATION_TYPES],
  ['NotificationEntityType', PrismaEnums.NotificationEntityType, NOTIFICATION_ENTITY_TYPES],
] as const

describe('domain enums', () => {
  it.each(pairs)('%s matches between Prisma and @syncspace/shared', (_name, prisma, shared) => {
    expect(Object.values(prisma)).toEqual([...shared])
  })
})
