import { Readable } from 'node:stream'

import { assertStorageKey, type ObjectStorage } from './types'

export interface MemoryStorage extends ObjectStorage {
  readonly objects: Map<string, { body: Buffer; contentType: string }>
  /** Makes the next `times` calls of `operation` fail, to test cleanup paths. */
  failNext(operation: 'put' | 'delete', times?: number): void
}

/** In-memory storage for tests: no disk, no network, failure injection. */
export function memoryStorage(): MemoryStorage {
  const objects = new Map<string, { body: Buffer; contentType: string }>()
  const failures = { put: 0, delete: 0 }
  const maybeFail = (operation: 'put' | 'delete') => {
    if (failures[operation] > 0) {
      failures[operation] -= 1
      throw new Error(`Simulated storage ${operation} failure`)
    }
  }
  return {
    driver: 'memory',
    objects,
    failNext(operation, times = 1) {
      failures[operation] = times
    },
    put(key, body, contentType) {
      assertStorageKey(key)
      maybeFail('put')
      objects.set(key, { body, contentType })
      return Promise.resolve()
    },
    delete(key) {
      maybeFail('delete')
      objects.delete(key)
      return Promise.resolve()
    },
    access(key) {
      const object = objects.get(key)
      if (!object) return Promise.reject(new Error('Object not found'))
      return Promise.resolve({ stream: Readable.from(object.body) })
    },
    check() {
      return Promise.resolve()
    },
  }
}
