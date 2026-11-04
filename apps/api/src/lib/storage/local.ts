import { createReadStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { assertStorageKey, type ObjectStorage } from './types'

/**
 * DEVELOPMENT storage: files on the local disk, streamed by the API after its
 * access check. Refused in production (see config/env.ts): hosts such as
 * Render have ephemeral disks, so uploads would vanish on every deploy.
 */
export function localStorage(rootDir: string): ObjectStorage {
  const root = path.resolve(rootDir)
  const fileFor = (key: string) => {
    assertStorageKey(key)
    const file = path.resolve(root, key)
    // Defence in depth: keys are generated, but never let one escape the root.
    if (!file.startsWith(root + path.sep)) throw new Error('Storage key escapes the storage root')
    return file
  }

  return {
    driver: 'local',
    async put(key, body) {
      const file = fileFor(key)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, body, { flag: 'wx' })
    },
    async delete(key) {
      await rm(fileFor(key), { force: true })
    },
    async access(key) {
      const file = fileFor(key)
      await stat(file)
      return { stream: createReadStream(file) }
    },
    async check() {
      await mkdir(root, { recursive: true })
    },
  }
}
