import type { MailMessage } from './types'

export interface CapturedMail extends MailMessage {
  id: number
  sentAt: Date
}

const MAX_MESSAGES = 50

let nextId = 1
const messages: CapturedMail[] = []

/**
 * In-process mailbox used when SMTP is not configured (development and tests).
 * Never used in production. Newest first, bounded.
 */
export const outbox = {
  add(message: MailMessage): CapturedMail {
    const captured = { ...message, id: nextId++, sentAt: new Date() }
    messages.unshift(captured)
    messages.length = Math.min(messages.length, MAX_MESSAGES)
    return captured
  },
  list(): readonly CapturedMail[] {
    return messages
  },
  clear(): void {
    messages.length = 0
  },
}
