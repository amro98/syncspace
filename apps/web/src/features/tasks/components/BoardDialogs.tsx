import { zodResolver } from '@hookform/resolvers/zod'
import {
  type Board,
  canManageLabels,
  createBoardInputSchema,
  type TaskLabel,
  type WorkspaceActor,
} from '@syncspace/shared'
import { Archive, ArchiveRestore, Check, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import type { z } from 'zod'

import { paths } from '@/app/router/paths'
import { Spinner } from '@/components/shared/Spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/features/auth/components/AuthCard'
import { errorMessage } from '@/features/auth/messages'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

import { LABEL_SWATCHES } from '../display'
import {
  useArchivedTasks,
  useCreateBoard,
  useLabelMutations,
  useSetBoardArchived,
  useSetTaskArchived,
  useUpdateBoard,
} from '../hooks'
import { LabelChip, PriorityBadge } from './TaskBits'

type BoardForm = z.input<typeof createBoardInputSchema>

export function CreateBoardDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const create = useCreateBoard(workspaceId)
  const form = useForm<BoardForm, unknown, z.output<typeof createBoardInputSchema>>({
    resolver: zodResolver(createBoardInputSchema),
    defaultValues: { name: '', description: '' },
  })
  const close = (next: boolean) => {
    if (!next) {
      form.reset()
      create.reset()
    }
    onOpenChange(next)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Create a board"
      description="Boards start with To Do, In Progress and Done columns. Everyone in the workspace can see them."
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(({ name, description }) => {
          create.mutate(description ? { name, description } : { name }, {
            onSuccess: (board) => {
              close(false)
              void navigate(paths.board(workspaceId, board.id))
            },
          })
        })}
      >
        {create.isError && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(create.error)}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="board-name">Name</Label>
          <Input
            id="board-name"
            placeholder="e.g. Product roadmap"
            autoComplete="off"
            aria-invalid={form.formState.errors.name ? true : undefined}
            {...form.register('name')}
          />
          <FieldError id="board-name-error" message={form.formState.errors.name?.message} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="board-description">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id="board-description" {...form.register('description')} />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              close(false)
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create board'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function LabelsSection({ workspaceId, labels }: { workspaceId: string; labels: TaskLabel[] }) {
  const { create, remove } = useLabelMutations(workspaceId)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(LABEL_SWATCHES[5])
  const error = create.error ?? remove.error
  return (
    <section className="flex flex-col gap-3 border-t pt-4">
      <h3 className="text-sm font-medium">Workspace labels</h3>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(error)}
        </p>
      )}
      <ul className="flex flex-wrap gap-1.5" aria-label="Labels">
        {labels.length === 0 && <li className="text-sm text-muted-foreground">No labels yet.</li>}
        {labels.map((label) => (
          <li key={label.id} className="flex items-center gap-0.5">
            <LabelChip label={label} />
            <button
              type="button"
              aria-label={`Delete label ${label.name}`}
              onClick={() => {
                remove.mutate(label.id)
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-danger focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!name.trim()) return
          create.mutate(
            { name: name.trim(), color },
            {
              onSuccess: () => {
                setName('')
              },
            },
          )
        }}
      >
        <div className="flex gap-2">
          <Input
            aria-label="New label name"
            placeholder="New label"
            value={name}
            maxLength={40}
            className="h-8"
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
          <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
            Add label
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Label colour">
          {LABEL_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              role="radio"
              aria-checked={color === swatch}
              aria-label={`Colour ${swatch}`}
              onClick={() => {
                setColor(swatch)
              }}
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-white focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                color === swatch && 'ring-2 ring-foreground ring-offset-2 ring-offset-popover',
              )}
              style={{ backgroundColor: swatch }}
            >
              {color === swatch && <Check className="size-3.5" aria-hidden />}
            </button>
          ))}
        </div>
      </form>
    </section>
  )
}

/** Board name/description, archive state and (for admins) workspace labels. */
export function BoardSettingsDialog({
  workspaceId,
  board,
  actor,
  canManage,
  labels,
  open,
  onOpenChange,
}: {
  workspaceId: string
  board: Board
  actor: WorkspaceActor
  canManage: boolean
  labels: TaskLabel[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const update = useUpdateBoard(workspaceId, board.id)
  const archive = useSetBoardArchived(workspaceId, board.id)
  const [name, setName] = useState(board.name)
  const [description, setDescription] = useState(board.description ?? '')
  const archived = board.archivedAt !== null
  const dirty = name.trim() !== board.name || description.trim() !== (board.description ?? '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Board settings" className="sm:max-w-lg">
      <div className="flex flex-col gap-5">
        {(update.error ?? archive.error) && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(update.error ?? archive.error)}</AlertDescription>
          </Alert>
        )}
        {canManage ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!name.trim()) return
              update.mutate({ name: name.trim(), description: description.trim() || null })
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="settings-board-name">Name</Label>
              <Input
                id="settings-board-name"
                value={name}
                disabled={archived}
                maxLength={80}
                onChange={(event) => {
                  setName(event.target.value)
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="settings-board-description">Description</Label>
              <Input
                id="settings-board-description"
                value={description}
                disabled={archived}
                maxLength={500}
                onChange={(event) => {
                  setDescription(event.target.value)
                }}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="self-end"
              disabled={!dirty || archived || update.isPending}
            >
              Save changes
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            {board.description ?? 'No description.'} Only the board’s creator and workspace admins
            can change its settings.
          </p>
        )}

        {canManage && (
          <section className="flex flex-col gap-2 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              {archived
                ? 'This board is archived and read-only. Restoring it lets everyone edit tasks again.'
                : 'Archiving keeps the board readable but stops all task and column changes.'}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              disabled={archive.isPending}
              onClick={() => {
                archive.mutate(!archived)
              }}
            >
              {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
              {archived ? 'Restore board' : 'Archive board'}
            </Button>
          </section>
        )}

        {canManageLabels(actor) && <LabelsSection workspaceId={workspaceId} labels={labels} />}
      </div>
    </Dialog>
  )
}

/** Archived tasks of a board: open one, or restore it in place. */
export function ArchivedTasksDialog({
  workspaceId,
  boardId,
  canEdit,
  open,
  onOpenChange,
  onOpenTask,
}: {
  workspaceId: string
  boardId: string
  canEdit: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenTask: (taskId: string) => void
}) {
  const archived = useArchivedTasks(workspaceId, boardId, open)
  const restore = useSetTaskArchived(workspaceId)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Archived tasks" className="sm:max-w-lg">
      {archived.isPending ? (
        <div className="flex justify-center py-6 text-muted-foreground">
          <Spinner label="Loading archived tasks" />
        </div>
      ) : archived.isError ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(archived.error)}
        </p>
      ) : archived.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No archived tasks on this board.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border" aria-label="Archived tasks">
          {archived.data.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <button
                type="button"
                className="min-w-0 flex-1 text-left hover:underline focus-visible:underline focus-visible:outline-none"
                onClick={() => {
                  onOpenChange(false)
                  onOpenTask(task.id)
                }}
              >
                <span className="block truncate font-medium">{task.title}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <PriorityBadge priority={task.priority} compact />
                  Archived {task.archivedAt ? formatRelative(task.archivedAt) : ''}
                </span>
              </button>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={restore.isPending}
                  onClick={() => {
                    restore.mutate({ taskId: task.id, archived: false })
                  }}
                >
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
