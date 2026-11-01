import {
  canCreateChannel,
  canStartConversation,
  type ChannelSummary,
  type ConversationSummary,
  LIMITS,
  type WorkspaceActor,
  type WorkspaceMember,
} from '@syncspace/shared'
import { Hash, Lock, Plus, Users } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { NavLink } from 'react-router'

import { paths } from '@/app/router/paths'
import { Avatar } from '@/components/shared/Avatar'
import { PresenceDot } from '@/components/shared/PresenceDot'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

import { useChannels, useConversations, useWorkspaceMembers } from '../hooks'
import { conversationTitle, otherParticipants } from '../policy'
import { CreateChannelDialog } from './CreateChannelDialog'
import { NewConversationDialog } from './NewConversationDialog'

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] leading-[18px] font-semibold text-primary-foreground">
      {formatCount(count, LIMITS.UNREAD_COUNT_CAP)}
      <span className="sr-only"> unread</span>
    </span>
  )
}

function ItemLink({
  to,
  unread,
  icon,
  children,
  muted = false,
}: {
  to: string
  unread: number
  icon: ReactNode
  children: ReactNode
  muted?: boolean
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
          unread > 0 && 'font-semibold text-sidebar-foreground',
          muted && unread === 0 && 'text-sidebar-foreground/70',
        )
      }
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <UnreadBadge count={unread} />
    </NavLink>
  )
}

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-4 pb-1">
      <h2 className="text-xs font-semibold tracking-wide text-sidebar-foreground/70 uppercase">
        {title}
      </h2>
      {action}
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded p-0.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Plus className="size-4" aria-hidden />
    </button>
  )
}

function ChannelLink({ workspaceId, channel }: { workspaceId: string; channel: ChannelSummary }) {
  const Icon = channel.type === 'PRIVATE' ? Lock : Hash
  return (
    <ItemLink
      to={paths.channel(workspaceId, channel.id)}
      unread={channel.unreadCount}
      muted={channel.archivedAt !== null}
      icon={<Icon className="size-4 shrink-0 opacity-70" aria-hidden />}
    >
      {channel.name}
      {channel.type === 'PRIVATE' && <span className="sr-only"> (private)</span>}
    </ItemLink>
  )
}

function ConversationLink({
  workspaceId,
  conversation,
  viewerId,
  members,
}: {
  workspaceId: string
  conversation: ConversationSummary
  viewerId: string
  members: WorkspaceMember[] | undefined
}) {
  const direct =
    conversation.type === 'DIRECT' ? otherParticipants(conversation, viewerId)[0] : undefined
  const online = direct ? (members?.find((m) => m.id === direct.id)?.online ?? false) : false
  return (
    <ItemLink
      to={paths.dm(workspaceId, conversation.id)}
      unread={conversation.unreadCount}
      icon={
        direct ? (
          <span className="relative shrink-0">
            <Avatar name={direct.name} src={direct.avatarUrl} className="size-5 text-[9px]" />
            <PresenceDot online={online} className="absolute -right-0.5 -bottom-0.5 size-2" />
          </span>
        ) : (
          <Users className="size-4 shrink-0 opacity-70" aria-hidden />
        )
      }
    >
      {conversationTitle(conversation, viewerId)}
    </ItemLink>
  )
}

/** Channels and direct messages of the current workspace, with unread badges. */
export function ChatSidebar({
  workspaceId,
  actor,
}: {
  workspaceId: string
  actor: WorkspaceActor
}) {
  const channels = useChannels(workspaceId)
  const conversations = useConversations(workspaceId)
  const members = useWorkspaceMembers(workspaceId)
  const [creatingChannel, setCreatingChannel] = useState(false)
  const [startingConversation, setStartingConversation] = useState(false)

  // Alphabetical regardless of database collation (which may sort capitals first).
  const sorted = [...(channels.data ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  const active = sorted.filter((c) => !c.archivedAt)
  const archived = sorted.filter((c) => c.archivedAt)

  return (
    <>
      <SectionHeader
        title="Channels"
        action={
          canCreateChannel(actor) && (
            <AddButton
              label="Create channel"
              onClick={() => {
                setCreatingChannel(true)
              }}
            />
          )
        }
      />
      {channels.isPending && <p className="px-3 text-xs text-sidebar-foreground/60">Loading…</p>}
      {channels.isError && <p className="px-3 text-xs text-danger">Could not load channels.</p>}
      <ul aria-label="Channels" className="flex flex-col gap-0.5">
        {active.map((channel) => (
          <li key={channel.id}>
            <ChannelLink workspaceId={workspaceId} channel={channel} />
          </li>
        ))}
      </ul>
      {archived.length > 0 && (
        <details className="group mt-1">
          <summary className="cursor-pointer list-none rounded-md px-3 py-1 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span> archived ({archived.length})
          </summary>
          <ul aria-label="Archived channels" className="flex flex-col gap-0.5">
            {archived.map((channel) => (
              <li key={channel.id}>
                <ChannelLink workspaceId={workspaceId} channel={channel} />
              </li>
            ))}
          </ul>
        </details>
      )}

      <SectionHeader
        title="Direct messages"
        action={
          canStartConversation(actor) && (
            <AddButton
              label="New message"
              onClick={() => {
                setStartingConversation(true)
              }}
            />
          )
        }
      />
      {conversations.isError && (
        <p className="px-3 text-xs text-danger">Could not load conversations.</p>
      )}
      <ul aria-label="Direct messages" className="flex flex-col gap-0.5">
        {conversations.data?.map((conversation) => (
          <li key={conversation.id}>
            <ConversationLink
              workspaceId={workspaceId}
              conversation={conversation}
              viewerId={actor.userId}
              members={members.data}
            />
          </li>
        ))}
      </ul>
      {conversations.data?.length === 0 && (
        <button
          type="button"
          className="mx-3 mt-1 text-left text-xs text-sidebar-foreground/70 hover:underline"
          onClick={() => {
            setStartingConversation(true)
          }}
        >
          Start a conversation
        </button>
      )}

      <CreateChannelDialog
        workspaceId={workspaceId}
        open={creatingChannel}
        onOpenChange={setCreatingChannel}
      />
      <NewConversationDialog
        workspaceId={workspaceId}
        open={startingConversation}
        onOpenChange={setStartingConversation}
      />
    </>
  )
}
