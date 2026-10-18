import { pino } from 'pino'

import { env } from '@/config/env'

function defaultLevel(): pino.Level | 'silent' {
  if (env.NODE_ENV === 'test') return 'silent'
  return env.isProduction ? 'info' : 'debug'
}

/**
 * Structured JSON logs in production (Render captures stdout); pretty output in
 * development. Credentials are redacted everywhere.
 */
export const logger = pino({
  level: env.LOG_LEVEL ?? defaultLevel(),
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    censor: '[redacted]',
  },
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
})
