import type { WorkspaceRole } from '@syncspace/shared'

import type { MailMessage } from './types'

/** Every interpolated value is user-controlled somewhere (names, workspace names). */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function layout(title: string, paragraphs: string[], action: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join('')
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f2330">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e3e5ea;border-radius:12px;padding:32px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">${escapeHtml(action.label)}</a></p>
<p style="margin:0;font-size:12px;color:#6b7080">If the button does not work, open this link:<br>${escapeHtml(action.url)}</p>
</div></body></html>`
}

export function passwordResetEmail(input: { to: string; name: string; url: string }): MailMessage {
  const title = 'Reset your SyncSpace password'
  const paragraphs = [
    `Hi ${input.name},`,
    'We received a request to set or reset the password for your SyncSpace account. The link expires in 30 minutes and works once.',
    'If you did not ask for this, you can ignore this email — your password will not change.',
  ]
  return {
    to: input.to,
    subject: title,
    text: `${paragraphs.join('\n\n')}\n\nReset your password: ${input.url}\n`,
    html: layout(title, paragraphs, { label: 'Reset password', url: input.url }),
  }
}

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  OWNER: 'an owner',
  ADMIN: 'an admin',
  MEMBER: 'a member',
}

export function workspaceInviteEmail(input: {
  to: string
  workspaceName: string
  inviterName: string
  role: WorkspaceRole
  url: string
}): MailMessage {
  const title = `Join ${input.workspaceName} on SyncSpace`
  const paragraphs = [
    `${input.inviterName} invited you to join the “${input.workspaceName}” workspace as ${ROLE_LABEL[input.role]}.`,
    `Sign in or create an account with ${input.to} to accept. The invitation expires in 7 days.`,
  ]
  return {
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.workspaceName} on SyncSpace`,
    text: `${paragraphs.join('\n\n')}\n\nAccept the invitation: ${input.url}\n`,
    html: layout(title, paragraphs, { label: 'Accept invitation', url: input.url }),
  }
}
