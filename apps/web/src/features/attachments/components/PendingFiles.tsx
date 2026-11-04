import { formatFileSize } from '@syncspace/shared'
import { FileText, Image as ImageIcon, Loader2, X } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Files chosen but not sent yet (composer), or being uploaded (a sending
 * message). Shows name, size and state; never the file's content.
 */
export function PendingFiles({
  files,
  uploading = false,
  onRemove,
  className,
}: {
  files: { name: string; size: number; type: string }[]
  uploading?: boolean
  onRemove?: ((index: number) => void) | undefined
  className?: string
}) {
  if (files.length === 0) return null
  return (
    <ul
      className={cn('flex flex-wrap gap-1.5', className)}
      aria-label={uploading ? 'Uploading files' : 'Files to send'}
    >
      {files.map((file, index) => {
        const Icon = file.type.startsWith('image/') ? ImageIcon : FileText
        return (
          <li
            key={`${file.name}-${String(index)}`}
            className="flex max-w-60 items-center gap-1.5 rounded-md border bg-muted/60 py-1 pr-1 pl-2 text-xs"
          >
            {uploading ? (
              <Loader2
                className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                aria-hidden
              />
            ) : (
              <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="min-w-0 truncate" title={file.name}>
              {file.name}
            </span>
            <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
            {uploading && <span className="sr-only">uploading</span>}
            {onRemove && (
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => {
                  onRemove(index)
                }}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <X className="size-3" aria-hidden />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
