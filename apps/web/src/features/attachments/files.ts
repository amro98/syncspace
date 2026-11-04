import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  fileTypeForName,
  formatFileSize,
} from '@syncspace/shared'

/**
 * Early, friendly checks before uploading (the API re-validates everything,
 * including the file's actual content).
 */
export function checkFile(file: File): string | null {
  if (!fileTypeForName(file.name)) {
    return `“${file.name}” is not a supported file type. Use images (JPG, PNG, WebP, GIF), PDF, TXT, CSV or DOCX.`
  }
  if (file.size === 0) return `“${file.name}” is empty.`
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return `“${file.name}” is larger than ${formatFileSize(ATTACHMENT_MAX_BYTES)}.`
  }
  return null
}

/** Adds files to a selection, enforcing the per-message limit. */
export function mergeFiles(current: File[], incoming: File[]): { files: File[]; errors: string[] } {
  const errors: string[] = []
  const files = [...current]
  for (const file of incoming) {
    const error = checkFile(file)
    if (error) {
      errors.push(error)
    } else if (files.length >= ATTACHMENT_MAX_FILES) {
      errors.push(`Attach at most ${String(ATTACHMENT_MAX_FILES)} files at once.`)
      break
    } else {
      files.push(file)
    }
  }
  return { files, errors }
}

/** Clipboard images often have no name: give them one with the right extension. */
export function namePastedFile(file: File, index: number): File {
  if (file.name && file.name !== 'image.png') return file
  const extension = file.type.split('/')[1] ?? 'png'
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return new File([file], `pasted-${stamp}${index > 0 ? `-${String(index)}` : ''}.${extension}`, {
    type: file.type,
  })
}

export function toFormData(fields: Record<string, string | undefined>, files: File[]): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, value)
  }
  for (const file of files) form.append('files', file, file.name)
  return form
}
