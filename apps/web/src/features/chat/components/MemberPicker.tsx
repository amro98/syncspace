import type { WorkspaceMember } from '@syncspace/shared'
import { Check } from 'lucide-react'
import { useId, useState } from 'react'

import { Avatar } from '@/components/shared/Avatar'
import { PresenceDot } from '@/components/shared/PresenceDot'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Searchable list of workspace members (client-side filter of the directory,
 * which is already loaded for presence). Selection is controlled.
 */
export function MemberPicker({
  members,
  selected,
  onToggle,
  label = 'Search people',
  emptyText = 'Nobody matches that search.',
}: {
  members: WorkspaceMember[]
  selected: string[]
  onToggle: (member: WorkspaceMember) => void
  label?: string
  emptyText?: string
}) {
  const [query, setQuery] = useState('')
  const inputId = useId()
  const needle = query.trim().toLowerCase()
  const visible = needle
    ? members.filter(
        (member) =>
          member.name.toLowerCase().includes(needle) || member.email.toLowerCase().includes(needle),
      )
    : members

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Input
        id={inputId}
        type="search"
        placeholder={label}
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
        }}
      />
      <ul className="flex max-h-64 flex-col overflow-y-auto rounded-md border" aria-label="People">
        {visible.length === 0 && <li className="p-3 text-sm text-muted-foreground">{emptyText}</li>}
        {visible.map((member) => {
          const isSelected = selected.includes(member.id)
          return (
            <li key={member.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  onToggle(member)
                }}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                  isSelected && 'bg-primary/5',
                )}
              >
                <span className="relative">
                  <Avatar name={member.name} src={member.avatarUrl} className="size-7" />
                  <PresenceDot
                    online={member.online}
                    className="absolute -right-0.5 -bottom-0.5 border-popover"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{member.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {member.email}
                  </span>
                </span>
                {isSelected && <Check className="size-4 text-primary" aria-hidden />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
