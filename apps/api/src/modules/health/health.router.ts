import { Router } from 'express'

import { getLiveness, getReadiness } from './health.service'

export const healthRouter = Router()

/** Liveness probe: the process is up. Never depends on external services. */
healthRouter.get('/', (_req, res) => {
  res.json(getLiveness())
})

/** Readiness probe: dependencies are reachable. 503 when they are not. */
healthRouter.get('/ready', async (_req, res) => {
  const readiness = await getReadiness()
  res.status(readiness.status === 'ok' ? 200 : 503).json(readiness)
})
