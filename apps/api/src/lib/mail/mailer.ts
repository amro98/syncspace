import nodemailer from 'nodemailer'

import { env } from '@/config/env'
import { logger } from '@/lib/logger'

import { outbox } from './outbox'
import type { MailMessage } from './types'

type Send = (message: MailMessage) => Promise<void>

function createSmtpSender(host: string): Send {
  const transport = nodemailer.createTransport({
    host,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER && { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } }),
  })
  return async (message) => {
    await transport.sendMail({ from: env.SMTP_FROM, ...message })
  }
}

function createSender(): Send {
  if (env.SMTP_HOST) return createSmtpSender(env.SMTP_HOST)

  if (env.isProduction) {
    // Never log message bodies in production: they contain single-use links.
    return () => {
      logger.warn('SMTP is not configured; an email was not sent')
      return Promise.resolve()
    }
  }

  return (message) => {
    outbox.add(message)
    logger.info(
      { to: message.to, subject: message.subject },
      `Email captured (no SMTP configured). View it at ${env.API_PUBLIC_URL}/dev/mail`,
    )
    return Promise.resolve()
  }
}

const send = createSender()

export const mailer = {
  send,
  /** Fire-and-forget delivery: request handlers never wait on (or reveal) mail outcomes. */
  sendInBackground(message: MailMessage): void {
    send(message).catch((error: unknown) => {
      logger.error({ err: error, subject: message.subject }, 'Failed to send email')
    })
  },
}
