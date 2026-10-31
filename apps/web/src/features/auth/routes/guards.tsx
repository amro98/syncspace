import { safeRedirectPath } from '@syncspace/shared'
import { Navigate, Outlet, useSearchParams } from 'react-router'

import { FullPageSpinner } from '@/components/shared/Spinner'

import { useSession } from '../hooks'

/** Layout route for /login, /register, /forgot-password: signed-in users go to the app. */
export function GuestOnly() {
  const session = useSession()
  const [searchParams] = useSearchParams()

  if (session.isPending) return <FullPageSpinner />
  if (session.data) {
    return <Navigate to={safeRedirectPath(searchParams.get('redirect'))} replace />
  }
  // A failed session check still lets people reach the sign-in form.
  return <Outlet />
}
