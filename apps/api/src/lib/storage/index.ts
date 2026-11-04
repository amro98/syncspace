import { env } from '@/config/env'

import { localStorage } from './local'
import { s3Storage } from './s3'
import type { ObjectStorage } from './types'

export * from './types'

let instance: ObjectStorage | null | undefined

/**
 * The configured storage, or null when uploads are disabled
 * (STORAGE_DRIVER=disabled). Production refuses to boot with the local driver
 * or an incomplete S3 configuration (config/env.ts), so a misconfigured
 * provider never shows up as a half-working upload.
 */
export function getStorage(): ObjectStorage | null {
  if (instance !== undefined) return instance
  const config = env.storage
  instance =
    config.driver === 'disabled'
      ? null
      : config.driver === 's3'
        ? s3Storage(config.s3)
        : localStorage(config.localDir)
  return instance
}

/** Tests swap in an in-memory adapter (or null to simulate disabled uploads). */
export function setStorage(storage: ObjectStorage | null | undefined): void {
  instance = storage
}
