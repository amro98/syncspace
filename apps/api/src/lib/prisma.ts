import { PrismaPg } from '@prisma/adapter-pg'

import { env } from '@/config/env'
import { PrismaClient } from '@/generated/prisma/client'

let client: PrismaClient | undefined

/**
 * Lazily-created Prisma client. Lazy so the API (and `/health`) can boot in
 * development before a database is configured; production requires
 * DATABASE_URL at startup (see config/env.ts).
 */
export function getPrisma(): PrismaClient {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured')
  }
  client ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log: ['warn', 'error'],
  })
  return client
}

export function isDatabaseConfigured(): boolean {
  return env.DATABASE_URL !== undefined
}

export async function disconnectPrisma(): Promise<void> {
  await client?.$disconnect()
  client = undefined
}
