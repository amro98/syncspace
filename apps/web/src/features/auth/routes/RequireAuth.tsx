import { Navigate, Outlet, useLocation } from 'react-router'

import { paths } from '@/app/router/paths'
import { FullPageSpinner } from '@/components/shared/Spinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useRealtimeConnection } from '@/features/realtime/hooks'

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

  if (session.isPending) return <FullPageSpinner />
  if (session.isError) {
    return <SessionError error={session.error} retry={() => void session.refetch()} />
  }
  if (!session.data) {
    return <Navigate to={paths.login({ redirect: location.pathname + location.search })} replace />
  }
  return <SignedInArea userId={session.data.id} />
}
