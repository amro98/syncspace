import { Router } from 'express'

import { escapeHtml } from '@/lib/mail/templates'
import { outbox } from '@/lib/mail/outbox'

/**
 * DEVELOPMENT-ONLY mail viewer for emails captured when SMTP is not configured.
 * Mounted by app.ts only when NODE_ENV=development; never reachable in production.
 */
export const devMailRouter = Router()

function linkify(text: string): string {
  return escapeHtml(text).replace(
    /(https?:\/\/[^\s<]+)/g,
    (url) => `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`,
  )
}

devMailRouter.get('/', (_req, res) => {
  const items = outbox
    .list()
    .map(
      (mail) => `<article>
  <header><strong>${escapeHtml(mail.subject)}</strong><br>
  <small>To ${escapeHtml(mail.to)} · ${mail.sentAt.toLocaleString()}</small></header>
  <pre>${linkify(mail.text)}</pre>
</article>`,
    )
    .join('')

  res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>SyncSpace dev mail</title>
<style>
body{font-family:system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 16px;color:#1f2330;background:#f6f7f9}
article{background:#fff;border:1px solid #e3e5ea;border-radius:10px;padding:16px;margin:0 0 12px}
pre{white-space:pre-wrap;font:14px/1.5 ui-monospace,monospace;margin:12px 0 0}
small{color:#6b7080} a{color:#4f46e5}
</style></head><body>
<h1>Dev mail <small>(${String(outbox.list().length)} captured, newest first — development only)</small></h1>
${items || '<p>No emails captured yet. Trigger “Forgot password” or send an invite.</p>'}
</body></html>`)
})
