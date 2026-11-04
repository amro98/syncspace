import { Navigate, Outlet, useLocation } from 'react-router'

import { paths } from '@/app/router/paths'
import { FullPageSpinner } from '@/components/shared/Spinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useRealtimeConnection } from '@/features/realtime/hooks'
import { useUiStore } from '@/stores/ui-store'

import { useSession } from '../hooks'
import { errorMessage } from '../messages'

function SessionError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Alert variant="destructive" className="max-w-sm">
        <AlertTitle>Can’t load your session</AlertTitle>
        <AlertDescription>
          <p>{errorMessage(error)}</p>
          <Button variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </main>
  )
}

function SignedInArea({ userId }: { userId: string }) {
  useRealtimeConnection(userId)
  return <Outlet />
}

/**
 * Layout route for /app/*. Waits for the session (no flash of protected UI),
 * sends signed-out users to /login with a `redirect` back to where they were,
 * and owns the realtime connection while signed in.
 */
export function RequireAuth() {
  const session = useSession()
  const location = useLocation()
  const sessionExpired = useUiStore((state) => state.sessionExpired)
  const signedOut = useUiStore((state) => state.signedOut)

  if (session.isPending) return <FullPageSpinner />
  if (session.isError) {
    return <SessionError error={session.error} retry={() => void session.refetch()} />
  }
  if (!session.data) {
    // After an explicit sign-out the next person starts fresh (no redirect into
    // the previous account's pages); otherwise come back here after signing in.
    if (signedOut) return <Navigate to={paths.login()} replace />
    return (
      <Navigate
        to={paths.login({ redirect: location.pathname + location.search })}
        replace
        state={
          sessionExpired ? { notice: 'Your session expired. Sign in again to continue.' } : null
        }
      />
    )
  }
  return <SignedInArea userId={session.data.id} />
}
