import { existsSync } from 'node:fs'

import { defineConfig } from 'prisma/config'

// Prisma 7 does not load .env itself. Use Node's built-in loader (same as src/config/env.ts);
// variables already set in the environment take precedence.
if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Development only — the seed script refuses to run when NODE_ENV=production.
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Read directly (not via `env()`) so `prisma generate` / `validate` work without a
    // database configured; commands that need a connection fail with a clear error.
    url: process.env.DATABASE_URL ?? '',
  },
})
