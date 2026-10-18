import { describe, expect, it } from 'vitest'

import { evaluateInviteAcceptance, type InviteState } from '../permissions/invites'
import { directConversationKey } from './direct-conversation'
import { evenlySpacedPositions, POSITION_GAP, positionBetween } from './ordering'
import { slugify } from './slug'

describe('positionBetween', () => {
  it('places the first item, and items at either end', () => {
    expect(positionBetween(null, null)).toEqual({ ok: true, position: POSITION_GAP })
    expect(positionBetween(null, 1024)).toEqual({ ok: true, position: 0 })
    expect(positionBetween(2048, null)).toEqual({ ok: true, position: 3072 })
  })

  it('uses the midpoint between neighbours', () => {
    expect(positionBetween(1024, 2048)).toEqual({ ok: true, position: 1536 })
  })

  it('keeps producing strictly ordered positions until precision runs out, then asks to rebalance', () => {
    let low = 1024
    const high = 2048
    let inserts = 0
    for (;;) {
      const result = positionBetween(low, high)
      if (!result.ok) break
      expect(result.position).toBeGreaterThan(low)
      expect(result.position).toBeLessThan(high)
      low = result.position
      inserts += 1
    }
    expect(inserts).toBeGreaterThan(20)
  })

  it('rejects invalid neighbours', () => {
    expect(() => positionBetween(5, 5)).toThrow(RangeError)
    expect(() => positionBetween(6, 5)).toThrow(RangeError)
    expect(() => positionBetween(Number.NaN, null)).toThrow(RangeError)
  })

  it('creates evenly spaced positions for seeding and rebalancing', () => {
    expect(evenlySpacedPositions(3)).toEqual([1024, 2048, 3072])
    expect(evenlySpacedPositions(0)).toEqual([])
  })
})

describe('slugify', () => {
  it('produces slugs that satisfy the database constraint', () => {
    expect(slugify('Acme Design Team')).toBe('acme-design-team')
    expect(slugify('  Café — Ops!! ')).toBe('cafe-ops')
    expect(slugify('#general')).toBe('general')
    expect(slugify('🚀🚀')).toBe('')
  })

  it('truncates without leaving a trailing hyphen', () => {
    expect(slugify('abc def', 4)).toBe('abc')
  })
})

describe('directConversationKey', () => {
  it('is independent of argument order', () => {
    expect(directConversationKey('b', 'a')).toBe('a:b')
    expect(directConversationKey('a', 'b')).toBe('a:b')
  })

  it('supports a self-DM', () => {
    expect(directConversationKey('a', 'a')).toBe('a:a')
  })
})

describe('evaluateInviteAcceptance', () => {
  const now = new Date('2026-01-10T00:00:00Z')
  const pending: InviteState = {
    email: 'sam@example.com',
    expiresAt: new Date('2026-01-17T00:00:00Z'),
    acceptedAt: null,
    revokedAt: null,
  }

  it('accepts a pending invite for the matching (normalised) email', () => {
    expect(evaluateInviteAcceptance({ email: ' Sam@Example.com ' }, pending, now)).toEqual({
      ok: true,
    })
  })

  it.each([
    ['accepted', { acceptedAt: now }],
    ['revoked', { revokedAt: now }],
    ['expired', { expiresAt: now }],
  ] as const)('rejects an invite that was %s', (reason, change) => {
    expect(
      evaluateInviteAcceptance({ email: pending.email }, { ...pending, ...change }, now),
    ).toEqual({ ok: false, reason })
  })

  it('rejects a leaked link used by someone else', () => {
    expect(evaluateInviteAcceptance({ email: 'eve@example.com' }, pending, now)).toEqual({
      ok: false,
      reason: 'email_mismatch',
    })
  })
})
