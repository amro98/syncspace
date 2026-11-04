import type { HealthResponse, ReadinessResponse } from '@syncspace/shared'

import { logger } from '@/lib/logger'
import { getPrisma, isDatabaseConfigured } from '@/lib/prisma'
import { getStorage } from '@/lib/storage'

const DATABASE_CHECK_TIMEOUT_MS = 2_000

export function getLiveness(): HealthResponse {
  return {
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }
}

async function checkDatabase(): Promise<ReadinessResponse['checks']['database']> {
  if (!isDatabaseConfigured()) return 'not_configured'

  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      getPrisma().$queryRaw`SELECT 1`,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Database check timed out'))
        }, DATABASE_CHECK_TIMEOUT_MS)
      }),
    ])
    return 'ok'
  } catch (error) {
    logger.warn({ err: error }, 'Database readiness check failed')
    return 'error'
  } finally {
    clearTimeout(timer)
  }
}

async function checkStorage(): Promise<ReadinessResponse['checks']['storage']> {
  const storage = getStorage()
  if (!storage) return 'disabled'
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      storage.check(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Storage check timed out'))
        }, DATABASE_CHECK_TIMEOUT_MS)
      }),
    ])
    return 'ok'
  } catch (error) {
    logger.warn({ err: error }, 'Storage readiness check failed')
    return 'error'
  } finally {
    clearTimeout(timer)
  }
}

/** Ready = the database answers. Storage is reported but does not gate readiness. */
export async function getReadiness(): Promise<ReadinessResponse> {
  const [database, storage] = await Promise.all([checkDatabase(), checkStorage()])
  return {
    status: database === 'ok' ? 'ok' : 'unavailable',
    checks: { database, storage },
  }
}
