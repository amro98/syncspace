import type { AuthProvider } from '@syncspace/shared'
import { z } from 'zod'

import { env } from '@/config/env'

/** Normalised identity returned by a provider after a successful code exchange. */
export interface OAuthProfile {
  /** The provider's stable subject id — never the email. */
  providerAccountId: string
  email: string | null
  emailVerified: boolean
  name: string
  avatarUrl: string | null
}

export interface OAuthProviderClient {
  id: AuthProvider
  authorizationUrl(params: { state: string; codeChallenge: string; redirectUri: string }): string
  fetchProfile(params: {
    code: string
    codeVerifier: string
    redirectUri: string
  }): Promise<OAuthProfile>
}

export class OAuthProviderError extends Error {
  override name = 'OAuthProviderError'
}

/** Trimmed value, or null when missing or blank (providers send "" for unset names). */
function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

async function fetchJson<TSchema extends z.ZodType>(
  url: string,
  init: RequestInit,
  schema: TSchema,
  label: string,
): Promise<z.output<TSchema>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok)
    throw new OAuthProviderError(`${label} failed with HTTP ${String(response.status)}`)
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new OAuthProviderError(`${label} returned an unexpected response`)
  return parsed.data
}

// ---------------------------------------------------------------------------
// Google — OpenID Connect, scopes: openid email profile
// ---------------------------------------------------------------------------

const googleTokenSchema = z.object({ access_token: z.string().min(1) })
const googleUserSchema = z.object({
  sub: z.string().min(1),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
})

function createGoogleClient(config: {
  clientId: string
  clientSecret: string
}): OAuthProviderClient {
  return {
    id: 'GOOGLE',
    authorizationUrl({ state, codeChallenge, redirectUri }) {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString()
      return url.toString()
    },
    async fetchProfile({ code, codeVerifier, redirectUri }) {
      const token = await fetchJson(
        'https://oauth2.googleapis.com/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        },
        googleTokenSchema,
        'Google token exchange',
      )
      const user = await fetchJson(
        'https://openidconnect.googleapis.com/v1/userinfo',
        { headers: { Authorization: `Bearer ${token.access_token}` } },
        googleUserSchema,
        'Google userinfo',
      )
      return {
        providerAccountId: user.sub,
        email: user.email ?? null,
        emailVerified: user.email_verified === true,
        name: nonEmpty(user.name) ?? user.email?.split('@')[0] ?? 'Google user',
        avatarUrl: user.picture ?? null,
      }
    },
  }
}

// ---------------------------------------------------------------------------
// GitHub — OAuth app, scopes: read:user user:email
// ---------------------------------------------------------------------------

const githubTokenSchema = z.object({ access_token: z.string().min(1) })
const githubUserSchema = z.object({
  id: z.number().int(),
  login: z.string(),
  name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
})
const githubEmailsSchema = z.array(
  z.object({ email: z.string(), primary: z.boolean(), verified: z.boolean() }),
)

function createGithubClient(config: {
  clientId: string
  clientSecret: string
}): OAuthProviderClient {
  const apiHeaders = (accessToken: string) => ({
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'SyncSpace',
  })
  return {
    id: 'GITHUB',
    authorizationUrl({ state, codeChallenge, redirectUri }) {
      const url = new URL('https://github.com/login/oauth/authorize')
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        scope: 'read:user user:email',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        allow_signup: 'true',
      }).toString()
      return url.toString()
    },
    async fetchProfile({ code, codeVerifier, redirectUri }) {
      const token = await fetchJson(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
          }),
        },
        githubTokenSchema,
        'GitHub token exchange',
      )
      const headers = apiHeaders(token.access_token)
      const [user, emails] = await Promise.all([
        fetchJson('https://api.github.com/user', { headers }, githubUserSchema, 'GitHub user'),
        fetchJson(
          'https://api.github.com/user/emails',
          { headers },
          githubEmailsSchema,
          'GitHub emails',
        ),
      ])
      // Prefer the primary address; any address used must be verified by GitHub.
      const verified =
        emails.find((entry) => entry.primary && entry.verified) ??
        emails.find((entry) => entry.verified)
      return {
        providerAccountId: String(user.id),
        email: verified?.email ?? null,
        emailVerified: verified !== undefined,
        name: nonEmpty(user.name) ?? user.login,
        avatarUrl: user.avatar_url ?? null,
      }
    },
  }
}

/** Configured providers only; a provider without credentials is reported as unavailable. */
export function getOAuthClient(provider: AuthProvider): OAuthProviderClient | null {
  if (provider === 'GOOGLE') return env.oauth.google ? createGoogleClient(env.oauth.google) : null
  return env.oauth.github ? createGithubClient(env.oauth.github) : null
}

export function enabledProviders(): AuthProvider[] {
  return (['GOOGLE', 'GITHUB'] as const).filter((provider) => getOAuthClient(provider) !== null)
}

/** Callback URL registered with the provider: API_PUBLIC_URL/auth/oauth/<provider>/callback. */
export function callbackUrl(provider: AuthProvider): string {
  return `${env.API_PUBLIC_URL}/auth/oauth/${provider.toLowerCase()}/callback`
}
