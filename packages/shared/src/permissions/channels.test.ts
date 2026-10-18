import { describe, expect, it } from 'vitest'

import {
  canAccessChannel,
  canAddChannelMember,
  canCreateChannel,
  canJoinChannel,
  canManageChannel,
  canPostInChannel,
  canRemoveChannelMember,
} from './channels'
import { ADMIN, channel, matrix, MEMBER, OUTSIDER, OWNER } from './test-fixtures'

const publicChannel = channel({ type: 'PUBLIC' })
const privateAsMember = channel({ type: 'PRIVATE', isMember: true })
const privateAsNonMember = channel({ type: 'PRIVATE', isMember: false })

describe('public channels', () => {
  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: true, OUTSIDER: false }))(
    '%s can read and post without a channel membership row: %s',
    (_name, actor, expected) => {
      expect(canAccessChannel(actor, publicChannel)).toBe(expected)
      expect(canPostInChannel(actor, publicChannel)).toBe(expected)
    },
  )

  it('can be joined by members who are not in it yet', () => {
    expect(canJoinChannel(MEMBER, publicChannel)).toBe(true)
    expect(canJoinChannel(MEMBER, channel({ isMember: true }))).toBe(false)
    expect(canJoinChannel(OUTSIDER, publicChannel)).toBe(false)
  })
})

describe('private channels', () => {
  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: true, OUTSIDER: false }))(
    '%s can read when they are a channel member: %s',
    (_name, actor, expected) => {
      expect(canAccessChannel(actor, privateAsMember)).toBe(expected)
    },
  )

  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: false, OUTSIDER: false }))(
    '%s can read when they are NOT a channel member (admin oversight): %s',
    (_name, actor, expected) => {
      expect(canAccessChannel(actor, privateAsNonMember)).toBe(expected)
    },
  )

  it('only lets explicit channel members post — oversight is read-only', () => {
    expect(canPostInChannel(MEMBER, privateAsMember)).toBe(true)
    expect(canPostInChannel(OWNER, privateAsNonMember)).toBe(false)
    expect(canPostInChannel(ADMIN, privateAsNonMember)).toBe(false)
    expect(canPostInChannel(MEMBER, privateAsNonMember)).toBe(false)
  })

  it('cannot be self-joined, only added to', () => {
    expect(canJoinChannel(MEMBER, privateAsNonMember)).toBe(false)
    expect(canJoinChannel(OWNER, privateAsNonMember)).toBe(false)
  })

  it('lets channel members and admins add people', () => {
    expect(canAddChannelMember(MEMBER, privateAsMember)).toBe(true)
    expect(canAddChannelMember(ADMIN, privateAsNonMember)).toBe(true)
    expect(canAddChannelMember(MEMBER, privateAsNonMember)).toBe(false)
    expect(canAddChannelMember(OUTSIDER, privateAsMember)).toBe(false)
  })

  it('does not use membership rows to grant access to public channels', () => {
    expect(canAddChannelMember(OWNER, publicChannel)).toBe(false)
  })
})

describe('archived channels', () => {
  const archivedPublic = channel({ isArchived: true })
  const archivedPrivate = channel({ type: 'PRIVATE', isArchived: true, isMember: true })

  it('stay readable but become read-only', () => {
    expect(canAccessChannel(MEMBER, archivedPublic)).toBe(true)
    expect(canPostInChannel(MEMBER, archivedPublic)).toBe(false)
    expect(canPostInChannel(MEMBER, archivedPrivate)).toBe(false)
    expect(canJoinChannel(MEMBER, archivedPublic)).toBe(false)
    expect(canAddChannelMember(OWNER, archivedPrivate)).toBe(false)
  })

  it('can still be managed (e.g. unarchived) by admins', () => {
    expect(canManageChannel(ADMIN, archivedPublic)).toBe(true)
  })
})

describe('channel management', () => {
  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: true, OUTSIDER: false }))(
    '%s can create channels: %s',
    (_name, actor, expected) => {
      expect(canCreateChannel(actor)).toBe(expected)
    },
  )

  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: false, OUTSIDER: false }))(
    '%s can manage public and private channels: %s',
    (_name, actor, expected) => {
      expect(canManageChannel(actor, publicChannel)).toBe(expected)
      expect(canManageChannel(actor, privateAsNonMember)).toBe(expected)
    },
  )

  it('lets members leave, and admins remove others', () => {
    expect(canRemoveChannelMember(MEMBER, privateAsMember, MEMBER.userId)).toBe(true)
    expect(canRemoveChannelMember(MEMBER, privateAsNonMember, MEMBER.userId)).toBe(false)
    expect(canRemoveChannelMember(MEMBER, privateAsMember, 'someone-else')).toBe(false)
    expect(canRemoveChannelMember(ADMIN, privateAsNonMember, 'someone-else')).toBe(true)
    expect(canRemoveChannelMember(OUTSIDER, privateAsMember, 'someone-else')).toBe(false)
  })
})
