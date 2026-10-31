import { apiErrorResponseSchema, authSessionResponseSchema } from '@syncspace/shared'
import { afterEach, describe, expect, it } from 'vitest'

import { SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/config/auth'
import { sha256 } from '@/lib/crypto'
import { outbox } from '@/lib/mail/outbox'
import { getPrisma } from '@/lib/prisma'
import {
  createAgent,
  createUser,
  setCookies,
  signIn,
  STRONG_PASSWORD,
  tokenFromMail,
  uniqueEmail,
  waitForMail,
} from '@/test/helpers'

const errorCode = (body: unknown) => apiErrorResponseSchema.parse(body).error.code

afterEach(() => {
  outbox.clear()
})

describe('POST /auth/register', () => {
  it('creates the user, normalises the email, signs in and returns only public fields', async () => {
    const agent = createAgent()
    const email = uniqueEmail('Register')
    const response = await agent
      .post('/auth/register')
      .send({ name: 'Ada', email: `  ${email.toUpperCase()} `, password: STRONG_PASSWORD })
      .expect(201)

    const { user } = authSessionResponseSchema.parse(response.body)
    expect(user).toEqual({
      id: expect.any(String),
      name: 'Ada',
      email: email.toLowerCase(),
      avatarUrl: null,
      hasPassword: true,
      providers: [],
    })
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|tokenVersion|\$2[aby]\$/)
    expect(setCookies(response).get(SESSION_COOKIE)).toBeDefined()

    const stored = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } })
    expect(stored.passwordHash).not.toBe(STRONG_PASSWORD)
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/)

    await agent.get('/auth/me').expect(200)
  })

  it('rejects a duplicate email (case-insensitive)', async () => {
    const existing = await createUser()
    const response = await createAgent()
      .post('/auth/register')
      .send({ name: 'Dup', email: existing.email.toUpperCase(), password: STRONG_PASSWORD })
      .expect(409)
    expect(errorCode(response.body)).toBe('EMAIL_TAKEN')
  })

  it.each([
    ['too short', 'Aa1!aaa'],
    ['no uppercase', 'lowercase-1!'],
    ['no lowercase', 'UPPERCASE-1!'],
    ['no number', 'NoNumbers-here!'],
    ['no special character', 'NoSpecial123'],
    ['over 72 characters', `Aa1!${'a'.repeat(70)}`],
  ])('enforces the password policy: %s', async (_case, password) => {
    const response = await createAgent()
      .post('/auth/register')
      .send({ name: 'Weak', email: uniqueEmail(), password })
      .expect(400)
    expect(errorCode(response.body)).toBe('VALIDATION_ERROR')
  })
})

describe('POST /auth/login', () => {
  it('signs in with the right password', async () => {
    const user = await createUser()
    const agent = createAgent()
    const response = await agent
      .post('/auth/login')
      .send({ email: user.email.toUpperCase(), password: STRONG_PASSWORD })
      .expect(200)
    expect(authSessionResponseSchema.parse(response.body).user.id).toBe(user.id)
    await agent.get('/auth/me').expect(200)
  })

  it('returns the same generic error for a wrong password and an unknown email', async () => {
    const user = await createUser()
    const wrong = await createAgent()
      .post('/auth/login')
      .send({ email: user.email, password: 'Wrong-Password-1' })
      .expect(401)
    const unknown = await createAgent()
      .post('/auth/login')
      .send({ email: uniqueEmail('nobody'), password: 'Wrong-Password-1' })
      .expect(401)

    const a = apiErrorResponseSchema.parse(wrong.body).error
    const b = apiErrorResponseSchema.parse(unknown.body).error
    expect(a.code).toBe('INVALID_CREDENTIALS')
    expect([b.code, b.message]).toEqual([a.code, a.message])
  })

  it('issues a browser-session cookie by default and a 30-day cookie with Remember me', async () => {
    const user = await createUser()

    const session = await createAgent()
      .post('/auth/login')
      .send({ email: user.email, password: STRONG_PASSWORD })
    const sessionCookie = setCookies(session).get(SESSION_COOKIE) ?? ''
    expect(sessionCookie).toMatch(/HttpOnly/i)
    expect(sessionCookie).toMatch(/SameSite=Lax/i)
    expect(sessionCookie).not.toMatch(/Max-Age|Expires/i)

    const remembered = await createAgent()
      .post('/auth/login')
      .send({ email: user.email, password: STRONG_PASSWORD, rememberMe: true })
    const rememberedCookie = setCookies(remembered).get(SESSION_COOKIE) ?? ''
    expect(rememberedCookie).toContain(`Max-Age=${String(SESSION_TTL_SECONDS.remembered)}`)
  })

  it('tells social-only users how to sign in instead of failing silently', async () => {
    const user = await createUser({ password: null })
    await getPrisma().authAccount.create({
      data: { userId: user.id, provider: 'GITHUB', providerAccountId: `gh-${user.id}` },
    })
    const response = await createAgent()
      .post('/auth/login')
      .send({ email: user.email, password: STRONG_PASSWORD })
      .expect(401)
    const { error } = apiErrorResponseSchema.parse(response.body)
    expect(error.code).toBe('PASSWORD_NOT_SET')
    expect(error.message).toMatch(/Forgot password/)
  })

  it('rate limits repeated failed attempts', async () => {
    const agent = createAgent({ rateLimit: { enabled: true, multiplier: 1 } })
    const user = await createUser()
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await agent
        .post('/auth/login')
        .send({ email: user.email, password: 'Nope-nope-1' })
        .expect(401)
    }
    const blocked = await agent
      .post('/auth/login')
      .send({ email: user.email, password: STRONG_PASSWORD })
      .expect(429)
    expect(errorCode(blocked.body)).toBe('RATE_LIMITED')
  })
})

