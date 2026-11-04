import {
  TASK_PRIORITIES,
  type TaskLabel,
  type TaskPriority,
  type WorkspaceMember,
} from '@syncspace/shared'
import { Filter, Search, X } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { PRIORITY_META } from '../display'
import {
  type BoardFilters,
  type DueFilter,
  EMPTY_FILTERS,
  hasFilters,
  type StatusFilter,
} from '../filters'

const selectClass =
  'h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
        }}
        className={cn(selectClass, value && 'border-primary bg-primary/5')}
      >
        {children}
      </select>
    </div>
  )
}

/** Board filters (stored in the URL by the page). Collapsible on small screens. */
export function FilterBar({
  filters,
  onChange,
  members,
  labels,
  shown,
  total,
}: {
  filters: BoardFilters
  onChange: (filters: BoardFilters) => void
  members: WorkspaceMember[]
  labels: TaskLabel[]
  shown: number
  total: number
}) {
  const [open, setOpen] = useState(false)
  const active = hasFilters(filters)
  const searchId = useId()

  return (
    <div className="flex flex-col gap-2 px-4 pb-2">
      <div className="flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search tasks on this board
          </label>
          <Search
            className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={searchId}
            type="search"
            placeholder="Search tasks…"
            className="h-8 pl-8"
            value={filters.q}
            onChange={(event) => {
              onChange({ ...filters, q: event.target.value })
            }}
          />
        </div>
        <Button
          size="sm"
          variant={active ? 'secondary' : 'outline'}
          className="sm:hidden"
          aria-expanded={open}
          onClick={() => {
            setOpen((value) => !value)
          }}
        >
          <Filter aria-hidden />
          Filters
        </Button>
        <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {active ? `Showing ${String(shown)} of ${String(total)} tasks` : `${String(total)} tasks`}
        </p>
      </div>

      <div
        className={cn('flex-wrap items-center gap-2', open ? 'flex' : 'hidden sm:flex')}
        role="group"
        aria-label="Filters"
      >
        <FilterSelect
          label="Assignee"
          value={filters.assignee ?? ''}
          onChange={(value) => {
            onChange({ ...filters, assignee: value || null })
          }}
        >
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Priority"
          value={filters.priorities[0] ?? ''}
          onChange={(value) => {
            onChange({ ...filters, priorities: value ? [value as TaskPriority] : [] })
          }}
        >
          <option value="">Any priority</option>
          {TASK_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_META[priority].label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Label"
          value={filters.labelIds[0] ?? ''}
          onChange={(value) => {
            onChange({ ...filters, labelIds: value ? [value] : [] })
          }}
        >
          <option value="">Any label</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Due date"
          value={filters.due ?? ''}
          onChange={(value) => {
            onChange({ ...filters, due: (value || null) as DueFilter | null })
          }}
        >
          <option value="">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="week">Due this week</option>
          <option value="none">No due date</option>
        </FilterSelect>
        <FilterSelect
          label="Status"
          value={filters.status ?? ''}
          onChange={(value) => {
            onChange({ ...filters, status: (value || null) as StatusFilter | null })
          }}
        >
          <option value="">Open and done</option>
          <option value="open">Open</option>
          <option value="done">Completed</option>
        </FilterSelect>
        {active && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange(EMPTY_FILTERS)
            }}
          >
            <X aria-hidden />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}
