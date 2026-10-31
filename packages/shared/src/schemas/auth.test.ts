import { describe, expect, it } from 'vitest'

import { safeRedirectPath } from '../domain/redirect'
import { loginInputSchema, PASSWORD_RULES, passwordSchema, registerInputSchema } from './auth'
import { createInviteInputSchema, createWorkspaceInputSchema } from './workspaces'

describe('password policy', () => {
  it('accepts a password meeting every rule', () => {
    expect(passwordSchema.safeParse('Correct-Horse-9').success).toBe(true)
  })

  it.each([
    ['length', 'Aa1!aaa'],
    ['lowercase', 'UPPERCASE-123'],
    ['uppercase', 'lowercase-123'],
    ['number', 'No-Numbers-Here'],
    ['special', 'NoSpecial123'],
  ])('reports the unmet "%s" rule', (ruleId, password) => {
    const rule = PASSWORD_RULES.find((candidate) => candidate.id === ruleId)
    expect(rule?.test(password)).toBe(false)
    expect(passwordSchema.safeParse(password).success).toBe(false)
  })

  it('limits passwords to 72 bytes (bcrypt) — multi-byte characters count more', () => {
    expect(passwordSchema.safeParse(`Aa1!${'a'.repeat(68)}`).success).toBe(true)
    expect(passwordSchema.safeParse(`Aa1!${'a'.repeat(69)}`).success).toBe(false)
    // 24 × "€" (3 bytes each) = 72 bytes before the required classes are added.
    expect(passwordSchema.safeParse(`Aa1!${'€'.repeat(24)}`).success).toBe(false)
  })

  it('reports all failing rules at once (for the form checklist)', () => {
    const result = passwordSchema.safeParse('abc')
    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(4)
  })
})

describe('auth inputs', () => {
  it('normalises emails and defaults Remember me to off', () => {
    const parsed = registerInputSchema.parse({
      name: '  Ada  ',
      email: '  Ada@Example.COM ',
      password: 'Correct-Horse-9',
    })
    expect(parsed).toEqual({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'Correct-Horse-9',
      rememberMe: false,
    })
  })

  it('does not apply the new-password policy at login', () => {
    expect(loginInputSchema.safeParse({ email: 'a@b.co', password: 'old' }).success).toBe(true)
  })
})

describe('workspace inputs', () => {
  it('requires a URL-safe slug', () => {
    expect(createWorkspaceInputSchema.safeParse({ name: 'Acme', slug: 'acme-inc' }).success).toBe(
      true,
    )
    expect(createWorkspaceInputSchema.safeParse({ name: 'Acme', slug: 'Acme Inc' }).success).toBe(
      false,
    )
  })

  it('never allows inviting as OWNER and defaults to MEMBER', () => {
    expect(createInviteInputSchema.safeParse({ email: 'a@b.co', role: 'OWNER' }).success).toBe(
      false,
    )
    expect(createInviteInputSchema.parse({ email: 'a@b.co' }).role).toBe('MEMBER')
  })
})

describe('safeRedirectPath', () => {
  it('keeps in-app paths', () => {
    expect(safeRedirectPath('/invite/abc')).toBe('/invite/abc')
    expect(safeRedirectPath('/app/workspaces/1?x=1')).toBe('/app/workspaces/1?x=1')
  })

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/app\n/evil',
    '',
    undefined,
    42,
  ])('falls back for unsafe target %j', (value) => {
    expect(safeRedirectPath(value)).toBe('/app')
  })
})
