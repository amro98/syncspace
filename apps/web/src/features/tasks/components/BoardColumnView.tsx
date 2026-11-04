import type { BoardColumn, Task } from '@syncspace/shared'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft,
  ArrowRight,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { memo, useState } from 'react'

import { Popover } from '@/components/shared/Popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { columnDragId } from '../display'
import { TaskCard } from './TaskCard'

function AddTaskForm({
  columnName,
  onAdd,
}: {
  columnName: string
  onAdd: (title: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true)
        }}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Plus className="size-4" aria-hidden />
        Add task
      </button>
    )
  }
  const submit = () => {
    if (title.trim()) onAdd(title.trim())
    setTitle('')
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label className="sr-only" htmlFor={`new-task-${columnName}`}>
        New task in {columnName}
      </label>
      <textarea
        id={`new-task-${columnName}`}
        autoFocus
        rows={2}
        value={title}
        placeholder="Task title"
        maxLength={200}
        onChange={(event) => {
          setTitle(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!title.trim()}>
          Add
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false)
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

function ColumnMenu({
  column,
  isFirst,
  isLast,
  onRename,
  onMove,
  onDelete,
}: {
  column: BoardColumn
  isFirst: boolean
  isLast: boolean
  onRename: () => void
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
}) {
  const item =
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50 [&_svg]:size-4'
  return (
    <Popover
      label={`Column options for ${column.name}`}
      align="end"
      trigger={<MoreHorizontal className="size-4" aria-hidden />}
      triggerClassName="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <button type="button" className={item} onClick={onRename}>
        <Pencil aria-hidden /> Rename
      </button>
      <button
        type="button"
        className={item}
        disabled={isFirst}
        onClick={() => {
          onMove(-1)
        }}
      >
        <ArrowLeft aria-hidden /> Move left
      </button>
      <button
        type="button"
        className={item}
        disabled={isLast}
        onClick={() => {
          onMove(1)
        }}
      >
        <ArrowRight aria-hidden /> Move right
      </button>
      <button type="button" className={cn(item, 'text-danger')} onClick={onDelete}>
        <Trash2 aria-hidden /> Delete column
      </button>
    </Popover>
  )
}

function BoardColumnViewImpl({
  column,
  taskIds,
  taskById,
  visibleCount,
  totalCount,
  isFirst,
  isLast,
  canManage,
  canEdit,
  onOpenTask,
  onAddTask,
  onRename,
  onMoveColumn,
  onDelete,
}: {
  column: BoardColumn
  /** Ids in display order (a drag in progress may show tasks from other columns). */
  taskIds: string[]
  taskById: ReadonlyMap<string, Task>
  /** Tasks matching the current filters. */
  visibleCount: number
  /** All active tasks in the column, ignoring filters. */
  totalCount: number
  isFirst: boolean
  isLast: boolean
  canManage: boolean
  canEdit: boolean
  onOpenTask: (taskId: string) => void
  onAddTask: (columnId: string, title: string) => void
  onRename: (columnId: string, name: string) => void
  onMoveColumn: (columnId: string, direction: -1 | 1) => void
  onDelete: (column: BoardColumn) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(column.name)
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: columnDragId(column.id), data: { type: 'column' }, disabled: !canManage })
  const filtered = visibleCount !== totalCount

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={`${column.name} column`}
      className={cn(
        'flex max-h-full w-[85vw] shrink-0 snap-center flex-col rounded-xl bg-muted/60 sm:w-72 sm:snap-start',
        isDragging && 'opacity-50',
      )}
    >
      <header className="flex items-center gap-1 px-2 pt-2 pb-1">
        {canManage && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Reorder column ${column.name}`}
            className="cursor-grab touch-manipulation rounded p-1 text-muted-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        )}
        {renaming ? (
          <form
            className="flex-1"
            onSubmit={(event) => {
              event.preventDefault()
              if (name.trim() && name.trim() !== column.name) onRename(column.id, name.trim())
              setRenaming(false)
            }}
          >
            <Input
              autoFocus
              aria-label="Column name"
              value={name}
              maxLength={60}
              className="h-7"
              onChange={(event) => {
                setName(event.target.value)
              }}
              onBlur={(event) => {
                event.currentTarget.form?.requestSubmit()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setName(column.name)
                  setRenaming(false)
                }
              }}
            />
          </form>
        ) : (
          <h2 className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{column.name}</h2>
        )}
        <span
          className="rounded-full bg-background px-2 text-xs text-muted-foreground"
          title="Tasks in this column"
        >
          {filtered ? `${String(visibleCount)}/${String(totalCount)}` : totalCount}
          <span className="sr-only"> tasks</span>
        </span>
        {canManage && !renaming && (
          <ColumnMenu
            column={column}
            isFirst={isFirst}
            isLast={isLast}
            onRename={() => {
              setName(column.name)
              setRenaming(true)
            }}
            onMove={(direction) => {
              onMoveColumn(column.id, direction)
            }}
            onDelete={() => {
              onDelete(column)
            }}
          />
        )}
      </header>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <ul
          className="flex min-h-12 flex-1 flex-col gap-2 overflow-y-auto px-2 py-1"
          aria-label={`Tasks in ${column.name}`}
        >
          {taskIds.map((id) => {
            const task = taskById.get(id)
            return task ? (
              <TaskCard key={id} task={task} disabled={!canEdit} onOpen={onOpenTask} />
            ) : null
          })}
          {taskIds.length === 0 && (
            <li className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
              {filtered ? 'No matching tasks' : 'No tasks yet'}
            </li>
          )}
        </ul>
      </SortableContext>

      {canEdit && (
        <div className="p-2">
          <AddTaskForm
            columnName={column.name}
            onAdd={(title) => {
              onAddTask(column.id, title)
            }}
          />
        </div>
      )}
    </section>
  )
}

type ColumnProps = Parameters<typeof BoardColumnViewImpl>[0]

/**
 * Re-render a column only when ITS content changed: same ids in the same order
 * and the same task objects (cache writes keep untouched tasks' identity), plus
 * unchanged scalar props. A realtime update to one task re-renders one column.
 */
function sameColumn(previous: ColumnProps, next: ColumnProps): boolean {
  for (const key of Object.keys(next) as (keyof ColumnProps)[]) {
    if (key === 'taskIds' || key === 'taskById') continue
    if (previous[key] !== next[key]) return false
  }
  if (previous.taskIds.length !== next.taskIds.length) return false
  return next.taskIds.every(
    (id, index) =>
      previous.taskIds[index] === id && previous.taskById.get(id) === next.taskById.get(id),
  )
}

export const BoardColumnView = memo(BoardColumnViewImpl, sameColumn)
