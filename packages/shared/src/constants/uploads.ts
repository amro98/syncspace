/**
 * Upload rules shared by the API (authoritative validation) and the web app
 * (early feedback and the file picker's `accept` list).
 *
 * The server never trusts the browser's MIME type or the file name: it
 * identifies the content from its bytes and only then accepts the file. The
 * stored MIME type always comes from this table.
 */

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const ATTACHMENT_MAX_FILES = 10

export type AttachmentKind = 'image' | 'document'

export interface AllowedFileType {
  mimeType: string
  extensions: readonly string[]
  kind: AttachmentKind
  label: string
}

export const ALLOWED_FILE_TYPES = [
  { mimeType: 'image/jpeg', extensions: ['jpg', 'jpeg'], kind: 'image', label: 'JPEG image' },
  { mimeType: 'image/png', extensions: ['png'], kind: 'image', label: 'PNG image' },
  { mimeType: 'image/webp', extensions: ['webp'], kind: 'image', label: 'WebP image' },
  { mimeType: 'image/gif', extensions: ['gif'], kind: 'image', label: 'GIF image' },
  { mimeType: 'application/pdf', extensions: ['pdf'], kind: 'document', label: 'PDF' },
  { mimeType: 'text/plain', extensions: ['txt'], kind: 'document', label: 'Text file' },
  { mimeType: 'text/csv', extensions: ['csv'], kind: 'document', label: 'CSV' },
  {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
    kind: 'document',
    label: 'Word document',
  },
] as const satisfies readonly AllowedFileType[]

/** For `<input type="file" accept>`. */
export const ATTACHMENT_ACCEPT = ALLOWED_FILE_TYPES.flatMap((type) => [
  type.mimeType,
  ...type.extensions.map((ext) => `.${ext}`),
]).join(',')

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** The allowed type a file name claims to be (by extension), if any. */
export function fileTypeForName(name: string): AllowedFileType | undefined {
  const ext = fileExtension(name)
  return ALLOWED_FILE_TYPES.find((type) => (type.extensions as readonly string[]).includes(ext))
}

export function fileTypeForMime(mimeType: string): AllowedFileType | undefined {
  return ALLOWED_FILE_TYPES.find((type) => type.mimeType === mimeType)
}

export function isImageMime(mimeType: string): boolean {
  return fileTypeForMime(mimeType)?.kind === 'image'
}

/** Human-readable size: "512 B", "48 KB", "3.2 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
}
