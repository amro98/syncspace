import type { TaskPriority } from '@syncspace/shared'
import { ArrowDown, ArrowUp, ChevronsUp, Equal, type LucideIcon } from 'lucide-react'

import { type DueState, dueState } from './filters'

/**
 * Priority is never shown by colour alone: every badge carries an icon and a
 * text label (visible or screen-reader only).
 */
export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; icon: LucideIcon; className: string }
> = {
  LOW: { label: 'Low', icon: ArrowDown, className: 'text-muted-foreground' },
  MEDIUM: { label: 'Medium', icon: Equal, className: 'text-primary' },
  HIGH: { label: 'High', icon: ArrowUp, className: 'text-warning-foreground dark:text-warning' },
  URGENT: { label: 'Urgent', icon: ChevronsUp, className: 'text-danger' },
}

/** Swatches offered when creating labels (any #RRGGBB is accepted by the API). */
export const LABEL_SWATCHES = [
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#14B8A6',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#64748B',
] as const

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const longDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export function dueLabel(
  task: { dueDate: string | null; completedAt: string | null },
  now = new Date(),
): { state: DueState; text: string; full: string } | null {
  if (!task.dueDate) return null
  const state = dueState(task, now)
  const date = new Date(task.dueDate)
  const day = shortDate.format(date)
  const text =
    state === 'overdue'
      ? `Overdue · ${day}`
      : state === 'today'
        ? 'Due today'
        : state === 'done'
          ? day
          : `Due ${day}`
  return { state, text, full: `Due ${longDate.format(date)}` }
}

/** dnd-kit id of a column (task ids are used as-is). */
export const columnDragId = (columnId: string) => `column:${columnId}`
