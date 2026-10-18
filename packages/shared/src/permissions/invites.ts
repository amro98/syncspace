export interface InviteState {
  /** Normalised email the invite was sent to. */
  email: string
  expiresAt: Date
  acceptedAt: Date | null
  revokedAt: Date | null
}

export type InviteAcceptance =
  { ok: true } | { ok: false; reason: 'accepted' | 'revoked' | 'expired' | 'email_mismatch' }

/**
 * Whether a signed-in user may accept an invite (the token itself is checked
 * separately by hash lookup). The invite must be pending and addressed to the
 * user's own email — a leaked link cannot be redeemed by someone else.
 */
export function evaluateInviteAcceptance(
  user: { email: string },
  invite: InviteState,
  now: Date,
): InviteAcceptance {
  if (invite.acceptedAt) return { ok: false, reason: 'accepted' }
  if (invite.revokedAt) return { ok: false, reason: 'revoked' }
  if (invite.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' }
  if (user.email.trim().toLowerCase() !== invite.email)
    return { ok: false, reason: 'email_mismatch' }
  return { ok: true }
}
