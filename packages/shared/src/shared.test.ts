import { describe, expect, it } from 'vitest'

import {
  apiErrorResponseSchema,
  CLIENT_EVENTS,
  cursorPaginationQuerySchema,
  ERROR_CODES,
  ERROR_STATUS,
  PAGINATION,
  rooms,
  SERVER_EVENTS,
  workspaceRoomPayloadSchema,
} from './index'

describe('rooms', () => {
  it('builds rooms using the <kind>:<id> convention', () => {
    expect(rooms.workspace('w1')).toBe('workspace:w1')
    expect(rooms.channel('c1')).toBe('channel:c1')
    expect(rooms.conversation('d1')).toBe('conversation:d1')
    expect(rooms.user('u1')).toBe('user:u1')
  })

  it('rejects ids that would produce ambiguous room names', () => {
    expect(() => rooms.workspace('')).toThrow()
    expect(() => rooms.channel('a:b')).toThrow()
  })
})

describe('socket event names', () => {
  it('are unique across client and server events', () => {
    const names = [...Object.values(CLIENT_EVENTS), ...Object.values(SERVER_EVENTS)]
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('socket payload schemas', () => {
  it('accepts a valid workspace room payload and rejects an empty id', () => {
    expect(workspaceRoomPayloadSchema.safeParse({ workspaceId: 'w1' }).success).toBe(true)
    expect(workspaceRoomPayloadSchema.safeParse({ workspaceId: '' }).success).toBe(false)
  })
})

describe('cursorPaginationQuerySchema', () => {
  it('applies the default limit and coerces query-string numbers', () => {
    expect(cursorPaginationQuerySchema.parse({})).toEqual({ limit: PAGINATION.DEFAULT_LIMIT })
    expect(cursorPaginationQuerySchema.parse({ limit: '10' }).limit).toBe(10)
  })

  it('rejects limits above the maximum', () => {
    const result = cursorPaginationQuerySchema.safeParse({ limit: PAGINATION.MAX_LIMIT + 1 })
    expect(result.success).toBe(false)
  })
})

describe('error contract', () => {
  it('maps every error code to an HTTP status', () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400)
    }
  })

  it('parses a well-formed API error body', () => {
    const body = { error: { code: 'NOT_FOUND', message: 'Missing', requestId: 'r1' } }
    expect(apiErrorResponseSchema.safeParse(body).success).toBe(true)
  })

  it('rejects unknown error codes', () => {
    const body = { error: { code: 'TEAPOT', message: 'nope' } }
    expect(apiErrorResponseSchema.safeParse(body).success).toBe(false)
  })
})
