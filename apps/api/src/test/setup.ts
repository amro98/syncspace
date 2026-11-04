import { afterAll, beforeEach, inject } from 'vitest'

// Runs before each test file is imported, so `config/env.ts` sees the test database.
process.env.DATABASE_URL = inject('databaseUrl')

// Tests never touch the disk or the network for uploads: each test gets fresh in-memory storage.
beforeEach(async () => {
  const [{ setStorage }, { memoryStorage }] = await Promise.all([
    import('@/lib/storage'),
    import('@/lib/storage/memory'),
  ])
  setStorage(memoryStorage())
})

afterAll(async () => {
  const { disconnectPrisma } = await import('@/lib/prisma')
  await disconnectPrisma()
})
