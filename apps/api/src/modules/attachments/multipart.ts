import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES, formatFileSize } from '@syncspace/shared'
import busboy from 'busboy'
import type { Request, RequestHandler } from 'express'

import { AppError, badRequest } from '@/lib/errors'

import { type IncomingFile, safeFileName } from './files'

const isMultipart = (req: Request) => req.is('multipart/form-data') === 'multipart/form-data'

/**
 * Parses multipart/form-data: text fields become `req.body`, files (field
 * `files`) become `req.files`. Limits are enforced while streaming — an
 * oversized file is rejected before it is fully read. Non-multipart requests
 * pass through untouched (JSON bodies keep working on the same route).
 */
export const parseMultipart: RequestHandler = (req, _res, next) => {
  if (!isMultipart(req)) {
    next()
    return
  }
  let parser: busboy.Busboy
  try {
    parser = busboy({
      headers: req.headers,
      limits: {
        fileSize: ATTACHMENT_MAX_BYTES,
        files: ATTACHMENT_MAX_FILES,
        fields: 20,
        fieldSize: 64 * 1024,
        parts: ATTACHMENT_MAX_FILES + 20,
      },
    })
  } catch {
    next(badRequest('Malformed upload'))
    return
  }

  const fields: Record<string, string> = {}
  const files: IncomingFile[] = []
  let failed: Error | null = null
  const fail = (error: Error) => {
    if (failed) return
    failed = error
    req.unpipe(parser)
    req.resume()
    next(error)
  }

  parser.on('field', (name, value) => {
    fields[name] = value
  })
  parser.on('file', (name, stream, info) => {
    if (name !== 'files') {
      stream.resume()
      return
    }
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('limit', () => {
      fail(
        new AppError(
          'FILE_TOO_LARGE',
          `“${safeFileName(info.filename ?? 'file')}” is larger than ${formatFileSize(ATTACHMENT_MAX_BYTES)}.`,
        ),
      )
    })
    stream.on('end', () => {
      files.push({
        fileName: info.filename ?? 'file',
        declaredType: info.mimeType,
        buffer: Buffer.concat(chunks),
      })
    })
  })
  parser.on('filesLimit', () => {
    fail(
      new AppError('BAD_REQUEST', `Attach at most ${String(ATTACHMENT_MAX_FILES)} files at once.`),
    )
  })
  parser.on('error', () => {
    fail(badRequest('Malformed upload'))
  })
  parser.on('close', () => {
    if (failed) return
    req.body = fields
    req.files = files
    next()
  })
  req.pipe(parser)
}
