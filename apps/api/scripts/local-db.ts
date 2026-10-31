/**
 * DEVELOPMENT-ONLY local PostgreSQL without installing PostgreSQL or Docker.
 *
 * Serves PGlite (the PostgreSQL engine compiled to WebAssembly) over the
 * normal wire protocol, with data persisted in apps/api/.pglite/:
 *
 *   npm run db:local --workspace @syncspace/api
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/postgres?sslmode=disable
 *
 * Then run `npm run db:deploy` / `npm run db:seed` and `npm run dev` as usual.
 * Prefer a real PostgreSQL server for anything beyond local development.
 */
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const port = Number(process.env.LOCAL_DB_PORT ?? 54329)
const dataDir = fileURLToPath(new URL('../.pglite', import.meta.url))

const db = await PGlite.create(dataDir)
// maxConnections defaults to 1; Prisma's pool opens several (queries are multiplexed).
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 32 })
await server.start()

console.info(`Local PostgreSQL (PGlite) ready:
  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:${String(port)}/postgres?sslmode=disable
Press Ctrl+C to stop.`)

async function shutdown() {
  await server.stop()
  await db.close()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
