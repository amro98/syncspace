import type { Task } from '@syncspace/shared'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CheckCircle2, Paperclip } from 'lucide-react'
import { memo } from 'react'

import { Avatar } from '@/components/shared/Avatar'
import { cn } from '@/lib/utils'

import { DueBadge, LabelChip, PriorityBadge } from './TaskBits'

const MAX_AVATARS = 3

/** The summary shown on the board: title, labels, priority, due state, assignees. */
export function TaskCardBody({ task, overlay = false }: { task: Task; overlay?: boolean }) {
  const shown = task.assignees.slice(0, MAX_AVATARS)
  const extra = task.assignees.length - shown.length
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-card p-3 text-left text-sm shadow-xs',
        overlay && 'rotate-1 shadow-lg ring-2 ring-primary/40',
      )}
    >
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </div>
      )}
      <p
        className={cn(
          'font-medium break-words',
          task.completedAt && 'text-muted-foreground line-through',
        )}
      >
        {task.completedAt && (
          <CheckCircle2
            className="mr-1 inline size-4 align-text-bottom text-success"
            aria-label="Completed"
          />
        )}
        {task.title}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge priority={task.priority} compact />
        <DueBadge task={task} />
        {task.attachments.length > 0 && (
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
            <Paperclip className="size-3.5" aria-hidden />
            {task.attachments.length}
            <span className="sr-only">
              {' '}
              {task.attachments.length === 1 ? 'attachment' : 'attachments'}
            </span>
          </span>
        )}
        {task.assignees.length > 0 && (
          <span
            className="ml-auto flex -space-x-1.5"
            aria-label={`Assigned to ${task.assignees.map((a) => a.name).join(', ')}`}
          >
            {shown.map((user) => (
              <Avatar
                key={user.id}
                name={user.name}
                src={user.avatarUrl}
                className="size-6 text-[10px] ring-2 ring-card"
              />
            ))}
            {extra > 0 && (
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium ring-2 ring-card">
                +{extra}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

function TaskCardImpl({
  task,
  disabled,
  onOpen,
}: {
  task: Task
  /** Read-only boards: no dragging. */
  disabled: boolean
  onOpen: (taskId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', columnId: task.columnId },
    disabled,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('touch-manipulation list-none', isDragging && 'opacity-40')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-roledescription={disabled ? undefined : 'draggable task'}
        aria-label={`${task.title}. Open task details`}
        onClick={() => {
          onOpen(task.id)
        }}
        className="block w-full rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <TaskCardBody task={task} />
      </button>
    </li>
  )
}

export const TaskCard = memo(TaskCardImpl)
