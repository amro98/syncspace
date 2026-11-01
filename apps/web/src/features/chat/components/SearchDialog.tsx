import { Hash, MessageSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { Spinner } from '@/components/shared/Spinner'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/features/auth/messages'
import { formatRelative } from '@/lib/format'

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

/**
 * Workspace message search. The API only searches destinations the user can
 * read; snippets are rendered as plain text.
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
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query, DEBOUNCE_MS)
  const search = useSearchMessages(workspaceId, debounced)
  const tooShort = debounced.trim().length < 2

  const close = (next: boolean) => {
    if (!next) setQuery('')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close} title="Search messages" className="sm:max-w-xl">
      <div className="flex flex-col gap-3">
        <label htmlFor="message-search" className="sr-only">
          Search messages
        </label>
        <Input
          id="message-search"
          type="search"
          placeholder="Search messages…"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
          }}
        />
        <div aria-live="polite" className="min-h-10">
          {tooShort ? (
            <p className="text-sm text-muted-foreground">Type at least 2 characters.</p>
          ) : search.isPending ? (
            <div className="flex justify-center py-4 text-muted-foreground">
              <Spinner label="Searching" />
            </div>
          ) : search.isError ? (
            <p className="text-sm text-danger" role="alert">
              {errorMessage(search.error)}
            </p>
          ) : search.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages match “{debounced.trim()}”.</p>
          ) : (
            <ul
              className="flex max-h-[50dvh] flex-col divide-y overflow-y-auto rounded-md border"
              aria-label="Search results"
            >
              {search.data.map((result) => (
                <li key={result.messageId}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-1 px-3 py-2.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    onClick={() => {
                      close(false)
                      void navigate(searchResultPath(workspaceId, result))
                    }}
                  >
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
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  )
}
