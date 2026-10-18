import { describe, expect, it } from 'vitest'

import { parseEnv } from './env'

describe('parseEnv', () => {
  it('provides development defaults for an empty environment', () => {
    const env = parseEnv({ DATABASE_URL: '', JWT_SECRET: '' })

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      CORS_ORIGIN: ['http://localhost:5173'],
      usingDevJwtSecret: true,
    })
    expect(env.DATABASE_URL).toBeUndefined()
  })

  it('splits comma-separated CORS origins', () => {
    const env = parseEnv({ CORS_ORIGIN: 'http://localhost:5173, https://app.example.com' })
    expect(env.CORS_ORIGIN).toEqual(['http://localhost:5173', 'https://app.example.com'])
  })

  it('fails fast when production configuration is incomplete', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL.*\n.*JWT_SECRET/)
  })

  it('rejects weak JWT secrets', () => {
    expect(() => parseEnv({ JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/)
  })

  it('accepts a complete production configuration', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/syncspace',
      JWT_SECRET: 'x'.repeat(48),
      CORS_ORIGIN: 'https://app.example.com',
    })
    expect(env.isProduction).toBe(true)
    expect(env.usingDevJwtSecret).toBe(false)
  })
})
