import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'

import { paths } from '@/app/router/paths'
import { Spinner } from '@/components/shared/Spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { AuthCard } from '@/features/auth/components/AuthCard'
import { useLogout, useSession } from '@/features/auth/hooks'
import { errorMessage } from '@/features/auth/messages'
import { queryKeys } from '@/lib/query-keys'
import { useWorkspacePrefsStore } from '@/stores/workspace-prefs-store'

import { acceptInvite, previewInvite } from './api'

const ROLE_LABEL = { OWNER: 'an owner', ADMIN: 'an admin', MEMBER: 'a member' } as const

/**
 * `/invite/:token`. Works signed out (sign in / sign up, then come back here
 * via `?redirect=`), signed in with the invited email (accept), and signed in
 * as someone else (explain and offer to switch accounts).
 */
export function InvitePage() {
  const { token = '' } = useParams()
  const invitePath = paths.invite(token)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const session = useSession()
  const logout = useLogout()
  const setLastWorkspaceId = useWorkspacePrefsStore((state) => state.setLastWorkspaceId)

  const preview = useQuery({
    queryKey: queryKeys.invites.preview(token),
    queryFn: () => previewInvite(token),
    retry: false,
  })

  const accept = useMutation({
    mutationFn: () => acceptInvite(token),
    onSuccess: async ({ workspaceId }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all() })
      setLastWorkspaceId(workspaceId)
      void navigate(paths.workspace(workspaceId), { replace: true })
    },
  })

  if (preview.isPending || session.isPending) {
    return (
      <AuthCard title="Opening invitation">
        <Spinner label="Loading invitation" />
      </AuthCard>
    )
  }

  if (preview.isError) {
    return (
      <AuthCard title="Invitation unavailable">
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(preview.error)}</AlertDescription>
        </Alert>
        <Link to={paths.app()} className={buttonVariants({ variant: 'outline' })}>
          Go to SyncSpace
        </Link>
      </AuthCard>
    )
  }

  const invite = preview.data
  const user = session.data
  const title = `Join ${invite.workspace.name}`
  const description = `${invite.inviterName ?? 'A teammate'} invited ${invite.email} to join as ${ROLE_LABEL[invite.role]}.`

  if (invite.status === 'EXPIRED' || invite.status === 'REVOKED') {
    return (
      <AuthCard title={title} description={description}>
        <Alert variant="destructive">
          <AlertDescription>
            {invite.status === 'EXPIRED'
              ? 'This invitation has expired. Ask a workspace admin to send a new one.'
              : 'This invitation was revoked. Ask a workspace admin for a new one.'}
          </AlertDescription>
        </Alert>
      </AuthCard>
    )
  }

  if (!user) {
    return (
      <AuthCard
        title={title}
        description={description}
        footer={
          <>
            New to SyncSpace?{' '}
            <Link
              to={paths.register({ redirect: invitePath, email: invite.email })}
              className="font-medium text-primary hover:underline"
            >
              Create an account
            </Link>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Sign in with <span className="font-medium text-foreground">{invite.email}</span> to
          accept.
        </p>
        <Link to={paths.login({ redirect: invitePath })} className={buttonVariants()}>
          Sign in to accept
        </Link>
      </AuthCard>
    )
  }

  if (user.email !== invite.email) {
    return (
      <AuthCard title={title} description={description}>
        <Alert variant="warning">
          <AlertDescription>
            You’re signed in as <strong>{user.email}</strong>, but this invitation is for{' '}
            <strong>{invite.email}</strong>.
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          disabled={logout.isPending}
          onClick={() => {
            logout.mutate(undefined, {
              onSettled: () =>
                void navigate(paths.login({ redirect: invitePath }), { replace: true }),
            })
          }}
        >
          Sign out and switch account
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={title} description={description}>
      {accept.error && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(accept.error)}</AlertDescription>
        </Alert>
      )}
      <Button disabled={accept.isPending} onClick={() => accept.mutate()}>
        {accept.isPending
          ? 'Joining…'
          : invite.status === 'ACCEPTED'
            ? `Open ${invite.workspace.name}`
            : 'Accept invitation'}
      </Button>
    </AuthCard>
  )
}
