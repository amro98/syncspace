import {
  type BoardColumn,
  byPosition,
  type Task,
  TASK_PRIORITIES,
  type TaskLabel,
  type TaskPriority,
  type WorkspaceMember,
} from '@syncspace/shared'
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Circle,
  Paperclip,
  UserPlus,
  X,
} from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'

import { Avatar } from '@/components/shared/Avatar'
import { Spinner } from '@/components/shared/Spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/features/auth/messages'
import { MemberPicker } from '@/features/chat/components/MemberPicker'
import { formatFullDate, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

import { fromDateInput, toDateInput } from '../filters'
import { PRIORITY_META } from '../display'
import {
  useMoveTask,
  useSetTaskArchived,
  useSetTaskAssignees,
  useSetTaskLabels,
  useUpdateTask,
} from '../hooks'
import { DueBadge, LabelChip, PriorityBadge } from './TaskBits'

function Field({
  label,
  children,
  htmlFor,
}: {
  label: string
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[7rem_1fr] sm:items-start">
      <label htmlFor={htmlFor} className="pt-1.5 text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function TitleField({
  task,
  disabled,
  onSave,
}: {
  task: Task
  disabled: boolean
  onSave: (title: string) => void
}) {
  const [title, setTitle] = useState(task.title)
  const save = () => {
    const next = title.trim()
    if (next && next !== task.title) onSave(next)
    else setTitle(task.title)
  }
  return (
    <textarea
      aria-label="Task title"
      value={title}
      disabled={disabled}
      rows={2}
      maxLength={200}
      onChange={(event) => {
        setTitle(event.target.value)
      }}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          setTitle(task.title)
        }
      }}
      className="w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold hover:border-input focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:hover:border-transparent"
    />
  )
}

