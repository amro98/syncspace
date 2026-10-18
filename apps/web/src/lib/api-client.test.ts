import { healthResponseSchema } from '@syncspace/shared'
import { describe, expect, it } from 'vitest'

import { jsonResponse, mockFetch } from '@/test/render'

import { ApiError, apiClient } from './api-client'

describe('apiClient', () => {
  it('sends credentials and JSON, and builds the URL from the base URL and query', async () => {
    const fetchMock = mockFetch(() => Promise.resolve(jsonResponse({ id: '1' }, { status: 201 })))

    await apiClient.post('/api/things', { body: { name: 'x' }, query: { a: 1, b: undefined } })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://localhost:4000/api/things?a=1')
    expect(init.credentials).toBe('include')
    expect(init.body).toBe('{"name":"x"}')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })

  it('validates and types responses with a schema', async () => {
    const body = { status: 'ok', uptime: 5, timestamp: '2026-01-01T00:00:00.000Z' }
    mockFetch(() => Promise.resolve(jsonResponse(body)))

    await expect(apiClient.get('/health', { schema: healthResponseSchema })).resolves.toEqual(body)
  })

  it('normalises API error bodies into ApiError', async () => {
    mockFetch(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Validation failed',
              issues: [{ path: 'name', message: 'Required' }],
              requestId: 'req-1',
            },
          },
          { status: 400 },
        ),
      ),
    )

    const error = await apiClient.post('/api/things', { body: {} }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      issues: [{ path: 'name', message: 'Required' }],
      requestId: 'req-1',
    })
  })

  it('falls back to a status-derived code for non-standard error bodies', async () => {
    mockFetch(() => Promise.resolve(new Response('Bad gateway', { status: 502 })))

    await expect(apiClient.get('/api/things')).rejects.toMatchObject({
      status: 502,
      code: 'INTERNAL_ERROR',
    })
  })

  it('reports network failures as NETWORK_ERROR', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')))

    await expect(apiClient.get('/health')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    })
  })

  it('rejects responses that do not match the schema', async () => {
    mockFetch(() => Promise.resolve(jsonResponse({ status: 'weird' })))

    await expect(apiClient.get('/health', { schema: healthResponseSchema })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })
})
