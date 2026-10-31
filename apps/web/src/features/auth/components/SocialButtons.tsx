import type { AuthProvider } from '@syncspace/shared'
import type { ReactNode } from 'react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { oauthStartUrl } from '../api'
import { useAuthProviders } from '../hooks'

const PROVIDERS: { id: AuthProvider; label: string; icon: ReactNode }[] = [
  {
    id: 'GOOGLE',
    label: 'Google',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden className="size-4">
        <path
          fill="#EA4335"
          d="M12 10.2v3.9h5.4c-.2 1.4-1.6 4-5.4 4-3.3 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.6 14.6 2.6 12 2.6 6.9 2.6 2.7 6.8 2.7 12s4.2 9.4 9.3 9.4c5.4 0 8.9-3.8 8.9-9.1 0-.6-.1-1.1-.2-1.6H12z"
        />
      </svg>
    ),
  },
  {
    id: 'GITHUB',
    label: 'GitHub',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
        <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
      </svg>
    ),
  },
]

/**
 * "Continue with Google/GitHub" — full-page navigations into the API's OAuth
 * flow. Providers the server has not configured are shown disabled.
 */
export function SocialButtons({
  redirect,
  remember,
}: {
  redirect?: string | undefined
  remember: boolean
}) {
  const { data: enabled } = useAuthProviders()

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {PROVIDERS.map((provider) => {
        const available = enabled?.includes(provider.id) ?? true
        const className = cn(buttonVariants({ variant: 'outline' }), 'w-full')
        return available ? (
          <a
            key={provider.id}
            href={oauthStartUrl(provider.id, { redirect, remember })}
            className={className}
          >
            {provider.icon}
            Continue with {provider.label}
          </a>
        ) : (
          <button
            key={provider.id}
            type="button"
            disabled
            className={className}
            title={`${provider.label} sign-in is not configured on this server`}
          >
            {provider.icon}
            {provider.label} unavailable
          </button>
        )
      })}
    </div>
  )
}