function DescriptionField({
  task,
  disabled,
  pending,
  onSave,
}: {
  task: Task
  disabled: boolean
  pending: boolean
  onSave: (description: string) => void
}) {
  const id = useId()
  const [value, setValue] = useState(task.description ?? '')
  const dirty = value !== (task.description ?? '')
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        Description
      </label>
      <textarea
        id={id}
        value={value}
        disabled={disabled}
        rows={5}
        maxLength={10_000}
        placeholder={disabled ? 'No description.' : 'Add more detail…'}
        onChange={(event) => {
          setValue(event.target.value)
        }}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm whitespace-pre-wrap focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-80"
      />
      {dirty && !disabled && (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              onSave(value)
            }}
          >
            Save description
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue(task.description ?? '')
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Task details: every field is editable in place (when the board is active).
 * A side drawer on desktop, a full-screen sheet on mobile; `?task=<id>` in the
 * URL opens it, so tasks are linkable.
 */
export function TaskPanel({
  workspaceId,
  task,
  loading,
  error,
  columns,
  columnTasks,
  labels,
  members,
  canEdit,
  readOnlyReason,
  onClose,
}: {
  workspaceId: string
  task: Task | undefined
  loading: boolean
  error: unknown
  columns: BoardColumn[]
  /** Active tasks of the board (for "move up/down" and "move to column"). */
  columnTasks: Task[]
  labels: TaskLabel[]
  members: WorkspaceMember[]
  canEdit: boolean
  readOnlyReason: string | null
  onClose: () => void
}) {
  const update = useUpdateTask(workspaceId)
  const assign = useSetTaskAssignees(workspaceId)
  const label = useSetTaskLabels(workspaceId)
  const archive = useSetTaskArchived(workspaceId)
  const move = useMoveTask(workspaceId, task?.boardId ?? '')
  const [picking, setPicking] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const ids = { column: useId(), priority: useId(), due: useId() }

  useEffect(() => {
    panelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const actionError = update.error ?? assign.error ?? label.error ?? archive.error ?? move.error
  const editable = canEdit && task?.archivedAt === null
  const siblings = task
    ? columnTasks.filter((t) => t.columnId === task.columnId).sort(byPosition)
    : []
  const index = task ? siblings.findIndex((t) => t.id === task.id) : -1

  const moveTo = (columnId: string, afterTaskId: string | null) => {
    if (!task) return
    move.mutate({ taskId: task.id, columnId, afterTaskId })
  }

  return (
    <>
      <div aria-hidden className="fixed inset-0 z-30 bg-black/30 sm:hidden" onClick={onClose} />
      <aside
        ref={panelRef}
        tabIndex={-1}
        aria-label="Task details"
        className="fixed inset-0 z-40 flex flex-col bg-background outline-none sm:top-(--topbar-height) sm:right-0 sm:bottom-0 sm:left-auto sm:w-[30rem] sm:border-l sm:shadow-xl"
      >
        <header className="flex h-(--topbar-height) shrink-0 items-center justify-between border-b px-4">
          <h2 className="font-semibold">Task</h2>
          <button
            type="button"
            aria-label="Close task"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        {!task ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            {loading ? (
              <Spinner label="Loading task" />
            ) : (
              <p role="alert">
                {error
                  ? errorMessage(error, 'This task is not available.')
                  : 'This task is not available.'}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
            {task.archivedAt && (
              <p
                role="status"
                className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm"
              >
                <Archive className="size-4" aria-hidden />
                Archived {formatRelative(task.archivedAt)}. Restore it to edit or move it.
              </p>
            )}
            {readOnlyReason && !task.archivedAt && (
              <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
                {readOnlyReason}
              </p>
            )}
            {actionError && (
              <p role="alert" className="text-sm text-danger">
                {errorMessage(actionError)}
              </p>
            )}

            <TitleField
              key={task.title}
              task={task}
              disabled={!editable}
              onSave={(title) => {
                update.mutate({ taskId: task.id, input: { title } })
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={task.completedAt ? 'secondary' : 'outline'}
                disabled={!editable || update.isPending}
                aria-pressed={task.completedAt !== null}
                onClick={() => {
                  update.mutate({ taskId: task.id, input: { completed: !task.completedAt } })
                }}
              >
                {task.completedAt ? (
                  <CheckCircle2 className="text-success" aria-hidden />
                ) : (
                  <Circle aria-hidden />
                )}
                {task.completedAt ? 'Completed' : 'Mark complete'}
              </Button>
              <PriorityBadge priority={task.priority} />
              <DueBadge task={task} />
            </div>

            <div className="flex flex-col gap-3">
              <Field label="Column" htmlFor={ids.column}>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    id={ids.column}
                    value={task.columnId}
                    disabled={!editable}
                    onChange={(event) => {
                      const target = event.target.value
                      const last = columnTasks
                        .filter((t) => t.columnId === target && t.id !== task.id)
                        .sort(byPosition)
                        .at(-1)
                      moveTo(target, last?.id ?? null)
                    }}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {columns.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!editable || index <= 0}
                    aria-label="Move up in column"
                    onClick={() => {
                      moveTo(task.columnId, index >= 2 ? (siblings[index - 2]?.id ?? null) : null)
                    }}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!editable || index < 0 || index >= siblings.length - 1}
                    aria-label="Move down in column"
                    onClick={() => {
                      moveTo(task.columnId, siblings[index + 1]?.id ?? null)
                    }}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                </div>
              </Field>

              <Field label="Priority" htmlFor={ids.priority}>
                <select
                  id={ids.priority}
                  value={task.priority}
                  disabled={!editable}
                  onChange={(event) => {
                    update.mutate({
                      taskId: task.id,
                      input: { priority: event.target.value as TaskPriority },
                    })
                  }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {TASK_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {PRIORITY_META[priority].label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Due date" htmlFor={ids.due}>
                <div className="flex items-center gap-2">
                  <Input
                    id={ids.due}
                    type="date"
                    className="h-8 w-auto"
                    disabled={!editable}
                    value={toDateInput(task.dueDate)}
                    onChange={(event) => {
                      const dueDate = fromDateInput(event.target.value)
                      if (dueDate) update.mutate({ taskId: task.id, input: { dueDate } })
                    }}
                  />
                  {task.dueDate && editable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        update.mutate({ taskId: task.id, input: { dueDate: null } })
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </Field>

              <Field label="Assignees">
                <div className="flex flex-col gap-2">
                  {task.assignees.length === 0 && (
                    <p className="pt-1.5 text-sm text-muted-foreground">Nobody</p>
                  )}
                  <ul className="flex flex-col gap-1" aria-label="Assignees">
                    {task.assignees.map((user) => (
                      <li key={user.id} className="flex items-center gap-2 text-sm">
                        <Avatar
                          name={user.name}
                          src={user.avatarUrl}
                          className="size-6 text-[10px]"
                        />
                        <span className="flex-1 truncate">{user.name}</span>
                        {editable && (
                          <button
                            type="button"
                            aria-label={`Unassign ${user.name}`}
                            onClick={() => {
                              assign.mutate({
                                taskId: task.id,
                                userIds: task.assignees
                                  .filter((a) => a.id !== user.id)
                                  .map((a) => a.id),
                              })
                            }}
                            className="rounded p-1 text-muted-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            <X className="size-3.5" aria-hidden />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {editable && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="self-start"
                      aria-expanded={picking}
                      onClick={() => {
                        setPicking((value) => !value)
                      }}
                    >
                      <UserPlus aria-hidden />
                      {picking ? 'Done' : 'Assign'}
                    </Button>
                  )}
                  {picking && editable && (
                    <MemberPicker
                      members={members}
                      selected={task.assignees.map((a) => a.id)}
                      label="Find people to assign"
                      onToggle={(member) => {
                        const current = task.assignees.map((a) => a.id)
                        assign.mutate({
                          taskId: task.id,
                          userIds: current.includes(member.id)
                            ? current.filter((id) => id !== member.id)
                            : [...current, member.id],
                        })
                      }}
                    />
                  )}
                </div>
              </Field>

              <Field label="Labels">
                {labels.length === 0 ? (
                  <p className="pt-1.5 text-sm text-muted-foreground">
                    No labels yet. Admins can create them in board settings.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Labels">
                    {labels.map((item) => {
                      const applied = task.labels.some((l) => l.id === item.id)
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            aria-pressed={applied}
                            disabled={!editable}
                            onClick={() => {
                              const current = task.labels.map((l) => l.id)
                              label.mutate({
                                taskId: task.id,
                                labelIds: applied
                                  ? current.filter((id) => id !== item.id)
                                  : [...current, item.id],
                              })
                            }}
                            className={cn(
                              'rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-default',
                              !applied && 'opacity-50 hover:opacity-80',
                            )}
                          >
                            <LabelChip
                              label={item}
                              className={cn(applied && 'border-primary bg-primary/5 font-medium')}
                            />
                            <span className="sr-only">
                              {applied ? ' (applied)' : ' (not applied)'}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Field>
            </div>

            <DescriptionField
              key={`${task.id}:${task.description ?? ''}`}
              task={task}
              disabled={!editable}
              pending={update.isPending}
              onSave={(description) => {
                update.mutate({ taskId: task.id, input: { description } })
              }}
            />

            {task.attachments.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-xs font-medium text-muted-foreground">Attachments</h3>
                <ul className="flex flex-col gap-1 text-sm">
                  {task.attachments.map((file) => (
                    <li key={file.id} className="flex items-center gap-2">
                      <Paperclip className="size-3.5 text-muted-foreground" aria-hidden />
                      <span className="truncate">{file.fileName}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <footer className="mt-auto flex flex-col gap-3 border-t pt-4 text-xs text-muted-foreground">
              <p>
                Created by {task.createdBy?.name ?? 'a former member'} on{' '}
                <time dateTime={task.createdAt}>{formatFullDate(task.createdAt)}</time>
                {task.completedAt && (
                  <>
                    {' '}
                    · completed{' '}
                    <time dateTime={task.completedAt}>{formatRelative(task.completedAt)}</time>
                  </>
                )}
              </p>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="self-start"
                  disabled={archive.isPending}
                  onClick={() => {
                    archive.mutate({ taskId: task.id, archived: task.archivedAt === null })
                  }}
                >
                  {task.archivedAt ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                  {task.archivedAt ? 'Restore task' : 'Archive task'}
                </Button>
              )}
            </footer>
          </div>
        )}
      </aside>
    </>
  )
}
