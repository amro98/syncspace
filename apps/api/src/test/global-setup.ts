/**
 * Test database for the API suite.
 *
 * - TEST_DATABASE_URL set: use that PostgreSQL (it must already be migrated:
 *   `DATABASE_URL=<url> npm run db:deploy --workspace @syncspace/api`).
 * - Otherwise: start an in-memory PGlite (the PostgreSQL engine compiled to
 *   WebAssembly) behind the PostgreSQL wire protocol, apply every migration in
 *   prisma/migrations in order, and expose it on a random local port.
 *
 * Either way the tests talk to it through the normal `pg` driver and Prisma.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
    databaseKind: 'external' | 'pglite'
  }
}

const migrationsDir = fileURLToPath(new URL('../../prisma/migrations', import.meta.url))

function migrationFiles(): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => join(migrationsDir, name, 'migration.sql'))
}

export default async function setup(project: TestProject) {
  const external = process.env.TEST_DATABASE_URL
  if (external) {
    project.provide('databaseUrl', external)
    project.provide('databaseKind', 'external')
    return
  }

  const db = await PGlite.create()
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(file, 'utf8'))
  }

  // maxConnections defaults to 1; Prisma's pool opens several (queries are multiplexed).
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 32 })
  await server.start()
  const conn = server.getServerConn()
  project.provide('databaseUrl', `postgresql://postgres:postgres@${conn}/postgres?sslmode=disable`)
  project.provide('databaseKind', 'pglite')

  return async () => {
    await server.stop()
    await db.close()
  }
}
