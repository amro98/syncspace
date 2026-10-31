import {
  type AuthProvider,
  authProvidersResponseSchema,
  authSessionResponseSchema,
  type AuthUser,
  type ForgotPasswordInput,
  type LoginInput,
  messageResponseSchema,
  oauthConfirmResponseSchema,
  oauthPendingSchema,
  type RegisterInput,
  type ResetPasswordInput,
} from '@syncspace/shared'

import { apiClient, isApiError } from '@/lib/api-client'
import { env } from '@/lib/env'

/** The signed-in user, or null when there is no (valid) session. */
export async function fetchSession(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    const { user } = await apiClient.get('/auth/me', {
      schema: authSessionResponseSchema,
      ...(signal && { signal }),
    })
    return user
  } catch (error) {
    if (isApiError(error) && error.code === 'UNAUTHENTICATED') return null
    throw error
  }
}

export async function login(input: LoginInput): Promise<AuthUser> {
  const { user } = await apiClient.post('/auth/login', {
    body: input,
    schema: authSessionResponseSchema,
  })
  return user
}

export async function register(input: RegisterInput): Promise<AuthUser> {
  const { user } = await apiClient.post('/auth/register', {
    body: input,
    schema: authSessionResponseSchema,
  })
  return user
}

export function logout(): Promise<void> {
  return apiClient.post('/auth/logout')
}

export function requestPasswordReset(input: ForgotPasswordInput) {
  return apiClient.post('/auth/forgot-password', { body: input, schema: messageResponseSchema })
}

export function verifyResetToken(token: string) {
  return apiClient.post('/auth/reset-password/verify', {
    body: { token },
    schema: messageResponseSchema,
  })
}

export function resetPassword(input: ResetPasswordInput) {
  return apiClient.post('/auth/reset-password', { body: input, schema: messageResponseSchema })
}

export async function fetchAuthProviders(): Promise<AuthProvider[]> {
  const { providers } = await apiClient.get('/auth/providers', {
    schema: authProvidersResponseSchema,
  })
  return providers
}

export function fetchOAuthPending() {
  return apiClient.get('/auth/oauth/pending', { schema: oauthPendingSchema })
}

export function confirmOAuthPending() {
  return apiClient.post('/auth/oauth/pending/confirm', { schema: oauthConfirmResponseSchema })
}

export function cancelOAuthPending(): Promise<void> {
  return apiClient.post('/auth/oauth/pending/cancel')
}

/**
 * The OAuth flow is a full-page navigation to the API (which redirects to the
 * provider), not a fetch. `redirect` survives the round trip so invite links
 * keep working; `remember` carries the "Remember me" choice.
 */
export function oauthStartUrl(
  provider: AuthProvider,
  options: { redirect?: string | undefined; remember: boolean },
): string {
  const url = new URL(`${env.VITE_API_BASE_URL}/auth/oauth/${provider.toLowerCase()}`)
  if (options.redirect) url.searchParams.set('redirect', options.redirect)
  url.searchParams.set('remember', options.remember ? '1' : '0')
  return url.toString()
}
