import { ATTACHMENT_ACCEPT, type Task } from '@syncspace/shared'
import { Upload } from 'lucide-react'
import { type DragEvent, useRef, useState } from 'react'

import { AttachmentList } from '@/features/attachments/components/AttachmentList'
import { PendingFiles } from '@/features/attachments/components/PendingFiles'
import { mergeFiles } from '@/features/attachments/files'
import { errorMessage } from '@/features/auth/messages'
import { cn } from '@/lib/utils'

import { useAddTaskAttachments, useRemoveTaskAttachment } from '../hooks'

/** Task files: list (preview/open/download), upload by picker or drop, remove. */
export function TaskAttachments({
  workspaceId,
  task,
  editable,
}: {
  workspaceId: string
  task: Task
  editable: boolean
}) {
  const add = useAddTaskAttachments(workspaceId)
  const remove = useRemoveTaskAttachment(workspaceId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<File[]>([])

  const upload = (incoming: File[]) => {
    if (incoming.length === 0) return
    const { files, errors } = mergeFiles([], incoming)
    setLocalError(errors[0] ?? null)
    if (files.length === 0) return
    setUploading(files)
    add.mutate(
      { taskId: task.id, files },
      {
        onSettled: () => {
          setUploading([])
        },
      },
    )
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (editable) upload([...event.dataTransfer.files])
  }

  const error =
    localError ??
    (add.error ? errorMessage(add.error) : remove.error ? errorMessage(remove.error) : null)

  return (
    <section className="flex flex-col gap-2" aria-labelledby="task-attachments-heading">
      <h3 id="task-attachments-heading" className="text-xs font-medium text-muted-foreground">
        Attachments {task.attachments.length > 0 && `(${String(task.attachments.length)})`}
      </h3>
      {task.attachments.length === 0 && !editable && (
        <p className="text-sm text-muted-foreground">No attachments.</p>
      )}
      <AttachmentList
        attachments={task.attachments}
        onRemove={
          editable
            ? (attachment) => {
                remove.mutate(attachment.id)
              }
            : undefined
        }
      />
      <PendingFiles files={uploading} uploading />
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {editable && (
        <div
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault()
              setDragging(true)
            }
          }}
          onDragLeave={() => {
            setDragging(false)
          }}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground',
            dragging && 'border-primary bg-primary/5 text-foreground',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              upload([...(event.target.files ?? [])])
              event.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={add.isPending}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          >
            <Upload className="size-4" aria-hidden />
            {add.isPending ? 'Uploading…' : 'Add files'}
          </button>
          <span>or drop them here · images, PDF, TXT, CSV, DOCX · up to 10 MB each</span>
        </div>
      )}
    </section>
  )
}
