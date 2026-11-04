import { type Attachment, fileTypeForMime, formatFileSize, isImageMime } from '@syncspace/shared'
import {
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  ImageOff,
  Paperclip,
  X,
} from 'lucide-react'
import { memo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { apiUrl } from '@/lib/api-client'
import { cn } from '@/lib/utils'

const linkClass =
  'inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-primary hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === 'text/csv') return <FileSpreadsheet className="size-5" aria-hidden />
  if (mimeType === 'application/pdf' || mimeType.startsWith('text/') || mimeType.includes('word')) {
    return <FileText className="size-5" aria-hidden />
  }
  return <Paperclip className="size-5" aria-hidden />
}

function RemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Remove ${name}`}
      title={`Remove ${name}`}
      onClick={onRemove}
      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-danger focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <X className="size-3.5" aria-hidden />
    </button>
  )
}

/**
 * Image thumbnail in a FIXED-size box: the height is known before the image
 * loads, so a virtualized timeline never jumps when thumbnails arrive.
 */
function ImageThumb({
  attachment,
  onOpen,
  onRemove,
}: {
  attachment: Attachment
  onOpen: () => void
  onRemove?: (() => void) | undefined
}) {
  const [failed, setFailed] = useState(false)
  return (
    <li className="group/thumb relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open image ${attachment.fileName}`}
        className="flex h-40 w-56 max-w-full items-center justify-center overflow-hidden rounded-lg border bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {failed ? (
          <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
            <ImageOff className="size-5" aria-hidden />
            Image unavailable
          </span>
        ) : (
          <img
            src={apiUrl(attachment.url)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
            onError={() => {
              setFailed(true)
            }}
          />
        )}
      </button>
      {onRemove && (
        <span className="absolute top-1 right-1 rounded-md bg-background/90 opacity-0 shadow-sm group-hover/thumb:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
          <RemoveButton name={attachment.fileName} onRemove={onRemove} />
        </span>
      )}
    </li>
  )
}

function FileCard({
  attachment,
  onRemove,
}: {
  attachment: Attachment
  onRemove?: (() => void) | undefined
}) {
  const label = fileTypeForMime(attachment.mimeType)?.label ?? 'File'
  const url = apiUrl(attachment.url)
  return (
    <li className="flex w-full max-w-sm items-center gap-3 rounded-lg border bg-card p-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <FileIcon mimeType={attachment.mimeType} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={attachment.fileName}>
          {attachment.fileName}
        </span>
        <span className="block text-xs text-muted-foreground">
          {label} · {formatFileSize(attachment.size)}
        </span>
      </span>
      <span className="flex shrink-0 items-center">
        {attachment.mimeType === 'application/pdf' && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${attachment.fileName}`}
            className={linkClass}
          >
            <ExternalLink className="size-3.5" aria-hidden />
            <span className="max-sm:sr-only">Open</span>
          </a>
        )}
        <a
          href={`${url}?download=1`}
          download={attachment.fileName}
          aria-label={`Download ${attachment.fileName}`}
          className={linkClass}
        >
          <Download className="size-3.5" aria-hidden />
          <span className="max-sm:sr-only">Download</span>
        </a>
        {onRemove && <RemoveButton name={attachment.fileName} onRemove={onRemove} />}
      </span>
    </li>
  )
}

/**
 * Attachments of a message or task: image thumbnails (click for a larger
 * preview) and file cards (open / download). Files are fetched from the
 * access-checked API endpoint, never from a public bucket URL.
 */
function AttachmentListImpl({
  attachments,
  onRemove,
  className,
}: {
  attachments: Attachment[]
  /** When set, each attachment offers a remove action. */
  onRemove?: ((attachment: Attachment) => void) | undefined
  className?: string
}) {
  const [preview, setPreview] = useState<Attachment | null>(null)
  const [removing, setRemoving] = useState<Attachment | null>(null)
  if (attachments.length === 0) return null
  const images = attachments.filter((a) => isImageMime(a.mimeType))
  const files = attachments.filter((a) => !isImageMime(a.mimeType))

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Images">
          {images.map((attachment) => (
            <ImageThumb
              key={attachment.id}
              attachment={attachment}
              onOpen={() => {
                setPreview(attachment)
              }}
              onRemove={
                onRemove &&
                (() => {
                  setRemoving(attachment)
                })
              }
            />
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Files">
          {files.map((attachment) => (
            <FileCard
              key={attachment.id}
              attachment={attachment}
              onRemove={
                onRemove &&
                (() => {
                  setRemoving(attachment)
                })
              }
            />
          ))}
        </ul>
      )}
      {onRemove && (
        <Dialog
          open={removing !== null}
          onOpenChange={(open) => {
            if (!open) setRemoving(null)
          }}
          title={`Remove “${removing?.fileName ?? ''}”?`}
          description="The file is deleted for everyone. This cannot be undone."
        >
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRemoving(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removing) onRemove(removing)
                setRemoving(null)
              }}
            >
              Remove file
            </Button>
          </div>
        </Dialog>
      )}
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
        title={preview?.fileName ?? 'Image'}
        className="sm:max-w-4xl"
      >
        {preview && (
          <div className="flex flex-col gap-3">
            <img
              src={apiUrl(preview.url)}
              alt={preview.fileName}
              className="max-h-[70dvh] w-full rounded-md bg-muted object-contain"
            />
            <div className="flex justify-end gap-1">
              <a
                href={apiUrl(preview.url)}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                <ExternalLink className="size-3.5" aria-hidden />
                Open original
              </a>
              <a
                href={`${apiUrl(preview.url)}?download=1`}
                download={preview.fileName}
                className={linkClass}
              >
                <Download className="size-3.5" aria-hidden />
                Download
              </a>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}

export const AttachmentList = memo(AttachmentListImpl)
