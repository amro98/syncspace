import {
  apiErrorResponseSchema,
  healthResponseSchema,
  readinessResponseSchema,
} from '@syncspace/shared'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { createApp } from '@/app'

const app = createApp()

describe('GET /health', () => {
  it('returns the liveness payload', async () => {
    const response = await request(app).get('/health').expect(200)

    expect(healthResponseSchema.parse(response.body).status).toBe('ok')
    expect(response.headers['x-request-id']).toBeTruthy()
  })

  it('allows the configured frontend origin with credentials', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200)

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(response.headers['access-control-allow-credentials']).toBe('true')
  })
})

describe('GET /health/ready', () => {
  it('reports the database as not configured when DATABASE_URL is absent', async () => {
    const response = await request(app).get('/health/ready').expect(503)

    expect(readinessResponseSchema.parse(response.body)).toEqual({
      status: 'unavailable',
      checks: { database: 'not_configured' },
    })
  })
})

describe('error contract', () => {
  it('returns NOT_FOUND in the standard error shape for unknown routes', async () => {
    const response = await request(app).get('/does-not-exist').expect(404)
    const { error } = apiErrorResponseSchema.parse(response.body)

    expect(error.code).toBe('NOT_FOUND')
    expect(error.requestId).toBe(response.headers['x-request-id'])
  })

  it('returns BAD_REQUEST for malformed JSON bodies', async () => {
    const response = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400)

    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe('BAD_REQUEST')
  })

  it('rejects state-changing requests from disallowed origins', async () => {
    const response = await request(app)
      .post('/health')
      .set('Origin', 'https://evil.example')
      .expect(403)

    expect(apiErrorResponseSchema.parse(response.body).error.code).toBe('FORBIDDEN')
  })
})
