import type { TaskLabel, TaskPriority } from '@syncspace/shared'
import { CalendarClock, CircleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

import { dueLabel, PRIORITY_META } from '../display'

export function PriorityBadge({
  priority,
  compact = false,
}: {
  priority: TaskPriority
  /** Icon only (the label stays available to screen readers). */
  compact?: boolean
}) {
  const meta = PRIORITY_META[priority]
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs font-medium', meta.className)}
      title={`${meta.label} priority`}
    >
      <meta.icon className="size-3.5" aria-hidden />
      <span className={cn(compact && 'sr-only')}>
        {meta.label}
        {compact && ' priority'}
      </span>
    </span>
  )
}

export function DueBadge({
  task,
}: {
  task: { dueDate: string | null; completedAt: string | null }
}) {
  const due = dueLabel(task)
  if (!due) return null
  const Icon = due.state === 'overdue' ? CircleAlert : CalendarClock
  return (
    <span
      title={due.full}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs',
        due.state === 'overdue' && 'bg-danger/10 font-medium text-danger',
        due.state === 'today' &&
          'bg-warning/20 font-medium text-warning-foreground dark:text-warning',
        (due.state === 'soon' || due.state === 'later') && 'text-muted-foreground',
        due.state === 'done' && 'text-muted-foreground line-through',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {due.text}
    </span>
  )
}

/** A label chip: colour swatch + name (name always visible, not colour-only). */
export function LabelChip({ label, className }: { label: TaskLabel; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
        className,
      )}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      <span className="truncate">{label.name}</span>
    </span>
  )
}
