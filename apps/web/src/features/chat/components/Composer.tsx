import type { Destination } from '@syncspace/shared'
import { SendHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'

import { cn } from '@/lib/utils'

import { useDraft } from '../hooks'
import { createTypingEmitter } from '../realtime'

/**
 * Multiline composer. Enter sends, Shift+Enter inserts a newline. The draft is
 * kept per destination (switching away and back keeps it). Typing events are
 * throttled. Attachments will plug into the toolbar slot (see docs/CHAT.md).
 */
export function Composer({
  destination,
  draftKey,
  placeholder,
  disabledReason,
  onSend,
  autoFocus = false,
}: {
  destination: Destination
  draftKey: string
  placeholder: string
  /** When set, the composer is replaced by this explanation (archived, no access…). */
  disabledReason?: string | null
  onSend: (content: string) => void
  autoFocus?: boolean
}) {
  const [draft, setDraft] = useDraft(draftKey)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typing = useMemo(() => createTypingEmitter(destination), [destination])

  useEffect(
    () => () => {
      typing.stop()
    },
    [typing],
  )

  // Auto-grow up to ~8 lines.
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${String(Math.min(element.scrollHeight, 200))}px`
  }, [draft])

  if (disabledReason) {
    return (
      <div className="border-t px-4 py-3 text-center text-sm text-muted-foreground" role="note">
        {disabledReason}
      </div>
    )
  }

  const send = () => {
    const content = draft.trim()
    if (!content) return
    typing.stop()
    setDraft('')
    onSend(content)
  }

  return (
    <form
      className="px-4 pt-1 pb-4"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <div className="flex items-end gap-2 rounded-lg border border-input bg-background px-3 py-2 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <label htmlFor={`composer-${draftKey}`} className="sr-only">
          {placeholder}
        </label>
        <textarea
          id={`composer-${draftKey}`}
          ref={textareaRef}
          rows={1}
          autoFocus={autoFocus}
          value={draft}
          placeholder={placeholder}
          maxLength={10_000}
          onChange={(event) => {
            setDraft(event.target.value)
            if (event.target.value.trim()) typing.typed()
            else typing.stop()
          }}
          onBlur={() => {
            typing.stop()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send()
            }
          }}
          className="max-h-[200px] min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={!draft.trim()}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
            draft.trim()
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'text-muted-foreground',
          )}
        >
          <SendHorizontal className="size-4" aria-hidden />
        </button>
      </div>
      <p className="mt-1 hidden text-[11px] text-muted-foreground sm:block">
        <kbd className="font-sans">Enter</kbd> to send ·{' '}
        <kbd className="font-sans">Shift+Enter</kbd> for a new line
      </p>
    </form>
  )
}
