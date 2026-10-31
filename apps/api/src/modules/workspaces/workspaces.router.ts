import {
  type AcceptInviteResponse,
  createInviteInputSchema,
  createWorkspaceInputSchema,
  inviteTokenInputSchema,
  type InvitePreview,
  type WorkspaceDetail,
  type WorkspaceInvite,
  type WorkspaceListResponse,
} from '@syncspace/shared'
import { Router } from 'express'

import { requireAuth } from '@/middleware/require-auth'
import { validate } from '@/middleware/validate'

import { acceptInvite, createInvite, previewInvite } from './invites.service'
import { getWorkspaceAccess, requireWorkspaceMember } from './workspace-access'
import { createWorkspace, getWorkspaceDetail, listWorkspaces } from './workspaces.service'

// ---------------------------------------------------------------------------
// /workspaces
// ---------------------------------------------------------------------------

export const workspacesRouter = Router()
workspacesRouter.use(requireAuth)

workspacesRouter.get('/', async (req, res) => {
  const body: WorkspaceListResponse = {
    items: await listWorkspaces(req.auth?.userId ?? ''),
    nextCursor: null,
  }
  res.json(body)
})

workspacesRouter.post('/', validate({ body: createWorkspaceInputSchema }), async (req, res) => {
  const body: WorkspaceDetail = await createWorkspace(req.auth?.userId ?? '', req.body)
  res.status(201).json(body)
})

/** Everything below /workspaces/:workspaceId requires membership of that workspace. */
const workspaceRouter = Router({ mergeParams: true })
workspaceRouter.use(requireWorkspaceMember)

workspaceRouter.get('/', async (req, res) => {
  const body: WorkspaceDetail = await getWorkspaceDetail(getWorkspaceAccess(req))
  res.json(body)
})

workspaceRouter.post('/invites', validate({ body: createInviteInputSchema }), async (req, res) => {
  const body: WorkspaceInvite = await createInvite(getWorkspaceAccess(req), req.body)
  res.status(201).json(body)
})

workspacesRouter.use('/:workspaceId', workspaceRouter)

// ---------------------------------------------------------------------------
// /invites — token-based. Tokens travel in bodies, never URLs (keeps them out of logs).
// ---------------------------------------------------------------------------

export const invitesRouter = Router()

/** Public: the invitation page works before the invitee signs in. */
invitesRouter.post('/preview', validate({ body: inviteTokenInputSchema }), async (req, res) => {
  const body: InvitePreview = await previewInvite(req.body.token)
  res.json(body)
})

invitesRouter.post(
  '/accept',
  requireAuth,
  validate({ body: inviteTokenInputSchema }),
  async (req, res) => {
    const body: AcceptInviteResponse = await acceptInvite(req.auth?.userId ?? '', req.body.token)
    res.json(body)
  },
)
