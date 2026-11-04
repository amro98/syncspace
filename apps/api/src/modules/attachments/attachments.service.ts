import type { Attachment } from '@syncspace/shared'

import type { Prisma } from '@/generated/prisma/client'
import { AppError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { getStorage, type ObjectStorage } from '@/lib/storage'

import { type IncomingFile, newStorageKey, validateFile } from './files'

/**
 * Attachment lifecycle (see docs/UPLOADS.md):
 *
 *   validate every file → store objects → DB transaction (owner row + attachment rows)
 *                            │                    │
 *                            │ failure            │ failure
 *                            ▼                    ▼
 *                  delete objects stored so far   delete all stored objects
 *
 * The database requires every attachment to belong to exactly one message or
 * task (attachments_owner_xor_check), so there is no "pending upload" state:
 * files arrive in the same request that creates (or extends) their owner.
 */

export const attachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  size: true,
} satisfies Prisma.AttachmentSelect

export function toAttachmentDto(row: {
  id: string
  fileName: string
  mimeType: string
  size: number
}): Attachment {
  return { ...row, url: `/attachments/${row.id}/content` }
}

export interface StoredFile {
  key: string
  fileName: string
  mimeType: string
  size: number
}

export function requireStorage(): ObjectStorage {
  const storage = getStorage()
  if (!storage) {
    throw new AppError('STORAGE_UNAVAILABLE', 'File uploads are turned off on this server.')
  }
  return storage
}

/**
 * Validates ALL files first (nothing is stored if any is rejected), then
 * stores them. If storing fails midway, the objects already written are
 * deleted before the error is reported.
 */
export async function storeFiles(
  workspaceId: string,
  files: IncomingFile[],
): Promise<StoredFile[]> {
  if (files.length === 0) return []
  const storage = requireStorage()
  const validated = files.map(validateFile)
  const stored: StoredFile[] = []
  try {
    for (const file of validated) {
      const key = newStorageKey(workspaceId, file.extension)
      await storage.put(key, file.buffer, file.mimeType)
      stored.push({
        key,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.buffer.length,
      })
    }
  } catch (error) {
    logger.error({ err: error }, 'Storing an upload failed')
    await discardObjects(stored.map((file) => file.key))
    throw new AppError('STORAGE_UNAVAILABLE', 'Could not store the file. Please try again.')
  }
  return stored
}

/** Rows for `attachment.createMany` once the owner exists (inside its transaction). */
export function attachmentRows(
  stored: StoredFile[],
  owner: { messageId: string } | { taskId: string },
  workspaceId: string,
  uploadedById: string,
  driver: string,
) {
  return stored.map((file) => ({
    workspaceId,
    ...owner,
    uploadedById,
    fileName: file.fileName,
    mimeType: file.mimeType,
    size: file.size,
    // Provider-neutral locator; clients always go through /attachments/:id/content.
    url: `${driver}:${file.key}`,
    storageKey: file.key,
  }))
}

const DELETE_ATTEMPTS = 3

/**
 * Best-effort object deletion after the database no longer references the
 * keys. Retries briefly; a key that still cannot be deleted is logged at
 * error level (`orphanedStorageKey`) for manual or scheduled cleanup. It is
 * never served again: access always goes through a database row.
 */
export async function discardObjects(keys: (string | null)[]): Promise<void> {
  const storage = getStorage()
  if (!storage) return
  for (const key of keys) {
    if (!key) continue
    for (let attempt = 1; attempt <= DELETE_ATTEMPTS; attempt += 1) {
      try {
        await storage.delete(key)
        break
      } catch (error) {
        if (attempt === DELETE_ATTEMPTS) {
          logger.error({ err: error, orphanedStorageKey: key }, 'Could not delete a stored object')
        } else {
          await new Promise((resolve) => setTimeout(resolve, 100 * attempt))
        }
      }
    }
  }
}

/**
 * Runs `write` (a DB transaction creating the attachment rows). If it fails,
 * the already-stored objects are removed so no object is left without a row.
 */
export async function withStoredFiles<T>(
  stored: StoredFile[],
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write()
  } catch (error) {
    await discardObjects(stored.map((file) => file.key))
    throw error
  }
}
