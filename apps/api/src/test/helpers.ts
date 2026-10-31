import { randomUUID } from 'node:crypto'

import request from 'supertest'
import { expect, vi } from 'vitest'

import { createApp, type AppOptions } from '@/app'
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/config/auth'
import { type CapturedMail, outbox } from '@/lib/mail/outbox'
import { hashPassword } from '@/lib/password'
import { getPrisma } from '@/lib/prisma'
import { signSessionToken } from '@/lib/tokens'

export const STRONG_PASSWORD = 'Correct-Horse-9'

export function uniqueEmail(label = 'user'): string {
  return `${label}-${randomUUID()}@test.syncspace.dev`
}

export function uniqueSlug(label = 'ws'): string {
  return `${label}-${randomUUID().slice(0, 8)}`
}

/** Creates a user directly in the test database. `password: null` = social-only. */
export async function createUser(
  options: { email?: string; name?: string; password?: string | null } = {},
) {
  const password = options.password === undefined ? STRONG_PASSWORD : options.password
  return getPrisma().user.create({
    data: {
      email: options.email ?? uniqueEmail(),
      name: options.name ?? 'Test User',
      passwordHash: password === null ? null : await hashPassword(password),
    },
  })
}

/** Cookie header value for a valid session of `user` (socket handshakes, raw requests). */
export function sessionCookie(user: { id: string; tokenVersion: number }): string {
  return `${SESSION_COOKIE}=${signSessionToken(user, SESSION_TTL_SECONDS.standard)}`
}

/** A supertest agent: keeps cookies between requests like a browser. */
export function createAgent(options?: AppOptions) {
  return request.agent(createApp(options))
}

export type Agent = ReturnType<typeof createAgent>

export async function signIn(agent: Agent, email: string, password = STRONG_PASSWORD) {
  await agent.post('/auth/login').send({ email, password }).expect(200)
}

/** Parses Set-Cookie headers into name -> raw attribute string. */
export function setCookies(response: { headers: Record<string, unknown> }): Map<string, string> {
  const header = response.headers['set-cookie']
  const list = Array.isArray(header) ? (header as string[]) : []
  return new Map(list.map((cookie) => [cookie.slice(0, cookie.indexOf('=')), cookie]))
}

/** Waits for a captured email (mail is sent in the background). */
export async function waitForMail(to: string, subject: RegExp): Promise<CapturedMail> {
  let found: CapturedMail | undefined
  await vi.waitFor(
    () => {
      found = outbox.list().find((mail) => mail.to === to && subject.test(mail.subject))
      expect(found, `email to ${to} matching ${String(subject)}`).toBeDefined()
    },
    { timeout: 5_000, interval: 25 },
  )
  return found!
}

/** Extracts the token from a link like `.../reset-password?token=X` or `.../invite/X`. */
export function tokenFromMail(mail: CapturedMail, pattern: RegExp): string {
  const match = pattern.exec(mail.text)
  if (!match?.[1]) throw new Error(`No token in email: ${mail.text}`)
  return decodeURIComponent(match[1])
}

// ---------------------------------------------------------------------------
// OAuth provider fake: routes the provider endpoints our code calls.
// ---------------------------------------------------------------------------

export interface FakeProviderIdentity {
  providerAccountId: string
  email: string | null
  emailVerified: boolean
  name: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Stubs global fetch so Google/GitHub token + profile calls return `identity`. */
export function fakeOAuthProviders(identity: () => FakeProviderIdentity) {
  const calls: { url: string; body: string }[] = []
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : '' })
    const id = identity()

    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return Promise.resolve(json({ access_token: 'google-access-token' }))
    }
    if (url.startsWith('https://openidconnect.googleapis.com/v1/userinfo')) {
      return Promise.resolve(
        json({
          sub: id.providerAccountId,
          email: id.email ?? undefined,
          email_verified: id.emailVerified,
          name: id.name,
        }),
      )
    }
    if (url.startsWith('https://github.com/login/oauth/access_token')) {
      return Promise.resolve(json({ access_token: 'github-access-token' }))
    }
    if (url === 'https://api.github.com/user') {
      return Promise.resolve(
        json({ id: Number(id.providerAccountId), login: 'octo', name: id.name }),
      )
    }
    if (url === 'https://api.github.com/user/emails') {
      return Promise.resolve(
        json(id.email ? [{ email: id.email, primary: true, verified: id.emailVerified }] : []),
      )
    }
    return Promise.reject(new Error(`Unexpected fetch in test: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls }
}
