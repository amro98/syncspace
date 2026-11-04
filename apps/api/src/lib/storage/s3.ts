import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { assertStorageKey, contentDisposition, type ObjectStorage } from './types'

export interface S3Config {
  bucket: string
  region: string
  endpoint: string | undefined
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
  /** Lifetime of signed download URLs, in seconds. */
  urlTtlSeconds: number
}

/**
 * PRODUCTION storage for any S3-compatible provider (Cloudflare R2, AWS S3,
 * Backblaze B2, MinIO). The bucket stays PRIVATE: downloads are short-lived
 * signed URLs, issued only after the API has checked access to the owning
 * message or task.
 */
export function s3Storage(config: S3Config): ObjectStorage {
  const client = new S3Client({
    region: config.region,
    ...(config.endpoint && { endpoint: config.endpoint }),
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })

  return {
    driver: 's3',
    async put(key, body, contentType) {
      assertStorageKey(key)
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ContentLength: body.length,
        }),
      )
    },
    async delete(key) {
      assertStorageKey(key)
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
    },
    async access(key, options) {
      assertStorageKey(key)
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ResponseContentType: options.contentType,
          ResponseContentDisposition: contentDisposition(options.disposition, options.fileName),
          ResponseCacheControl: 'private, max-age=300',
        }),
        { expiresIn: config.urlTtlSeconds },
      )
      return { redirect: url }
    },
    async check() {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }))
    },
  }
}
