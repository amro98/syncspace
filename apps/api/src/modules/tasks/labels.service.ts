import {
  rooms,
  SERVER_EVENTS,
  type TaskLabel,
  type updateTaskLabelInputSchema,
} from '@syncspace/shared'
import type { z } from 'zod'

import { conflict } from '@/lib/errors'
import { authorize, canManageLabels, ensureVisible } from '@/lib/permissions'
import { isUniqueViolation } from '@/lib/prisma-errors'
import { getPrisma } from '@/lib/prisma'
import { realtime } from '@/sockets/realtime'
import type { WorkspaceAccess } from '@/modules/workspaces/workspace-access'

import { workspaceAccessFor } from './access'
import { labelSelect, toLabelDto } from './presenters'

/** Workspace labels, alphabetical. Every member can read and apply them. */
export async function listLabels(workspaceId: string): Promise<TaskLabel[]> {
  const labels = await getPrisma().taskLabel.findMany({
    where: { workspaceId },
    select: labelSelect,
    orderBy: { name: 'asc' },
  })
  return labels.map(toLabelDto)
}

async function broadcastLabels(workspaceId: string): Promise<TaskLabel[]> {
  const labels = await listLabels(workspaceId)
  realtime.emit(rooms.workspace(workspaceId), SERVER_EVENTS.LABELS_UPDATED, { workspaceId, labels })
  return labels
}

function nameTaken(error: unknown): never {
  if (isUniqueViolation(error)) throw conflict('A label with that name already exists.')
  throw error
}

export async function createLabel(
  workspace: WorkspaceAccess,
  input: { name: string; color: string },
): Promise<TaskLabel> {
  authorize(canManageLabels(workspace.actor), 'Only workspace owners and admins manage labels.')
  const label = await getPrisma()
    .taskLabel.create({
      data: {
        workspaceId: workspace.workspaceId,
        name: input.name,
        color: input.color.toUpperCase(),
      },
      select: labelSelect,
    })
    .catch(nameTaken)
  await broadcastLabels(workspace.workspaceId)
  return toLabelDto(label)
}

async function loadLabel(userId: string, labelId: string) {
  const label = await getPrisma().taskLabel.findUnique({
    where: { id: labelId },
    select: labelSelect,
  })
  ensureVisible(label !== null, 'Label not found')
  if (!label) throw new Error('unreachable')
  const workspace = await workspaceAccessFor(userId, label.workspaceId)
  authorize(canManageLabels(workspace.actor), 'Only workspace owners and admins manage labels.')
  return label
}

export async function updateLabel(
  userId: string,
  labelId: string,
  input: z.output<typeof updateTaskLabelInputSchema>,
): Promise<TaskLabel> {
  const existing = await loadLabel(userId, labelId)
  const label = await getPrisma()
    .taskLabel.update({
      where: { id: labelId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.color !== undefined && { color: input.color.toUpperCase() }),
      },
      select: labelSelect,
    })
    .catch(nameTaken)
  await broadcastLabels(existing.workspaceId)
  return toLabelDto(label)
}

/** Deleting a label removes it from every task (cascade); clients drop it on `labels:updated`. */
export async function deleteLabel(userId: string, labelId: string): Promise<void> {
  const existing = await loadLabel(userId, labelId)
  await getPrisma().taskLabel.delete({ where: { id: labelId } })
  await broadcastLabels(existing.workspaceId)
}
