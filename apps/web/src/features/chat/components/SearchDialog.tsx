import { Hash, KanbanSquare, MessageSquare, Search } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router'

import { paths } from '@/app/router/paths'
import { Spinner } from '@/components/shared/Spinner'
import { Dialog } from '@/components/ui/dialog'
import { errorMessage } from '@/features/auth/messages'
import { useSearchTasks } from '@/features/tasks/hooks'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

import { searchResultPath } from '../display'
import { useSearchMessages } from '../hooks'

const DEBOUNCE_MS = 250

function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value)
    }, delay)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])
  return debounced
}

interface Option {
  id: string
  path: string
}

/**
 * Ctrl/Cmd+K search over messages and tasks. Keyboard first: type, move with
 * ↑/↓ (Home/End), Enter opens, Escape closes. Combobox + listbox semantics so
 * screen readers announce the highlighted result. The API only searches what
 * the viewer can read; snippets render as plain text.
 */
export function SearchDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const listboxId = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const debounced = useDebounced(query, DEBOUNCE_MS)
  const messages = useSearchMessages(workspaceId, debounced)
  const tasks = useSearchTasks(workspaceId, debounced)
  const tooShort = debounced.trim().length < 2
  const settling = query.trim() !== debounced.trim()

  const messageResults = tooShort ? [] : (messages.data ?? [])
  const taskResults = tooShort ? [] : (tasks.data ?? [])
  const options: Option[] = [
    ...messageResults.map((result) => ({
      id: `${listboxId}-m-${result.messageId}`,
      path: searchResultPath(workspaceId, result),
    })),
    ...taskResults.map((task) => ({
      id: `${listboxId}-t-${task.taskId}`,
      path: paths.board(workspaceId, task.boardId, { task: task.taskId }),
    })),
  ]
  const activeIndex = Math.min(active, Math.max(0, options.length - 1))
  const activeOption = options[activeIndex]
  const loading = !tooShort && (settling || messages.isPending || tasks.isPending)
  const failed = !tooShort && messages.isError && tasks.isError

  const close = (next: boolean) => {
    if (!next) {
      setQuery('')
      setActive(0)
    }
    onOpenChange(next)
  }
  const go = (path: string) => {
    close(false)
    void navigate(path)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (options.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((activeIndex + 1) % options.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((activeIndex - 1 + options.length) % options.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(options.length - 1)
    } else if (event.key === 'Enter' && activeOption) {
      event.preventDefault()
      go(activeOption.path)
    }
  }

  // Keep the highlighted option scrolled into view.
  const activeId = activeOption?.id
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  const optionClass = (id: string) =>
    cn(
      'flex w-full cursor-pointer flex-col gap-1 px-3 py-2.5 text-left',
      activeId === id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
    )

  const renderOption = (option: Option | undefined, key: string, children: ReactNode) =>
    option ? (
      <div
        key={key}
        id={option.id}
        role="option"
        aria-selected={activeId === option.id}
        tabIndex={-1}
        className={optionClass(option.id)}
        onMouseMove={() => {
          setActive(options.indexOf(option))
        }}
        onClick={() => {
          go(option.path)
        }}
      >
        {children}
      </div>
    ) : null

  return (
    <Dialog open={open} onOpenChange={close} title="Search" className="sm:max-w-xl">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            role="combobox"
            aria-label="Search messages and tasks"
            aria-expanded={options.length > 0}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            placeholder="Search messages and tasks…"
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            className="flex h-9 w-full rounded-md border border-input bg-transparent py-1 pr-3 pl-9 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
          />
        </div>

        <div aria-live="polite" className="sr-only">
          {loading || tooShort
            ? ''
            : `${String(options.length)} ${options.length === 1 ? 'result' : 'results'}`}
        </div>

        {tooShort ? (
          <p className="text-sm text-muted-foreground">
            Type at least 2 characters. Use ↑ ↓ to choose and Enter to open.
          </p>
        ) : loading && options.length === 0 ? (
          <div className="flex justify-center py-4 text-muted-foreground">
            <Spinner label="Searching" />
          </div>
        ) : failed ? (
          <p className="text-sm text-danger" role="alert">
            {errorMessage(messages.error)}
          </p>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing matches “{debounced.trim()}”.</p>
        ) : (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Search results"
            className="flex max-h-[60dvh] flex-col overflow-y-auto rounded-md border"
          >
            {messageResults.length > 0 && (
              <div role="group" aria-labelledby={`${listboxId}-messages`}>
                <div
                  id={`${listboxId}-messages`}
                  className="sticky top-0 z-10 border-b bg-popover px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  Messages
                </div>
                {messageResults.map((result, i) =>
                  renderOption(
                    options[i],
                    result.messageId,
                    <>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {result.destination.kind === 'channel' ? (
                          <Hash className="size-3" aria-hidden />
                        ) : (
                          <MessageSquare className="size-3" aria-hidden />
                        )}
                        <span className="truncate">{result.destination.name}</span>
                        {result.parentMessageId && <span>· in thread</span>}
                        <span className="ml-auto shrink-0">{formatRelative(result.createdAt)}</span>
                      </span>
                      <span className="text-sm">
                        <span className="font-medium">{result.author.name}: </span>
                        <span className="text-muted-foreground">{result.snippet}</span>
                      </span>
                    </>,
                  ),
                )}
              </div>
            )}
            {taskResults.length > 0 && (
              <div role="group" aria-labelledby={`${listboxId}-tasks`}>
                <div
                  id={`${listboxId}-tasks`}
                  className="sticky top-0 z-10 border-y bg-popover px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  Tasks
                </div>
                {taskResults.map((task, i) =>
                  renderOption(
                    options[messageResults.length + i],
                    task.taskId,
                    <>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <KanbanSquare className="size-3" aria-hidden />
                        {task.boardName}
                        {task.completedAt && ' · completed'}
                      </span>
                      <span className="text-sm font-medium">{task.title}</span>
                      {task.snippet && (
                        <span className="text-xs text-muted-foreground">{task.snippet}</span>
                      )}
                    </>,
                  ),
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
