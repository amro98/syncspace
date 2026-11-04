import type { BoardColumn, BoardDetail, Task } from '@syncspace/shared'
import {
  type Announcements,
  closestCenter,
  closestCorners,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/features/auth/messages'

import { tasksByColumn } from '../cache'
import {
  useCreateColumn,
  useCreateTask,
  useDeleteColumn,
  useMoveColumn,
  useMoveTask,
  useRenameColumn,
} from '../hooks'
import { columnDragId } from '../display'
import { BoardColumnView } from './BoardColumnView'
import { TaskCardBody } from './TaskCard'

type Items = Record<string, string[]>

const isColumnId = (id: string) => id.startsWith('column:')
const columnIdOf = (dragId: string) => dragId.slice('column:'.length)

/** Columns drag among columns only; tasks use corner distance (works for empty columns too). */
const collisionDetection: CollisionDetection = (args) => {
  if (args.active.data.current?.type === 'column') {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => container.data.current?.type === 'column',
      ),
    })
  }
  return closestCorners(args)
}

function AddColumnTile({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  return (
    <div className="w-[85vw] shrink-0 snap-center sm:w-72 sm:snap-start">
      {open ? (
        <form
          className="flex flex-col gap-2 rounded-xl bg-muted/60 p-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) onAdd(name.trim())
            setName('')
            setOpen(false)
          }}
        >
          <Input
            autoFocus
            aria-label="New column name"
            placeholder="Column name"
            value={name}
            maxLength={60}
            onChange={(event) => {
              setName(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false)
            }}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!name.trim()}>
              Add column
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
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
          }}
          className="flex w-full items-center gap-1.5 rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Plus className="size-4" aria-hidden />
          Add column
        </button>
      )}
    </div>
  )
}

/**
 * The horizontal Kanban: columns (reorderable) holding task cards
 * (draggable within and across columns). Drops are optimistic; failures roll
 * back and are reported through `onError`.
 */
