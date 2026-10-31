import { afterAll, inject } from 'vitest'

// Runs before each test file is imported, so `config/env.ts` sees the test database.
process.env.DATABASE_URL = inject('databaseUrl')

afterAll(async () => {
  const { disconnectPrisma } = await import('@/lib/prisma')
  await disconnectPrisma()
})
