import { type BoardColumn, planInsert, POSITION_GAP, SERVER_EVENTS } from '@syncspace/shared'

import { AppError, badRequest, conflict, notFound } from '@/lib/errors'
import { getPrisma } from '@/lib/prisma'
import { realtime } from '@/sockets/realtime'

import { type BoardAccess, authorizeBoardStructure, boardRoom } from './access'
import { columnOrder, columnSelect, taskOrder, toColumnDto } from './presenters'

type Db = Parameters<Parameters<ReturnType<typeof getPrisma>['$transaction']>[0]>[0]

async function orderedColumns(db: Db | ReturnType<typeof getPrisma>, boardId: string) {
  return db.boardColumn.findMany({ where: { boardId }, select: columnSelect, orderBy: columnOrder })
}

/** Sends the board's full ordered column list (columns are few) and returns it. */
async function broadcastColumns(access: BoardAccess): Promise<BoardColumn[]> {
  const columns = (await orderedColumns(getPrisma(), access.board.id)).map(toColumnDto)
  realtime.emit(boardRoom(access.board.workspaceId), SERVER_EVENTS.COLUMNS_UPDATED, {
    workspaceId: access.board.workspaceId,
    boardId: access.board.id,
    columns,
  })
  return columns
}

/** Appends a column at the end of the board. */
export async function createColumn(access: BoardAccess, name: string): Promise<BoardColumn[]> {
  authorizeBoardStructure(access)
  const prisma = getPrisma()
  const last = await prisma.boardColumn.findFirst({
    where: { boardId: access.board.id },
    orderBy: { position: 'desc' },
    select: { position: true },
  })
  await prisma.boardColumn.create({
    data: { boardId: access.board.id, name, position: (last?.position ?? 0) + POSITION_GAP },
  })
  return broadcastColumns(access)
}

async function columnOf(access: BoardAccess, columnId: string) {
  const column = await getPrisma().boardColumn.findFirst({
    where: { id: columnId, boardId: access.board.id },
    select: columnSelect,
  })
  if (!column) throw notFound('Column not found')
  return column
}

export async function renameColumn(
  access: BoardAccess,
  columnId: string,
  name: string,
): Promise<BoardColumn[]> {
  authorizeBoardStructure(access)
  await columnOf(access, columnId)
  await getPrisma().boardColumn.update({ where: { id: columnId }, data: { name } })
  return broadcastColumns(access)
}

/**
 * Moves a column just after `afterColumnId` (null = first). One row is
 * updated; the board's columns are re-spaced only when precision runs out.
 */
export async function moveColumn(
  access: BoardAccess,
  columnId: string,
  afterColumnId: string | null,
): Promise<BoardColumn[]> {
  authorizeBoardStructure(access)
  if (afterColumnId === columnId) throw badRequest('A column cannot be placed after itself')
  await getPrisma().$transaction(async (tx) => {
    const columns = await orderedColumns(tx, access.board.id)
    if (!columns.some((c) => c.id === columnId)) throw notFound('Column not found')
    const siblings = columns.filter((c) => c.id !== columnId)
    if (afterColumnId !== null && !siblings.some((c) => c.id === afterColumnId)) {
      throw badRequest('afterColumnId must be another column of this board')
    }
    const { updates } = planInsert(siblings, columnId, afterColumnId)
    for (const update of updates) {
      await tx.boardColumn.update({ where: { id: update.id }, data: { position: update.position } })
    }
  })
  return broadcastColumns(access)
}

/**
 * Deletes a column. Active tasks must be moved first (409 COLUMN_NOT_EMPTY).
 * Archived tasks still reference the column, so they are moved to the end of
 * the first remaining column in the same transaction. The last column cannot
 * be deleted.
 */
export async function deleteColumn(access: BoardAccess, columnId: string): Promise<BoardColumn[]> {
  authorizeBoardStructure(access)
  await columnOf(access, columnId)
  await getPrisma().$transaction(async (tx) => {
    const active = await tx.task.count({ where: { columnId, archivedAt: null } })
    if (active > 0) {
      throw new AppError(
        'COLUMN_NOT_EMPTY',
        `This column still has ${String(active)} ${active === 1 ? 'task' : 'tasks'}. Move ${active === 1 ? 'it' : 'them'} to another column first.`,
      )
    }
    const fallback = (await orderedColumns(tx, access.board.id)).find((c) => c.id !== columnId)
    if (!fallback) throw conflict('A board needs at least one column.')

    const archived = await tx.task.findMany({
      where: { columnId },
      select: { id: true },
      orderBy: taskOrder,
    })
    if (archived.length > 0) {
      const last = await tx.task.findFirst({
        where: { columnId: fallback.id },
        orderBy: { position: 'desc' },
        select: { position: true },
      })
      let position = last?.position ?? 0
      for (const task of archived) {
        position += POSITION_GAP
        await tx.task.update({ where: { id: task.id }, data: { columnId: fallback.id, position } })
      }
    }
    await tx.boardColumn.delete({ where: { id: columnId } })
  })
  return broadcastColumns(access)
}
