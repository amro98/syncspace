import {
  type CreateInviteInput,
  type CreateWorkspaceInput,
  workspaceDetailSchema,
  workspaceInviteSchema,
  workspaceListResponseSchema,
} from '@syncspace/shared'

import { apiClient } from '@/lib/api-client'

export async function fetchWorkspaces(signal?: AbortSignal) {
  const { items } = await apiClient.get('/workspaces', {
    schema: workspaceListResponseSchema,
    ...(signal && { signal }),
  })
  return items
}

export function fetchWorkspace(workspaceId: string, signal?: AbortSignal) {
  return apiClient.get(`/workspaces/${encodeURIComponent(workspaceId)}`, {
    schema: workspaceDetailSchema,
    ...(signal && { signal }),
  })
}

export function createWorkspace(input: CreateWorkspaceInput) {
  return apiClient.post('/workspaces', { body: input, schema: workspaceDetailSchema })
}

export function createInvite(workspaceId: string, input: CreateInviteInput) {
  return apiClient.post(`/workspaces/${encodeURIComponent(workspaceId)}/invites`, {
    body: input,
    schema: workspaceInviteSchema,
  })
}
