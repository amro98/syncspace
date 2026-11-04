import { type Task, TASK_PRIORITIES, type TaskPriority } from '@syncspace/shared'

/**
 * Board filters live in the URL (`?assignee=me&priority=HIGH,URGENT&q=login`),
 * so a filtered board is shareable and survives reloads. Filtering is purely
 * client-side over the loaded board; it never changes server state.
 */

export const DUE_FILTERS = ['overdue', 'today', 'week', 'none'] as const
export type DueFilter = (typeof DUE_FILTERS)[number]

export const STATUS_FILTERS = ['open', 'done'] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

export interface BoardFilters {
  /** A user id, `me`, or `none` (unassigned). */
  assignee: string | null
  priorities: TaskPriority[]
  labelIds: string[]
  due: DueFilter | null
  status: StatusFilter | null
  q: string
}

const list = (value: string | null) => (value ? value.split(',').filter(Boolean) : [])

export function parseFilters(params: URLSearchParams): BoardFilters {
  const due = params.get('due')
  const status = params.get('status')
  return {
    assignee: params.get('assignee'),
    priorities: list(params.get('priority')).filter((p): p is TaskPriority =>
      (TASK_PRIORITIES as readonly string[]).includes(p),
    ),
    labelIds: list(params.get('label')),
    due: (DUE_FILTERS as readonly string[]).includes(due ?? '') ? (due as DueFilter) : null,
    status: (STATUS_FILTERS as readonly string[]).includes(status ?? '')
      ? (status as StatusFilter)
      : null,
    q: params.get('q') ?? '',
  }
}

/** Writes filters into `params` (keeping unrelated params such as `?task=`). */
export function writeFilters(params: URLSearchParams, filters: BoardFilters): URLSearchParams {
  const next = new URLSearchParams(params)
  const set = (key: string, value: string | null) => {
    if (value) next.set(key, value)
    else next.delete(key)
  }
  set('assignee', filters.assignee)
  set('priority', filters.priorities.join(','))
  set('label', filters.labelIds.join(','))
  set('due', filters.due)
  set('status', filters.status)
  set('q', filters.q.trim())
  return next
}

export function hasFilters(filters: BoardFilters): boolean {
  return (
    filters.assignee !== null ||
    filters.priorities.length > 0 ||
    filters.labelIds.length > 0 ||
    filters.due !== null ||
    filters.status !== null ||
    filters.q.trim() !== ''
  )
}

export const EMPTY_FILTERS: BoardFilters = {
  assignee: null,
  priorities: [],
  labelIds: [],
  due: null,
  status: null,
  q: '',
}

// ---------------------------------------------------------------------------
// Due dates
// ---------------------------------------------------------------------------

export type DueState = 'none' | 'done' | 'overdue' | 'today' | 'soon' | 'later'

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Due state in the viewer's local timezone. Due dates are stored as instants:
 * picking "Nov 12" stores the end of Nov 12 local time.
 */
export function dueState(task: Pick<Task, 'dueDate' | 'completedAt'>, now = new Date()): DueState {
  if (!task.dueDate) return 'none'
  if (task.completedAt) return 'done'
  const due = new Date(task.dueDate)
  if (due.getTime() < now.getTime()) return 'overdue'
  const days = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  return days <= 7 ? 'soon' : 'later'
}

/** `YYYY-MM-DD` (local) for `<input type="date">`. */
export function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A picked local date → the end of that day in local time, as a UTC instant. */
export function fromDateInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day] = match.map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 23, 59, 59, 999).toISOString()
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export function matchesFilters(
  task: Task,
  filters: BoardFilters,
  viewerId: string,
  now = new Date(),
): boolean {
  if (filters.assignee) {
    const ids = task.assignees.map((user) => user.id)
    if (
      filters.assignee === 'none'
        ? ids.length > 0
        : !ids.includes(filters.assignee === 'me' ? viewerId : filters.assignee)
    ) {
      return false
    }
  }
  if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) return false
  if (
    filters.labelIds.length > 0 &&
    !task.labels.some((label) => filters.labelIds.includes(label.id))
  ) {
    return false
  }
  if (filters.status === 'open' && task.completedAt) return false
  if (filters.status === 'done' && !task.completedAt) return false
  if (filters.due) {
    const state = dueState(task, now)
    if (filters.due === 'none' && task.dueDate) return false
    if (filters.due === 'overdue' && state !== 'overdue') return false
    if (filters.due === 'today' && state !== 'today' && state !== 'overdue') return false
    if (filters.due === 'week' && !['overdue', 'today', 'soon'].includes(state)) return false
  }
  const q = filters.q.trim().toLowerCase()
  if (
    q &&
    !task.title.toLowerCase().includes(q) &&
    !(task.description ?? '').toLowerCase().includes(q)
  ) {
    return false
  }
  return true
}
