import {
  type Board,
  type BoardDetail,
  DEFAULT_BOARD_COLUMNS,
  evenlySpacedPositions,
  SERVER_EVENTS,
  type Task,
  type updateBoardInputSchema,
} from '@syncspace/shared'
import type { z } from 'zod'

import { authorize, canCreateBoard, canManageBoard } from '@/lib/permissions'
import { getPrisma } from '@/lib/prisma'
import { realtime } from '@/sockets/realtime'
import { emptyToNull } from '@/utils/zod'
import type { WorkspaceAccess } from '@/modules/workspaces/workspace-access'

import { type BoardAccess, authorizeBoardStructure, boardRoom } from './access'
import {
  boardSelect,
  columnOrder,
  columnSelect,
  taskOrder,
  taskSelect,
  toBoardDto,
  toColumnDto,
  toTaskDto,
} from './presenters'

/** Boards are workspace-wide (no private boards): every member lists every board. */
export async function listBoards(workspace: WorkspaceAccess): Promise<Board[]> {
  const boards = await getPrisma().board.findMany({
    where: { workspaceId: workspace.workspaceId },
    select: boardSelect,
    orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
  })
  return boards.map(toBoardDto)
}

export async function getBoard(boardId: string): Promise<Board> {
  return toBoardDto(
    await getPrisma().board.findUniqueOrThrow({ where: { id: boardId }, select: boardSelect }),
  )
}

/** Creates the board with its default columns (To Do / In Progress / Done) in one transaction. */
export async function createBoard(
  workspace: WorkspaceAccess,
  input: { name: string; description?: string | undefined },
): Promise<Board> {
  authorize(canCreateBoard(workspace.actor))
  const positions = evenlySpacedPositions(DEFAULT_BOARD_COLUMNS.length)
  const board = await getPrisma().board.create({
    data: {
      workspaceId: workspace.workspaceId,
      name: input.name,
      description: emptyToNull(input.description),
      createdById: workspace.actor.userId,
      columns: {
        create: DEFAULT_BOARD_COLUMNS.map((name, index) => ({
          name,
          position: positions[index] ?? 0,
        })),
      },
    },
    select: boardSelect,
  })
  const dto = toBoardDto(board)
  realtime.emit(boardRoom(workspace.workspaceId), SERVER_EVENTS.BOARD_CREATED, { board: dto })
  return dto
}

export async function updateBoard(
  access: BoardAccess,
  input: z.output<typeof updateBoardInputSchema>,
): Promise<Board> {
  authorizeBoardStructure(access)
  const board = await getPrisma().board.update({
    where: { id: access.board.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: emptyToNull(input.description) }),
    },
    select: boardSelect,
  })
  return broadcastBoard(toBoardDto(board))
}

/** Archived boards stay readable but reject task and column changes. */
export async function setBoardArchived(access: BoardAccess, archived: boolean): Promise<Board> {
  authorize(canManageBoard(access.workspace.actor, access.context))
  const board = await getPrisma().board.update({
    where: { id: access.board.id },
    data: { archivedAt: archived ? (access.board.archivedAt ?? new Date()) : null },
    select: boardSelect,
  })
  return broadcastBoard(toBoardDto(board))
}

function broadcastBoard(board: Board): Board {
  realtime.emit(boardRoom(board.workspaceId), SERVER_EVENTS.BOARD_UPDATED, { board })
  return board
}

/**
 * Everything to render a board: the board, its ordered columns and its active
 * tasks with assignees and labels. A fixed handful of queries regardless of
 * the number of tasks (no N+1).
 */
export async function getBoardDetail(access: BoardAccess): Promise<BoardDetail> {
  const prisma = getPrisma()
  const [board, columns, tasks] = await Promise.all([
    prisma.board.findUniqueOrThrow({ where: { id: access.board.id }, select: boardSelect }),
    prisma.boardColumn.findMany({
      where: { boardId: access.board.id },
      select: columnSelect,
      orderBy: columnOrder,
    }),
    prisma.task.findMany({
      where: { boardId: access.board.id, archivedAt: null },
      select: taskSelect,
      orderBy: [{ columnId: 'asc' }, ...taskOrder],
    }),
  ])
  return {
    board: toBoardDto(board),
    columns: columns.map(toColumnDto),
    tasks: tasks.map(toTaskDto),
  }
}

/** Archived tasks of a board, most recently archived first (the "archive" drawer). */
export async function listArchivedTasks(access: BoardAccess, limit: number): Promise<Task[]> {
  const tasks = await getPrisma().task.findMany({
    where: { boardId: access.board.id, archivedAt: { not: null } },
    select: taskSelect,
    orderBy: [{ archivedAt: 'desc' }, { id: 'desc' }],
    take: limit,
  })
  return tasks.map(toTaskDto)
}
