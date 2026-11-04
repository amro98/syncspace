import { randomUUID } from 'node:crypto'

import {
  ALLOWED_FILE_TYPES,
  ATTACHMENT_MAX_BYTES,
  type AllowedFileType,
  fileExtension,
  formatFileSize,
} from '@syncspace/shared'

import { AppError } from '@/lib/errors'

/**
 * File validation. A file is accepted only when ALL of these agree:
 *  - its extension is in the allow-list;
 *  - its bytes match that type (magic numbers; text must be valid UTF-8);
 *  - it is non-empty and at most ATTACHMENT_MAX_BYTES.
 * The browser's MIME type is ignored; the stored type comes from the table.
 */

export interface IncomingFile {
  fileName: string
  /** As declared by the client. Informational only. */
  declaredType: string
  buffer: Buffer
}

export interface ValidatedFile {
  fileName: string
  mimeType: string
  extension: string
  buffer: Buffer
}

const startsWith = (buffer: Buffer, bytes: readonly number[], offset = 0) =>
  bytes.every((byte, index) => buffer[offset + index] === byte)

const ascii = (buffer: Buffer, start: number, end: number) =>
  buffer.subarray(start, end).toString('latin1')

function isUtf8Text(buffer: Buffer): boolean {
  // Binary content (executables, archives) contains NUL bytes; text never should.
  if (buffer.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return true
  } catch {
    return false
  }
}

const SNIFFERS: Record<string, (buffer: Buffer) => boolean> = {
  'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/gif': (b) => ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a',
  'image/webp': (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP',
  'application/pdf': (b) => ascii(b, 0, 5) === '%PDF-',
  'text/plain': isUtf8Text,
  'text/csv': isUtf8Text,
  // DOCX is a ZIP container holding word/ parts.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) =>
    startsWith(b, [0x50, 0x4b, 0x03, 0x04]) && b.includes('word/'),
}

/**
 * A safe display name: no directories, no control or bidi-override
 * characters, NFC-normalised, bounded length. Only ever used as metadata
 * (Content-Disposition, UI), never as a storage key.
 */
export function safeFileName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? ''
  const cleaned = base
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
  if (!cleaned) return 'file'
  if (cleaned.length <= 180) return cleaned
  const ext = fileExtension(cleaned)
  return ext ? `${cleaned.slice(0, 170)}….${ext}` : cleaned.slice(0, 180)
}

export function validateFile(file: IncomingFile): ValidatedFile {
  const fileName = safeFileName(file.fileName)
  if (file.buffer.length === 0) {
    throw new AppError('FILE_TYPE_NOT_ALLOWED', `“${fileName}” is empty.`)
  }
  if (file.buffer.length > ATTACHMENT_MAX_BYTES) {
    throw new AppError(
      'FILE_TOO_LARGE',
      `“${fileName}” is larger than ${formatFileSize(ATTACHMENT_MAX_BYTES)}.`,
    )
  }
  const extension = fileExtension(fileName)
  const type: AllowedFileType | undefined = ALLOWED_FILE_TYPES.find((candidate) =>
    (candidate.extensions as readonly string[]).includes(extension),
  )
  if (!type) {
    throw new AppError(
      'FILE_TYPE_NOT_ALLOWED',
      `“${fileName}” is not a supported file type. Use images (JPG, PNG, WebP, GIF), PDF, TXT, CSV or DOCX.`,
    )
  }
  const sniff = SNIFFERS[type.mimeType]
  if (!sniff?.(file.buffer)) {
    throw new AppError(
      'FILE_TYPE_NOT_ALLOWED',
      `“${fileName}” does not look like a valid ${type.label}.`,
    )
  }
  return {
    fileName,
    mimeType: type.mimeType,
    extension: type.extensions[0] ?? extension,
    buffer: file.buffer,
  }
}

/** A fresh, opaque storage key. Nothing user-controlled ends up in it. */
export function newStorageKey(workspaceId: string, extension: string, now = new Date()): string {
  const year = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${workspaceId}/${year}/${month}/${randomUUID()}.${extension}`
}
