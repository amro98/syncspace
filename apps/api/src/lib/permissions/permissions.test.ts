import { describe, expect, it } from 'vitest'

import type { AppError } from '@/lib/errors'

import {
  authorize,
  canAccessChannel,
  canDeleteMessage,
  canEditTask,
  ensureVisible,
  toActor,
  toChannelContext,
  toConversationContext,
  toMessageContext,
  toTaskContext,
} from './index'

const USER = '01920000-7c00-7000-8000-000000000001'
const OTHER = '01920000-7c00-7000-8000-000000000002'
const ARCHIVED_AT = new Date('2026-01-01T00:00:00Z')

describe('context mappers', () => {
  it('maps a missing membership to a non-member actor', () => {
    expect(toActor(USER, null)).toEqual({ userId: USER, role: null })
    expect(toActor(USER, { role: 'ADMIN' })).toEqual({ userId: USER, role: 'ADMIN' })
  })

  it('maps archived timestamps to flags', () => {
    expect(toChannelContext({ type: 'PRIVATE', archivedAt: ARCHIVED_AT }, true)).toEqual({
      type: 'PRIVATE',
      isArchived: true,
      isMember: true,
    })
    expect(toTaskContext({ createdById: USER }, { createdById: OTHER, archivedAt: null })).toEqual({
      createdById: USER,
      board: { createdById: OTHER, isArchived: false },
    })
  })

  it('maps messages with their destination', () => {
    const context = toMessageContext(
      { authorId: USER, deletedAt: null, parentMessageId: OTHER },
      { conversation: toConversationContext({ type: 'DIRECT' }, true) },
    )
    expect(context).toEqual({
      authorId: USER,
      isDeleted: false,
      isReply: true,
      destination: { kind: 'conversation', conversation: { type: 'DIRECT', isParticipant: true } },
    })
  })
})

describe('policy through mapped contexts', () => {
  it('denies a non-member everything, regardless of the resource', () => {
    const outsider = toActor(USER, null)
    expect(
      canAccessChannel(outsider, toChannelContext({ type: 'PUBLIC', archivedAt: null }, false)),
    ).toBe(false)
    expect(
      canEditTask(
        outsider,
        toTaskContext({ createdById: USER }, { createdById: USER, archivedAt: null }),
      ),
    ).toBe(false)
  })

  it('lets an admin moderate a channel message mapped from rows', () => {
    const admin = toActor(USER, { role: 'ADMIN' })
    const message = toMessageContext(
      { authorId: OTHER, deletedAt: null, parentMessageId: null },
      { channel: toChannelContext({ type: 'PRIVATE', archivedAt: null }, false) },
    )
    expect(canDeleteMessage(admin, message)).toBe(true)
  })
})

describe('enforcement', () => {
  it('hides invisible resources as NOT_FOUND', () => {
    expect(() => {
      ensureVisible(false)
    }).toThrow(expect.objectContaining({ code: 'NOT_FOUND', status: 404 }) as AppError)
    expect(() => {
      ensureVisible(true)
    }).not.toThrow()
  })

  it('rejects disallowed actions as FORBIDDEN', () => {
    expect(() => {
      authorize(false, 'Only admins can archive channels')
    }).toThrow(
      expect.objectContaining({
        code: 'FORBIDDEN',
        status: 403,
        message: 'Only admins can archive channels',
      }) as AppError,
    )
    expect(() => {
      authorize(true)
    }).not.toThrow()
  })
})
