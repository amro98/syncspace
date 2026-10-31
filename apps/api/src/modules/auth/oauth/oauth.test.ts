import { randomInt } from 'node:crypto'

import {
  apiErrorResponseSchema,
  authSessionResponseSchema,
  oauthConfirmResponseSchema,
  oauthPendingSchema,
} from '@syncspace/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OAUTH_PENDING_COOKIE, OAUTH_STATE_COOKIE, SESSION_COOKIE } from '@/config/auth'
import { getPrisma } from '@/lib/prisma'
import {
  type Agent,
  createAgent,
  createUser,
  fakeOAuthProviders,
  type FakeProviderIdentity,
  setCookies,
  uniqueEmail,
} from '@/test/helpers'

// Enable both providers for this file (env is parsed when the app modules load).
vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-google-client'
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret'
  process.env.GITHUB_CLIENT_ID = 'test-github-client'
  process.env.GITHUB_CLIENT_SECRET = 'test-github-secret'
})

const FRONTEND = 'http://localhost:5173'

let identity: FakeProviderIdentity
let providerCalls: ReturnType<typeof fakeOAuthProviders>['calls']

beforeEach(() => {
  identity = {
    providerAccountId: String(randomInt(1, 2 ** 31)),
    email: uniqueEmail('social'),
    emailVerified: true,
    name: 'Social Person',
  }
  providerCalls = fakeOAuthProviders(() => identity).calls
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * Drives the browser round trip: start (sets state cookie, redirects to the
 * provider) -> provider redirects back to our callback with code + state.
 */
async function completeProviderFlow(agent: Agent, provider: 'google' | 'github', query = '') {
  const start = await agent.get(`/auth/oauth/${provider}${query}`).expect(303)
  const authorizeUrl = new URL(String(start.headers.location))
  const state = authorizeUrl.searchParams.get('state') ?? ''
  return agent.get(`/auth/oauth/${provider}/callback?code=test-code&state=${state}`).expect(303)
}

describe('starting the flow', () => {
  it('redirects to Google with state, PKCE and the expected scopes and callback', async () => {
    const agent = createAgent()
    const response = await agent.get('/auth/oauth/google').expect(303)
    const url = new URL(String(response.headers.location))

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('state')).toHaveLength(43)
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:4000/auth/oauth/google/callback',
    )
    const stateCookie = setCookies(response).get(OAUTH_STATE_COOKIE) ?? ''
    expect(stateCookie).toMatch(/HttpOnly/i)
    expect(stateCookie).toMatch(/SameSite=Lax/i)
  })

  it('asks GitHub for read:user and user:email', async () => {
    const response = await createAgent().get('/auth/oauth/github').expect(303)
    const url = new URL(String(response.headers.location))
    expect(url.searchParams.get('scope')).toBe('read:user user:email')
  })

  it('rejects a callback whose state does not match the cookie', async () => {
    const agent = createAgent()
    await agent.get('/auth/oauth/google').expect(303)
    const response = await agent
      .get('/auth/oauth/google/callback?code=x&state=forged-state')
      .expect(303)
    expect(response.headers.location).toBe(`${FRONTEND}/login?error=OAUTH_FAILED`)
    expect(providerCalls).toHaveLength(0)
  })

  it('reports a cancelled consent screen', async () => {
    const agent = createAgent()
    await agent.get('/auth/oauth/github').expect(303)
    const response = await agent.get('/auth/oauth/github/callback?error=access_denied').expect(303)
    expect(response.headers.location).toBe(`${FRONTEND}/login?error=OAUTH_CANCELLED`)
  })
})

