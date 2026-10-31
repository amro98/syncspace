import { acceptInviteResponseSchema, invitePreviewSchema } from '@syncspace/shared'

import { apiClient } from '@/lib/api-client'

/** Tokens go in request bodies, never URLs, so they stay out of server logs. */
export function previewInvite(token: string) {
  return apiClient.post('/invites/preview', { body: { token }, schema: invitePreviewSchema })
}

export function acceptInvite(token: string) {
  return apiClient.post('/invites/accept', { body: { token }, schema: acceptInviteResponseSchema })
}
