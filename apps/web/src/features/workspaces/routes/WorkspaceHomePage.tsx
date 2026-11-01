import { canInviteMember } from '@syncspace/shared'
import { UserPlus, Users } from 'lucide-react'
import { Link } from 'react-router'

import { paths } from '@/app/router/paths'
import { buttonVariants } from '@/components/ui/button'
import { useSession } from '@/features/auth/hooks'

import { useCurrentWorkspaceId, useWorkspace, useWorkspaceActor } from '../hooks'

const ROLE_LABEL = { OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member' } as const

/** Workspace overview (role, members, invite call-to-action). Boards plug in later. */
export function WorkspaceHomePage() {
  const workspaceId = useCurrentWorkspaceId()
  const { data: workspace } = useWorkspace(workspaceId)
  const { data: user } = useSession()
  const actor = useWorkspaceActor()
  if (!workspace || !user) return null

  return (
    <section className="mx-auto flex w-full max-w-(--content-max-width) flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Welcome back, {user.name.split(' ')[0]}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Your role</dt>
          <dd className="mt-1 font-medium">{ROLE_LABEL[workspace.membership.role]}</dd>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Members</dt>
          <dd className="mt-1 flex items-center gap-1.5 font-medium">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            {workspace.memberCount}
          </dd>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Workspace URL</dt>
          <dd className="mt-1 truncate font-mono text-sm">{workspace.slug}</dd>
        </div>
      </dl>

      {actor && canInviteMember(actor, 'MEMBER') && (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5">
          <div>
            <h2 className="font-medium">Bring your team in</h2>
            <p className="text-sm text-muted-foreground">
              SyncSpace works best with your teammates. Invite them by email.
            </p>
          </div>
          <Link to={paths.settings(workspace.id)} className={buttonVariants({ size: 'sm' })}>
            <UserPlus aria-hidden />
            Invite people
          </Link>
        </div>
      )}
    </section>
  )
}