describe('new user (pending sign-up)', () => {
  it('creates nothing until the user confirms, then creates the user + account and signs in', async () => {
    const agent = createAgent()
    const callback = await completeProviderFlow(agent, 'google', '?redirect=/invite/abc&remember=1')
    expect(callback.headers.location).toBe(`${FRONTEND}/auth/social/confirm`)
    expect(setCookies(callback).get(SESSION_COOKIE)).toBeUndefined()
    expect(await getPrisma().user.count({ where: { email: identity.email ?? '' } })).toBe(0)

    const pending = oauthPendingSchema.parse(
      (await agent.get('/auth/oauth/pending').expect(200)).body,
    )
    expect(pending).toEqual({
      mode: 'signup',
      provider: 'GOOGLE',
      email: identity.email,
      name: 'Social Person',
      avatarUrl: null,
    })

    const confirm = await agent.post('/auth/oauth/pending/confirm').expect(200)
    const body = oauthConfirmResponseSchema.parse(confirm.body)
    expect(body.redirectTo).toBe('/invite/abc')
    expect(body.user).toMatchObject({
      email: identity.email,
      hasPassword: false,
      providers: ['GOOGLE'],
    })
    // Remember me travelled through the provider round trip.
    expect(setCookies(confirm).get(SESSION_COOKIE)).toMatch(/Max-Age=/)

    const user = await getPrisma().user.findUniqueOrThrow({
      where: { email: identity.email ?? '' },
      include: { authAccounts: true },
    })
    expect(user.passwordHash).toBeNull()
    expect(user.authAccounts).toHaveLength(1)

    // Next time the same provider account signs straight in.
    const again = await completeProviderFlow(createAgent(), 'google')
    expect(again.headers.location).toBe(`${FRONTEND}/app`)
    expect(setCookies(again).get(SESSION_COOKIE)).toBeDefined()
  })

  it('creates nothing when the user cancels', async () => {
    const agent = createAgent()
    await completeProviderFlow(agent, 'github')
    await agent.post('/auth/oauth/pending/cancel').expect(204)

    const response = await agent.post('/auth/oauth/pending/confirm').expect(400)
    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe('OAUTH_PENDING_EXPIRED')
    expect(await getPrisma().user.count({ where: { email: identity.email ?? '' } })).toBe(0)
  })

  it('refuses providers that do not vouch for the email', async () => {
    identity.emailVerified = false
    const response = await completeProviderFlow(createAgent(), 'github')
    expect(response.headers.location).toBe(`${FRONTEND}/login?error=OAUTH_EMAIL_UNVERIFIED`)
    expect(setCookies(response).get(OAUTH_PENDING_COOKIE)).toBeUndefined()
  })
})

describe('existing email (pending link)', () => {
  it('asks before linking, then links to the SAME user and signs in', async () => {
    const existing = await createUser({ email: identity.email ?? '' })
    const agent = createAgent()

    const callback = await completeProviderFlow(agent, 'github')
    expect(callback.headers.location).toBe(`${FRONTEND}/auth/social/link`)
    expect(await getPrisma().authAccount.count({ where: { userId: existing.id } })).toBe(0)

    const pending = oauthPendingSchema.parse(
      (await agent.get('/auth/oauth/pending').expect(200)).body,
    )
    expect(pending.mode).toBe('link')

    const confirm = oauthConfirmResponseSchema.parse(
      (await agent.post('/auth/oauth/pending/confirm').expect(200)).body,
    )
    expect(confirm.user).toMatchObject({
      id: existing.id,
      hasPassword: true,
      providers: ['GITHUB'],
    })
    expect(await getPrisma().user.count({ where: { email: existing.email } })).toBe(1)

    // A second provider links to the same user too.
    identity.providerAccountId = String(randomInt(1, 2 ** 31))
    const second = createAgent()
    await completeProviderFlow(second, 'google')
    await second.post('/auth/oauth/pending/confirm').expect(200)
    const me = authSessionResponseSchema.parse((await second.get('/auth/me').expect(200)).body)
    expect(me.user).toMatchObject({ id: existing.id, providers: ['GOOGLE', 'GITHUB'] })
  })

  it('re-validates on confirm: the email must still belong to the user', async () => {
    const existing = await createUser({ email: identity.email ?? '' })
    const agent = createAgent()
    await completeProviderFlow(agent, 'google')
    await getPrisma().user.update({
      where: { id: existing.id },
      data: { email: uniqueEmail('moved') },
    })

    const response = await agent.post('/auth/oauth/pending/confirm').expect(400)
    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe('OAUTH_PENDING_EXPIRED')
    expect(await getPrisma().authAccount.count({ where: { userId: existing.id } })).toBe(0)
  })

  it('prevents linking a second account of the same provider', async () => {
    const existing = await createUser({ email: identity.email ?? '' })
    await getPrisma().authAccount.create({
      data: {
        userId: existing.id,
        provider: 'GITHUB',
        providerAccountId: 'another-github-account',
      },
    })
    const response = await completeProviderFlow(createAgent(), 'github')
    expect(response.headers.location).toBe(`${FRONTEND}/login?error=OAUTH_ACCOUNT_CONFLICT`)
  })

  it('prevents the same provider account from being linked twice (concurrent confirm)', async () => {
    await createUser({ email: identity.email ?? '' })
    const first = createAgent()
    const second = createAgent()
    await completeProviderFlow(first, 'google')
    await completeProviderFlow(second, 'google')

    await first.post('/auth/oauth/pending/confirm').expect(200)
    const response = await second.post('/auth/oauth/pending/confirm').expect(409)
    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe('OAUTH_ACCOUNT_CONFLICT')
  })
})

describe('providers endpoint', () => {
  it('lists the configured providers', async () => {
    const response = await createAgent().get('/auth/providers').expect(200)
    expect(response.body).toEqual({ providers: ['GOOGLE', 'GITHUB'] })
  })
})
