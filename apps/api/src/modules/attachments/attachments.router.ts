import { idSchema, isImageMime } from '@syncspace/shared'
import { type Response, Router } from 'express'

import { env } from '@/config/env'
import { createUploadRateLimiter } from '@/middleware/rate-limit'
import { requireAuth } from '@/middleware/require-auth'
import { AppError } from '@/lib/errors'
import { ensureVisible } from '@/lib/permissions'
import { getPrisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { contentDisposition } from '@/lib/storage'
import { loadMessage } from '@/modules/chat/destinations'
import { removeMessageAttachment } from '@/modules/chat/messages.service'
import { loadTaskById } from '@/modules/tasks/access'
import { removeTaskAttachment } from '@/modules/tasks/tasks.service'

import { requireStorage } from './attachments.service'

/** One limiter for every upload route (multipart requests only). */
export const uploadRateLimit = createUploadRateLimiter({ enabled: env.NODE_ENV !== 'test' })

/**
 * Inline display is limited to images and PDFs; everything else downloads.
 * Even inline, the response is sandboxed (no scripts, no same-origin access).
 */
function dispositionFor(mimeType: string, download: boolean): 'inline' | 'attachment' {
  if (download) return 'attachment'
  return isImageMime(mimeType) || mimeType === 'application/pdf' ? 'inline' : 'attachment'
}

function setFileHeaders(res: Response) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  )
  // The web app (another origin) displays images in <img>: allow same-site embedding,
  // or cross-site when web and API live on different sites (SameSite=None cookies).
  res.setHeader(
    'Cross-Origin-Resource-Policy',
    env.COOKIE_SAME_SITE === 'none' ? 'cross-origin' : 'same-site',
  )
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.setHeader('Referrer-Policy', 'no-referrer')
}

async function loadAttachment(id: string) {
  const attachment = await getPrisma().attachment.findUnique({
    where: { id },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      size: true,
      storageKey: true,
      messageId: true,
      taskId: true,
      message: { select: { deletedAt: true } },
    },
  })
  ensureVisible(attachment !== null, 'File not found')
  if (!attachment) throw new Error('unreachable')
  return attachment
}

/**
 * Access mirrors the owner: a message's files are visible to whoever can read
 * that message (channel/DM membership), a task's files to members of its
 * workspace. Anything else is a 404, exactly like the owner itself.
 */
async function authorizeRead(
  userId: string,
  attachment: Awaited<ReturnType<typeof loadAttachment>>,
) {
  if (attachment.messageId) {
    await loadMessage(userId, attachment.messageId)
    ensureVisible(attachment.message?.deletedAt === null, 'File not found')
  } else if (attachment.taskId) {
    await loadTaskById(userId, attachment.taskId)
  } else {
    ensureVisible(false, 'File not found')
  }
}

export const attachmentsRouter = Router()
attachmentsRouter.use(requireAuth)

/**
 * `GET /attachments/:id/content[?download=1]`
 * S3: 302 to a short-lived signed URL (the bucket is private).
 * Local disk (development): streamed by the API.
 */
attachmentsRouter.get('/:attachmentId/content', async (req, res) => {
  const userId = req.auth?.userId ?? ''
  const attachment = await loadAttachment(idSchema.parse(req.params.attachmentId))
  await authorizeRead(userId, attachment)
  if (!attachment.storageKey) throw new AppError('NOT_FOUND', 'File not found')

  const disposition = dispositionFor(attachment.mimeType, req.query.download === '1')
  let target: Awaited<ReturnType<ReturnType<typeof requireStorage>['access']>>
  try {
    target = await requireStorage().access(attachment.storageKey, {
      fileName: attachment.fileName,
      contentType: attachment.mimeType,
      disposition,
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    logger.warn({ err: error, attachmentId: attachment.id }, 'Stored file is unavailable')
    throw new AppError('STORAGE_UNAVAILABLE', 'This file is temporarily unavailable.')
  }

  setFileHeaders(res)
  if ('redirect' in target) {
    // Signed URLs are credentials: short-lived, never cached by intermediaries, never logged.
    res.setHeader('Cache-Control', 'no-store')
    res.redirect(302, target.redirect)
    return
  }
  res.setHeader('Content-Type', attachment.mimeType)
  res.setHeader('Content-Length', String(attachment.size))
  res.setHeader('Content-Disposition', contentDisposition(disposition, attachment.fileName))
  target.stream.on('error', (error) => {
    logger.warn({ err: error, attachmentId: attachment.id }, 'Streaming a file failed')
    res.destroy(error)
  })
  target.stream.pipe(res)
})

/** Removes one file: message files by their author, task files by anyone who can edit the task. */
attachmentsRouter.delete('/:attachmentId', async (req, res) => {
  const userId = req.auth?.userId ?? ''
  const attachment = await loadAttachment(idSchema.parse(req.params.attachmentId))
  if (attachment.messageId) {
    await authorizeRead(userId, attachment)
    const message = await removeMessageAttachment(userId, {
      ...attachment,
      messageId: attachment.messageId,
    })
    res.json({ message })
    return
  }
  if (attachment.taskId) {
    const task = await removeTaskAttachment(userId, { ...attachment, taskId: attachment.taskId })
    res.json({ task })
    return
  }
  ensureVisible(false, 'File not found')
})
