import type { OAuthPendingMode } from '@syncspace/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, Navigate, useNavigate } from 'react-router'

import { paths, routePatterns } from '@/app/router/paths'
import { Avatar } from '@/components/shared/Avatar'
import { Spinner } from '@/components/shared/Spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { queryKeys } from '@/lib/query-keys'

import { cancelOAuthPending, confirmOAuthPending, fetchOAuthPending } from '../api'
import { AuthCard } from '../components/AuthCard'
import { useReplaceSession } from '../hooks'
import { errorMessage } from '../messages'

const PROVIDER_LABEL = { GOOGLE: 'Google', GITHUB: 'GitHub' } as const

/**
 * Confirmation step after Google/GitHub sign-in when nothing can happen
 * silently:
 *   signup — no SyncSpace account yet: create one?
 *   link   — an account with this verified email exists: link the provider?
 * Nothing is created until the user confirms; cancelling discards everything.
 */
export function SocialConfirmPage({ mode }: { mode: OAuthPendingMode }) {
  const navigate = useNavigate()
  const replaceSession = useReplaceSession()

  const pending = useQuery({
    queryKey: queryKeys.auth.oauthPending(),
    queryFn: fetchOAuthPending,
    retry: false,
    staleTime: Infinity,
  })

  const confirm = useMutation({
    mutationFn: confirmOAuthPending,
    onSuccess: ({ user, redirectTo }) => {
      replaceSession(user)
      void navigate(redirectTo, { replace: true })
    },
  })

  const cancel = useMutation({
    mutationFn: cancelOAuthPending,
    onSettled: () => {
      void navigate(paths.login(), { replace: true })
    },
  })

  if (pending.isPending) {
    return (
      <AuthCard title="Just a moment">
        <Spinner label="Loading sign-in details" />
      </AuthCard>
    )
  }

  if (pending.isError) {
    return (
      <AuthCard title="Sign-in request expired">
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(pending.error)}</AlertDescription>
        </Alert>
        <Link to={paths.login()} className={buttonVariants({ variant: 'outline' })}>
          Back to sign in
        </Link>
      </AuthCard>
    )
  }

  const details = pending.data
  // The server decides the mode; keep the URL consistent with it.
  if (details.mode !== mode) {
    return (
      <Navigate
        to={details.mode === 'link' ? routePatterns.socialLink : routePatterns.socialConfirm}
        replace
      />
    )
  }

  const provider = PROVIDER_LABEL[details.provider]
  const busy = confirm.isPending || cancel.isPending

  return (
    <AuthCard
      title={
        mode === 'signup'
          ? `Continue with ${provider}`
          : 'An account already exists with this email.'
      }
      description={
        mode === 'signup'
          ? `Create your SyncSpace account using your ${provider} profile.`
          : `Link ${provider} to your existing account? You’ll be able to sign in with either.`
      }
    >
      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
        <Avatar name={details.name} src={details.avatarUrl} className="size-10" />
        <dl className="min-w-0 text-sm">
          <dt className="sr-only">Name</dt>
          <dd className="truncate font-medium">{details.name}</dd>
          <dt className="sr-only">Verified email</dt>
          <dd className="truncate text-muted-foreground">{details.email}</dd>
          <dt className="sr-only">Provider</dt>
          <dd className="text-xs text-muted-foreground">Verified by {provider}</dd>
        </dl>
      </div>

      {confirm.error && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(confirm.error)}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" disabled={busy} onClick={() => cancel.mutate()}>
          Cancel
        </Button>
        <Button disabled={busy} onClick={() => confirm.mutate()}>
          {confirm.isPending
            ? 'Please wait…'
            : mode === 'signup'
              ? 'Create account'
              : 'Link & Continue'}
        </Button>
      </div>
    </AuthCard>
  )
}
