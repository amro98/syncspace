import { apiErrorResponseSchema } from '@syncspace/shared'
import cookieParser from 'cookie-parser'
import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { SESSION_COOKIE } from '@/config/auth'
import { getPrisma } from '@/lib/prisma'
import { createUser, sessionCookie, setCookies } from '@/test/helpers'

import { errorHandler } from './error-handler'
import { requestLogger } from './request-logger'
import { requireAuth } from './require-auth'
import { validate } from './validate'

function createTestApp() {
  const app = express()
  app.use(requestLogger)
  app.use(express.json())
  app.use(cookieParser())

  app.post(
    '/items/:itemId',
    validate({
      params: z.object({ itemId: z.string().min(2) }),
      query: z.object({ dryRun: z.stringbool().default(false) }),
      body: z.object({ name: z.string().min(1), quantity: z.number().int().positive() }),
    }),
    (req, res) => {
      res.json({ itemId: req.params.itemId, dryRun: req.query.dryRun, body: req.body })
    },
  )

  app.get('/me', requireAuth, (req, res) => {
    res.json({ userId: req.auth?.userId })
  })

  app.use(errorHandler)
  return app
}

const app = createTestApp()

describe('validate middleware', () => {
  it('passes parsed and coerced input to the handler', async () => {
    const response = await request(app)
      .post('/items/abc?dryRun=true')
      .send({ name: 'Widget', quantity: 2 })
      .expect(200)

    expect(response.body).toEqual({
      itemId: 'abc',
      dryRun: true,
      body: { name: 'Widget', quantity: 2 },
    })
  })

  it('returns VALIDATION_ERROR with field-level issues', async () => {
    const response = await request(app)
      .post('/items/a')
      .send({ name: '', quantity: -1 })
      .expect(400)
    const { error } = apiErrorResponseSchema.parse(response.body)

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.issues?.map((issue) => issue.path)).toEqual(['itemId'])
  })
})

describe('requireAuth middleware', () => {
  it('rejects requests without a session cookie', async () => {
    const response = await request(app).get('/me').expect(401)
    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe('UNAUTHENTICATED')
  })

  it('rejects tampered tokens and clears the cookie', async () => {
    const user = await createUser()
    const response = await request(app)
      .get('/me')
      .set('Cookie', `${sessionCookie(user)}x`)
      .expect(401)
    expect(setCookies(response).get(SESSION_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/)
  })

  it('exposes the authenticated user id', async () => {
    const user = await createUser()
    const response = await request(app).get('/me').set('Cookie', sessionCookie(user)).expect(200)
    expect(response.body).toEqual({ userId: user.id })
  })

  it('rejects sessions revoked by a token-version bump', async () => {
    const user = await createUser()
    const cookie = sessionCookie(user)
    await getPrisma().user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    })
    await request(app).get('/me').set('Cookie', cookie).expect(401)
  })

  it('rejects sessions of deleted users', async () => {
    const user = await createUser()
    const cookie = sessionCookie(user)
    await getPrisma().user.delete({ where: { id: user.id } })
    await request(app).get('/me').set('Cookie', cookie).expect(401)
  })
})
