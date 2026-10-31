import type { z } from 'zod'

import type {
  acceptInviteResponseSchema,
  createInviteInputSchema,
  createWorkspaceInputSchema,
  invitePreviewSchema,
  workspaceDetailSchema,
  workspaceInviteSchema,
  workspaceListResponseSchema,
  workspaceSummarySchema,
} from '../schemas/workspaces'

export type CreateWorkspaceInput = z.output<typeof createWorkspaceInputSchema>
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>
export type WorkspaceListResponse = z.infer<typeof workspaceListResponseSchema>
export type WorkspaceDetail = z.infer<typeof workspaceDetailSchema>

export type CreateInviteInput = z.output<typeof createInviteInputSchema>
export type WorkspaceInvite = z.infer<typeof workspaceInviteSchema>
export type InvitePreview = z.infer<typeof invitePreviewSchema>
export type InviteStatus = InvitePreview['status']
export type AcceptInviteResponse = z.infer<typeof acceptInviteResponseSchema>