export function BoardCanvas({
  workspaceId,
  detail,
  visibleTasks,
  canManage,
  canEdit,
  onOpenTask,
  onError,
}: {
  workspaceId: string
  detail: BoardDetail
  /** Tasks matching the current filters. */
  visibleTasks: Task[]
  canManage: boolean
  canEdit: boolean
  onOpenTask: (taskId: string) => void
  onError: (message: string) => void
}) {
  const boardId = detail.board.id
  const moveTask = useMoveTask(workspaceId, boardId)
  const { mutate: moveColumnMutate } = useMoveColumn(workspaceId, boardId)
  const { mutate: createTaskMutate } = useCreateTask(workspaceId, boardId)
  const createColumn = useCreateColumn(workspaceId, boardId)
  const { mutate: renameColumnMutate } = useRenameColumn(workspaceId, boardId)
  const deleteColumn = useDeleteColumn(workspaceId, boardId)
  const [deleting, setDeleting] = useState<BoardColumn | null>(null)

  const columns = detail.columns
  const taskById = useMemo(
    () => new Map(detail.tasks.map((task) => [task.id, task])),
    [detail.tasks],
  )
  const totals = useMemo(() => tasksByColumn(detail), [detail])
  const baseItems = useMemo<Items>(() => {
    const visible = new Set(visibleTasks.map((task) => task.id))
    return Object.fromEntries(
      columns.map((column) => [
        column.id,
        (totals.get(column.id) ?? []).filter((task) => visible.has(task.id)).map((task) => task.id),
      ]),
    )
  }, [columns, totals, visibleTasks])

  // While dragging: the live arrangement. After a drop: held until the
  // optimistic cache write replaces `detail` (no flicker back).
  const [dragItems, setDragItems] = useState<Items | null>(null)
  const [held, setHeld] = useState<{ items: Items; detail: BoardDetail } | null>(null)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const items = dragItems ?? (held?.detail === detail ? held.items : baseItems)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Touch: press and hold, so horizontal swiping still scrolls the board.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter opens the task; Space picks it up / drops it.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  )

  const containerOf = useCallback(
    (id: string, from: Items): string | undefined =>
      isColumnId(id) ? columnIdOf(id) : Object.keys(from).find((key) => from[key]?.includes(id)),
    [],
  )

  const describe = (id: string | number) => {
    const key = String(id)
    if (isColumnId(key))
      return `column ${columns.find((c) => c.id === columnIdOf(key))?.name ?? ''}`
    return `task ${taskById.get(key)?.title ?? ''}`
  }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${describe(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${describe(active.id)} is over ${describe(over.id)}.`
        : `${describe(active.id)} is not over a drop area.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${describe(active.id)} was dropped on ${describe(over.id)}.`
        : `${describe(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Moving ${describe(active.id)} was cancelled.`,
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    if (active.data.current?.type !== 'task') return
    setHeld(null)
    setDragItems(items)
    setActiveTaskId(String(active.id))
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (active.data.current?.type !== 'task' || !over) return
    setDragItems((previous) => {
      if (!previous) return previous
      const activeId = String(active.id)
      const overId = String(over.id)
      const from = containerOf(activeId, previous)
      const to = containerOf(overId, previous)
      if (!from || !to || from === to) return previous
      const source = (previous[from] ?? []).filter((id) => id !== activeId)
      const target = [...(previous[to] ?? [])]
      const overIndex = target.indexOf(overId)
      const translated = active.rect.current.translated
      const below = translated !== null && translated.top > over.rect.top + over.rect.height / 2
      const index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length
      target.splice(index, 0, activeId)
      return { ...previous, [from]: source, [to]: target }
    })
  }

  const finishTaskDrag = (activeId: string, overId: string | null) => {
    const current = dragItems ?? items
    setDragItems(null)
    setActiveTaskId(null)
    const task = taskById.get(activeId)
    const columnId = containerOf(activeId, current)
    if (!task || !columnId || !overId) return

    let list = current[columnId] ?? []
    const overIndex = list.indexOf(overId)
    const activeIndex = list.indexOf(activeId)
    if (overIndex >= 0 && activeIndex >= 0 && overIndex !== activeIndex) {
      list = arrayMove(list, activeIndex, overIndex)
    }
    const index = list.indexOf(activeId)
    const afterTaskId = index > 0 ? (list[index - 1] ?? null) : null

    const originalList = baseItems[task.columnId] ?? []
    const originalIndex = originalList.indexOf(activeId)
    const originalAfter = originalIndex > 0 ? (originalList[originalIndex - 1] ?? null) : null
    if (columnId === task.columnId && afterTaskId === originalAfter) return

    setHeld({ items: { ...current, [columnId]: list }, detail })
    moveTask.mutate(
      { taskId: activeId, columnId, afterTaskId },
      {
        onError: (error) => {
          onError(`Could not move “${task.title}”: ${errorMessage(error)}`)
        },
      },
    )
  }

  const moveColumnTo = useCallback(
    (columnId: string, afterColumnId: string | null) => {
      moveColumnMutate(
        { columnId, afterColumnId },
        {
          onError: (error) => {
            onError(`Could not move the column: ${errorMessage(error)}`)
          },
        },
      )
    },
    [moveColumnMutate, onError],
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (active.data.current?.type === 'column') {
      if (!over || active.id === over.id) return
      const ids = columns.map((column) => columnDragId(column.id))
      const order = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
      const index = order.indexOf(String(active.id))
      const after = index > 0 ? order[index - 1] : undefined
      moveColumnTo(columnIdOf(String(active.id)), after ? columnIdOf(after) : null)
      return
    }
    finishTaskDrag(String(active.id), over ? String(over.id) : null)
  }

  const onMoveColumnBy = useCallback(
    (columnId: string, direction: -1 | 1) => {
      const ids = columns.map((column) => column.id)
      const index = ids.indexOf(columnId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= ids.length) return
      const order = arrayMove(ids, index, target)
      moveColumnTo(columnId, target > 0 ? (order[target - 1] ?? null) : null)
    },
    [columns, moveColumnTo],
  )

  const onAddTask = useCallback(
    (columnId: string, title: string) => {
      createTaskMutate(
        { columnId, title },
        {
          onError: (error) => {
            onError(`Could not create the task: ${errorMessage(error)}`)
          },
        },
      )
    },
    [createTaskMutate, onError],
  )
  const onRename = useCallback(
    (columnId: string, name: string) => {
      renameColumnMutate({ columnId, name })
    },
    [renameColumnMutate],
  )

  const activeTask = activeTaskId ? taskById.get(activeTaskId) : undefined

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'To move a task, press Space to pick it up, use the arrow keys to move it, and press Space again to drop it. Press Escape to cancel. Press Enter to open it.',
          },
        }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragItems(null)
          setActiveTaskId(null)
        }}
      >
        {/* `relative`: makes the scroller the containing block of sr-only (absolute) text in
            off-screen columns, so it cannot widen the page on mobile. */}
        <div className="relative flex h-full snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain px-4 pt-1 pb-4 sm:snap-none">
          <SortableContext
            items={columns.map((column) => columnDragId(column.id))}
            strategy={horizontalListSortingStrategy}
          >
            {columns.map((column, index) => (
              <BoardColumnView
                key={column.id}
                column={column}
                taskIds={items[column.id] ?? []}
                taskById={taskById}
                visibleCount={baseItems[column.id]?.length ?? 0}
                totalCount={totals.get(column.id)?.length ?? 0}
                isFirst={index === 0}
                isLast={index === columns.length - 1}
                canManage={canManage}
                canEdit={canEdit}
                onOpenTask={onOpenTask}
                onAddTask={onAddTask}
                onRename={onRename}
                onMoveColumn={onMoveColumnBy}
                onDelete={setDeleting}
              />
            ))}
          </SortableContext>
          {canManage && (
            <AddColumnTile
              onAdd={(name) => {
                createColumn.mutate(name)
              }}
            />
          )}
        </div>
        <DragOverlay>{activeTask ? <TaskCardBody task={activeTask} overlay /> : null}</DragOverlay>
      </DndContext>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null)
            deleteColumn.reset()
          }
        }}
        title={`Delete “${deleting?.name ?? ''}”?`}
        description="Columns with tasks cannot be deleted: move the tasks to another column first. Archived tasks in it move to the first remaining column."
      >
        {deleteColumn.isError && (
          <p className="text-sm text-danger" role="alert">
            {errorMessage(deleteColumn.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDeleting(null)
              deleteColumn.reset()
            }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteColumn.isPending}
            onClick={() => {
              if (!deleting) return
              deleteColumn.mutate(deleting.id, {
                onSuccess: () => {
                  setDeleting(null)
                },
              })
            }}
          >
            Delete column
          </Button>
        </div>
      </Dialog>
    </>
  )
}
