import {
  canAddChannelMember,
  canManageChannel,
  canRemoveChannelMember,
  type ChannelContext,
  type ChannelSummary,
  type WorkspaceActor,
} from '@syncspace/shared'
import { Archive, ArchiveRestore, LogOut, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { paths } from '@/app/router/paths'
import { Avatar } from '@/components/shared/Avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/features/auth/messages'
import { formatFullDate } from '@/lib/format'

import {
  useAddChannelMember,
  useChannelMembers,
  useRemoveChannelMember,
  useSetChannelArchived,
  useUpdateChannel,
  useWorkspaceMembers,
} from '../hooks'
import { MemberPicker } from './MemberPicker'

function AboutSection({
  workspaceId,
  channel,
  canManage,
}: {
  workspaceId: string
  channel: ChannelSummary
  canManage: boolean
}) {
  const update = useUpdateChannel(workspaceId, channel.id)
  const [name, setName] = useState(channel.name)
  const [description, setDescription] = useState(channel.description ?? '')
  const dirty = name.trim() !== channel.name || description.trim() !== (channel.description ?? '')

  if (!canManage) {
    return (
      <section className="flex flex-col gap-1 text-sm">
        <h3 className="font-medium">About</h3>
        <p className="text-muted-foreground">{channel.description ?? 'No description.'}</p>
      </section>
    )
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim()) return
        update.mutate({ name: name.trim(), description: description.trim() || null })
      }}
    >
      <h3 className="text-sm font-medium">About</h3>
      {update.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(update.error)}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="settings-channel-name">Name</Label>
        <Input
          id="settings-channel-name"
          value={name}
          required
          disabled={channel.archivedAt !== null}
          onChange={(event) => {
            setName(event.target.value)
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="settings-channel-description">Description</Label>
        <Input
          id="settings-channel-description"
          value={description}
          disabled={channel.archivedAt !== null}
          onChange={(event) => {
            setDescription(event.target.value)
          }}
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        {update.isSuccess && !dirty && (
          <span className="text-xs text-muted-foreground" role="status">
            Saved
          </span>
        )}
        <Button type="submit" size="sm" disabled={!dirty || !name.trim() || update.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  )
}

function MembersSection({
  workspaceId,
  channel,
  context,
  actor,
}: {
  workspaceId: string
  channel: ChannelSummary
  context: ChannelContext
  actor: WorkspaceActor
}) {
  const members = useChannelMembers(workspaceId, channel.id, true)
  const directory = useWorkspaceMembers(workspaceId)
  const add = useAddChannelMember(workspaceId, channel.id)
  const remove = useRemoveChannelMember(workspaceId, channel.id)
  const [adding, setAdding] = useState(false)
  const canAdd = canAddChannelMember(actor, context)
  const memberIds = members.data?.map((m) => m.id) ?? []
  const candidates = (directory.data ?? []).filter((m) => !memberIds.includes(m.id))
  const error = add.error ?? remove.error

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Members {members.data && `(${String(members.data.length)})`}
        </h3>
        {canAdd && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAdding((value) => !value)
            }}
          >
            {adding ? 'Done' : 'Add people'}
          </Button>
        )}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      )}
      {adding && (
        <MemberPicker
          members={candidates}
          selected={[]}
          label="Find people to add"
          emptyText="Everyone in the workspace is already here."
          onToggle={(member) => {
            add.mutate(member.id)
          }}
        />
      )}
      <ul
        className="flex max-h-60 flex-col divide-y overflow-y-auto rounded-md border"
        aria-label="Channel members"
      >
        {members.isPending && <li className="p-3 text-sm text-muted-foreground">Loading…</li>}
        {members.data?.map((member) => (
          <li key={member.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <Avatar name={member.name} src={member.avatarUrl} className="size-7" />
            <span className="min-w-0 flex-1 truncate">
              {member.name}
              {member.id === actor.userId && <span className="text-muted-foreground"> (you)</span>}
            </span>
            {member.id !== actor.userId && canRemoveChannelMember(actor, context, member.id) && (
              <button
                type="button"
                aria-label={`Remove ${member.name} from the channel`}
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate(member.id)
                }}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-danger focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <UserMinus className="size-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Channel details for everyone; editing, archiving and member management only
 * where the shared permission policy allows (the API enforces the same rules).
 */
export function ChannelSettingsDialog({
  open,
  onOpenChange,
  workspaceId,
  channel,
  actor,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  channel: ChannelSummary
  actor: WorkspaceActor
}) {
  const navigate = useNavigate()
  const archive = useSetChannelArchived(workspaceId, channel.id)
  const leave = useRemoveChannelMember(workspaceId, channel.id)
  const context: ChannelContext = {
    type: channel.type,
    isArchived: channel.archivedAt !== null,
    isMember: channel.isMember,
  }
  const canManage = canManageChannel(actor, context)
  const canLeave =
    channel.type === 'PRIVATE' && canRemoveChannelMember(actor, context, actor.userId)
  const archived = channel.archivedAt !== null

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${channel.type === 'PRIVATE' ? '' : '#'}${channel.name}`}
      description={
        channel.type === 'PRIVATE'
          ? 'Private channel: only members (and workspace admins) can see it.'
          : 'Public channel: everyone in the workspace can see it.'
      }
      className="sm:max-w-lg"
    >
      <div className="flex flex-col gap-6">
        <AboutSection
          key={`${channel.name}|${channel.description ?? ''}`}
          workspaceId={workspaceId}
          channel={channel}
          canManage={canManage}
        />

        {channel.type === 'PRIVATE' && (
          <MembersSection
            workspaceId={workspaceId}
            channel={channel}
            context={context}
            actor={actor}
          />
        )}

        {(canManage || canLeave) && (
          <section className="flex flex-col gap-2 border-t pt-4">
            {archive.isError && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage(archive.error)}</AlertDescription>
              </Alert>
            )}
            {leave.isError && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage(leave.error)}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={archive.isPending}
                  onClick={() => {
                    archive.mutate(!archived)
                  }}
                >
                  {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                  {archived ? 'Unarchive channel' : 'Archive channel'}
                </Button>
              )}
              {canLeave && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={leave.isPending}
                  onClick={() => {
                    leave.mutate(actor.userId, {
                      onSuccess: () => {
                        onOpenChange(false)
                        void navigate(paths.workspace(workspaceId))
                      },
                    })
                  }}
                >
                  <LogOut aria-hidden />
                  Leave channel
                </Button>
              )}
            </div>
            {canManage && (
              <p className="text-xs text-muted-foreground">
                {archived
                  ? `Archived ${channel.archivedAt ? formatFullDate(channel.archivedAt) : ''}. Unarchiving lets members post again.`
                  : 'Archiving keeps the history readable but stops new messages.'}
              </p>
            )}
          </section>
        )}
      </div>
    </Dialog>
  )
}