describe('logout and current user', () => {
  it('returns the current user with providers, and 401 after logout', async () => {
    const user = await createUser()
    await getPrisma().authAccount.create({
      data: { userId: user.id, provider: 'GOOGLE', providerAccountId: `g-${user.id}` },
    })
    const agent = createAgent()
    await signIn(agent, user.email)

    const me = await agent.get('/auth/me').expect(200)
    expect(authSessionResponseSchema.parse(me.body).user).toMatchObject({
      id: user.id,
      hasPassword: true,
      providers: ['GOOGLE'],
    })

    const logout = await agent.post('/auth/logout').expect(204)
    expect(setCookies(logout).get(SESSION_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/)
    await agent.get('/auth/me').expect(401)
  })

  it('rejects requests without a session', async () => {
    const response = await createAgent().get('/auth/me').expect(401)
    expect(errorCode(response.body)).toBe('UNAUTHENTICATED')
  })
})

describe('forgot and reset password', () => {
  it('answers identically for existing and unknown emails, and only mails real accounts', async () => {
    const user = await createUser()
    const unknown = uniqueEmail('ghost')

    const a = await createAgent()
      .post('/auth/forgot-password')
      .send({ email: user.email })
      .expect(202)
    const b = await createAgent().post('/auth/forgot-password').send({ email: unknown }).expect(202)
    expect(a.body).toEqual(b.body)

    await waitForMail(user.email, /Reset your SyncSpace password/)
    expect(outbox.list().some((mail) => mail.to === unknown)).toBe(false)
  })

  it('stores only the token hash, resets once, revokes old sessions and the old password', async () => {
    const user = await createUser()
    const oldSession = createAgent()
    await signIn(oldSession, user.email)

    await createAgent().post('/auth/forgot-password').send({ email: user.email }).expect(202)
    const token = tokenFromMail(
      await waitForMail(user.email, /Reset/),
      /reset-password\?token=([A-Za-z0-9_%-]+)/,
    )

    const stored = await getPrisma().passwordResetToken.findFirstOrThrow({
      where: { userId: user.id },
    })
    expect(stored.tokenHash).toBe(sha256(token))
    expect(stored.tokenHash).not.toContain(token)

    await createAgent().post('/auth/reset-password/verify').send({ token }).expect(200)
    const newPassword = 'Brand-New-Pass-2'
    await createAgent()
      .post('/auth/reset-password')
      .send({ token, password: newPassword })
      .expect(200)

    // One-time use.
    const reuse = await createAgent()
      .post('/auth/reset-password')
      .send({ token, password: 'Another-Pass-3' })
      .expect(400)
    expect(errorCode(reuse.body)).toBe('RESET_TOKEN_USED')

    // Old session revoked, old password rejected, new password works.
    await oldSession.get('/auth/me').expect(401)
    await createAgent()
      .post('/auth/login')
      .send({ email: user.email, password: STRONG_PASSWORD })
      .expect(401)
    await signIn(createAgent(), user.email, newPassword)
  })

  it('rejects expired and unknown tokens', async () => {
    const user = await createUser()
    const token = 'expired-token-'.padEnd(43, 'x')
    await getPrisma().passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() - 1000) },
    })
    const expired = await createAgent()
      .post('/auth/reset-password')
      .send({ token, password: 'Brand-New-Pass-2' })
      .expect(400)
    expect(errorCode(expired.body)).toBe('RESET_TOKEN_EXPIRED')

    const unknown = await createAgent()
      .post('/auth/reset-password/verify')
      .send({ token: 'u'.repeat(43) })
      .expect(400)
    expect(errorCode(unknown.body)).toBe('RESET_TOKEN_INVALID')
  })

  it('applies the password policy to the new password', async () => {
    const response = await createAgent()
      .post('/auth/reset-password')
      .send({ token: 'x'.repeat(43), password: 'weak' })
      .expect(400)
    expect(errorCode(response.body)).toBe('VALIDATION_ERROR')
  })

  it('lets a social-only user set a first password and then sign in with it', async () => {
    const user = await createUser({ password: null })
    await createAgent().post('/auth/forgot-password').send({ email: user.email }).expect(202)
    const token = tokenFromMail(
      await waitForMail(user.email, /Reset/),
      /reset-password\?token=([A-Za-z0-9_%-]+)/,
    )
    await createAgent()
      .post('/auth/reset-password')
      .send({ token, password: STRONG_PASSWORD })
      .expect(200)

    const agent = createAgent()
    await signIn(agent, user.email)
    const me = await agent.get('/auth/me').expect(200)
    expect(authSessionResponseSchema.parse(me.body).user.hasPassword).toBe(true)
  })

  it('invalidates older reset tokens when a new one is requested', async () => {
    const user = await createUser()
    await createAgent().post('/auth/forgot-password').send({ email: user.email }).expect(202)
    const first = tokenFromMail(await waitForMail(user.email, /Reset/), /token=([A-Za-z0-9_%-]+)/)
    outbox.clear()
    await createAgent().post('/auth/forgot-password').send({ email: user.email }).expect(202)
    await waitForMail(user.email, /Reset/)

    const response = await createAgent()
      .post('/auth/reset-password/verify')
      .send({ token: first })
      .expect(400)
    expect(errorCode(response.body)).toBe('RESET_TOKEN_INVALID')
  })
})
