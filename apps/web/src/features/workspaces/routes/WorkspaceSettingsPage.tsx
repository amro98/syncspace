import { canInviteMember } from '@syncspace/shared'

import { InviteForm } from '../components/InviteForm'
import { useCurrentWorkspaceId, useWorkspace, useWorkspaceActor } from '../hooks'

const ROLE_LABEL = { OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member' } as const

/** Workspace settings: details and invitations (member management grows here later). */
export function WorkspaceSettingsPage() {
  const workspaceId = useCurrentWorkspaceId()
  const { data: workspace } = useWorkspace(workspaceId)
  const actor = useWorkspaceActor()
  if (!workspace || !actor) return null

  return (
    <section className="mx-auto flex w-full max-w-(--content-max-width) flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Workspace settings</h1>

      <section aria-labelledby="settings-details" className="flex flex-col gap-3">
        <h2 id="settings-details" className="font-medium">
          Details
        </h2>
        <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Name</dt>
          <dd>{workspace.name}</dd>
          <dt className="text-muted-foreground">URL</dt>
          <dd className="font-mono">{workspace.slug}</dd>
          <dt className="text-muted-foreground">Your role</dt>
          <dd>{ROLE_LABEL[workspace.membership.role]}</dd>
        </dl>
      </section>

      <section aria-labelledby="settings-invite" className="flex max-w-2xl flex-col gap-3">
        <div>
          <h2 id="settings-invite" className="font-medium">
            Invite people
          </h2>
          <p className="text-sm text-muted-foreground">
            Invitations are emailed and expire after 7 days. Re-sending replaces the previous link.
          </p>
        </div>
        {canInviteMember(actor, 'MEMBER') ? (
          <InviteForm workspaceId={workspace.id} actor={actor} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Only workspace owners and admins can invite people.
          </p>
        )}
      </section>
    </section>
  )
}
