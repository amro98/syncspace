import { ATTACHMENT_ACCEPT, type Destination } from '@syncspace/shared'
import { Paperclip, SendHorizontal } from 'lucide-react'
import { type ClipboardEvent, type DragEvent, useEffect, useMemo, useRef, useState } from 'react'

import { PendingFiles } from '@/features/attachments/components/PendingFiles'
import { mergeFiles, namePastedFile } from '@/features/attachments/files'
import { cn } from '@/lib/utils'

import { useDraft } from '../hooks'
import { createTypingEmitter } from '../realtime'

/**
 * Multiline composer. Enter sends, Shift+Enter inserts a newline. The text
 * draft is kept per destination (switching away and back keeps it). Files can
 * be attached with the button, dropped onto the composer or pasted; they are
 * checked locally first (type, size, count) and uploaded with the message.
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
  onSend: (content: string, files: File[]) => void
  autoFocus?: boolean
}) {
  const [draft, setDraft] = useDraft(draftKey)
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return
    const result = mergeFiles(files, incoming)
    setFiles(result.files)
    setFileError(result.errors[0] ?? null)
  }

  const canSend = draft.trim().length > 0 || files.length > 0
  const send = () => {
    if (!canSend) return
    typing.stop()
    onSend(draft.trim(), files)
    setDraft('')
    setFiles([])
    setFileError(null)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    addFiles([...event.dataTransfer.files])
  }
  const onPaste = (event: ClipboardEvent) => {
    const pasted = [...event.clipboardData.files]
    if (pasted.length === 0) return
    event.preventDefault()
    addFiles(pasted.map(namePastedFile))
  }

  return (
    <form
      className="px-4 pt-1 pb-4"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <div
        className={cn(
          'flex flex-col gap-2 rounded-lg border border-input bg-background px-3 py-2 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
          dragging && 'border-primary ring-[3px] ring-primary/30',
        )}
      >
        <PendingFiles
          files={files}
          onRemove={(index) => {
            setFiles((current) => current.filter((_, i) => i !== index))
            setFileError(null)
          }}
        />
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              addFiles([...(event.target.files ?? [])])
              event.target.value = ''
            }}
          />
          <button
            type="button"
            aria-label="Attach files"
            title="Attach files (or drop / paste them)"
            onClick={() => fileInputRef.current?.click()}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Paperclip className="size-4" aria-hidden />
          </button>
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
            onPaste={onPaste}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                send()
              }
            }}
            className="max-h-[200px] min-h-6 flex-1 resize-none self-center bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!canSend}
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              canSend
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'text-muted-foreground',
            )}
          >
            <SendHorizontal className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      {fileError && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {fileError}
        </p>
      )}
      <p className="mt-1 hidden text-[11px] text-muted-foreground sm:block">
        <kbd className="font-sans">Enter</kbd> to send ·{' '}
        <kbd className="font-sans">Shift+Enter</kbd> for a new line · drop or paste files to attach
      </p>
    </form>
  )
}
