import {
  canDeleteMessage,
  canEditMessage,
  canModerateMessage,
  canReactToMessage,
  canReplyToMessage,
  type MessageContext,
  type MessageDestination,
  type WorkspaceActor,
} from '@syncspace/shared'
import { AlertCircle, MessageSquareReply, Pencil, Trash2 } from 'lucide-react'
import { memo, type ReactNode, useState } from 'react'

import { Avatar } from '@/components/shared/Avatar'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { errorMessage } from '@/features/auth/messages'
import { formatFullDate, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { TimelineMessage } from '../cache'
import { useDeleteMessage, useEditMessage, useToggleReaction } from '../hooks'
import { EmojiPicker } from './EmojiPicker'

export interface MessageItemProps {
  message: TimelineMessage
  actor: WorkspaceActor
  policy: MessageDestination
  /** Same author within a few minutes: hide avatar/name. */
  compact: boolean
  inThread?: boolean
  onOpenThread?: (messageId: string) => void
  onRetry?: (message: TimelineMessage) => void
  onDiscard?: (message: TimelineMessage) => void
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-4"
    >
      {children}
    </button>
  )
}

function EditForm({
  initial,
  pending,
  onSave,
  onCancel,
}: {
  initial: string
  pending: boolean
  onSave: (content: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const submit = () => {
    if (value.trim()) onSave(value.trim())
  }
  return (
    <div className="mt-1 flex flex-col gap-2">
      <label className="sr-only" htmlFor="edit-message">
        Edit message
      </label>
      <textarea
        id="edit-message"
        autoFocus
        value={value}
        rows={Math.min(8, Math.max(2, value.split('\n').length))}
        onChange={(event) => {
          setValue(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          } else if (event.key === 'Escape') {
            onCancel()
          }
        }}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      />
      <div className="flex gap-2 text-xs">
        <Button size="sm" onClick={submit} disabled={pending || !value.trim()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="self-center text-muted-foreground">Enter to save · Esc to cancel</span>
      </div>
    </div>
  )
}

function MessageItemImpl({
  message,
  actor,
  policy,
  compact,
  inThread = false,
  onOpenThread,
  onRetry,
  onDiscard,
}: MessageItemProps) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const edit = useEditMessage()
  const remove = useDeleteMessage()
  const react = useToggleReaction()

  const pending = message.status !== undefined
  const deleted = message.deletedAt !== null
  const context: MessageContext = {
    authorId: message.author.id,
    isDeleted: deleted,
    isReply: message.parentMessageId !== null,
    destination: policy,
  }
  const canEdit = !pending && canEditMessage(actor, context)
  const canDelete = !pending && canDeleteMessage(actor, context)
  const moderating =
    canDelete && message.author.id !== actor.userId && canModerateMessage(actor, context)
  const canReact = !pending && canReactToMessage(actor, context)
  const canReply = !pending && !inThread && canReplyToMessage(actor, context)
  const actionError = edit.error ?? remove.error ?? react.error

  return (
    <article
      aria-label={`${message.author.name}, ${formatFullDate(message.createdAt)}`}
      className={cn(
        'group relative flex gap-3 px-4 focus-within:bg-muted/50 hover:bg-muted/50',
        compact ? 'py-0.5' : 'pt-2 pb-0.5',
        message.status === 'sending' && 'opacity-60',
      )}
    >
      <div className="w-8 shrink-0">
        {compact ? (
          <time
            dateTime={message.createdAt}
            className="invisible block pt-1 text-right text-[10px] text-muted-foreground group-hover:visible"
          >
            {formatTime(message.createdAt)}
          </time>
        ) : (
          <Avatar name={message.author.name} src={message.author.avatarUrl} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!compact && (
          <header className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{message.author.name}</span>
            <time
              dateTime={message.createdAt}
              title={formatFullDate(message.createdAt)}
              className="text-xs text-muted-foreground"
            >
              {formatTime(message.createdAt)}
            </time>
          </header>
        )}

        {deleted ? (
          <p className="text-sm text-muted-foreground italic">Message deleted</p>
        ) : editing ? (
          <EditForm
            initial={message.content}
            pending={edit.isPending}
            onCancel={() => {
              setEditing(false)
            }}
            onSave={(content) => {
              edit.mutate(
                { messageId: message.id, content },
                {
                  onSuccess: () => {
                    setEditing(false)
                  },
                },
              )
            }}
          />
        ) : (
          <p className="text-sm break-words whitespace-pre-wrap">
            {message.content}
            {message.editedAt && (
              <span
                className="ml-1 text-xs text-muted-foreground"
                title={formatFullDate(message.editedAt)}
              >
                (edited)
              </span>
            )}
          </p>
        )}

        {message.status === 'failed' && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-danger" role="alert">
            <AlertCircle className="size-3.5" aria-hidden />
            Not sent.
            <button
              type="button"
              className="font-medium underline"
              onClick={() => onRetry?.(message)}
            >
              Retry
            </button>
            <button type="button" className="underline" onClick={() => onDiscard?.(message)}>
              Discard
            </button>
          </p>
        )}
        {message.status === 'sending' && <span className="sr-only">Sending…</span>}

        {!deleted && message.reactions.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1" aria-label="Reactions">
            {message.reactions.map((reaction) => {
              const mine = reaction.userIds.includes(actor.userId)
              return (
                <li key={reaction.emoji}>
                  <button
                    type="button"
                    disabled={!canReact}
                    aria-pressed={mine}
                    aria-label={`${reaction.emoji} ${String(reaction.count)} ${reaction.count === 1 ? 'reaction' : 'reactions'}${mine ? ', including yours' : ''}`}
                    onClick={() => {
                      react.mutate({ messageId: message.id, emoji: reaction.emoji })
                    }}
                    className={cn(
                      'flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors disabled:cursor-default',
                      mine
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border bg-background hover:border-primary/40',
                    )}
                  >
                    <span aria-hidden>{reaction.emoji}</span>
                    <span aria-hidden>{reaction.count}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {!inThread && message.replyCount > 0 && (
          <button
            type="button"
            onClick={() => onOpenThread?.(message.id)}
            className="mt-1 text-xs font-medium text-primary hover:underline"
          >
            {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
          </button>
        )}

        {actionError && (
          <p className="mt-1 text-xs text-danger" role="alert">
            {errorMessage(actionError)}
          </p>
        )}
      </div>

      {!editing && (canReact || canReply || canEdit || canDelete) && (
        <div
          role="toolbar"
          aria-label="Message actions"
          className="absolute -top-3 right-4 flex items-center gap-0.5 rounded-lg border bg-popover p-0.5 opacity-0 shadow-sm group-hover:opacity-100 focus-within:opacity-100"
        >
          {canReact && (
            <EmojiPicker
              onPick={(emoji) => {
                react.mutate({ messageId: message.id, emoji })
              }}
            />
          )}
          {canReply && (
            <ActionButton label="Reply in thread" onClick={() => onOpenThread?.(message.id)}>
              <MessageSquareReply aria-hidden />
            </ActionButton>
          )}
          {canEdit && (
            <ActionButton
              label="Edit message"
              onClick={() => {
                setEditing(true)
              }}
            >
              <Pencil aria-hidden />
            </ActionButton>
          )}
          {canDelete && (
            <ActionButton
              label={moderating ? 'Delete message (moderation)' : 'Delete message'}
              onClick={() => {
                setConfirmDelete(true)
              }}
            >
              <Trash2 aria-hidden />
            </ActionButton>
          )}
        </div>
      )}

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete message?"
        description={
          moderating
            ? `You are removing a message by ${message.author.name} as a workspace moderator.`
            : 'This cannot be undone. Replies stay, and the message shows as deleted.'
        }
      >
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setConfirmDelete(false)
            }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate(message.id, {
                onSettled: () => {
                  setConfirmDelete(false)
                },
              })
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </article>
  )
}

export const MessageItem = memo(MessageItemImpl)
