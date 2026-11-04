import {
  archivedTasksQuerySchema,
  type Board,
  type BoardDetail,
  type BoardListResponse,
  type ColumnListResponse,
  createBoardInputSchema,
  createColumnInputSchema,
  createTaskInputSchema,
  createTaskLabelInputSchema,
  idSchema,
  moveColumnInputSchema,
  moveTaskInputSchema,
  type MoveTaskResponse,
  searchTasksQuerySchema,
  setTaskAssigneesInputSchema,
  setTaskLabelsInputSchema,
  type Task,
  type TaskLabel,
  type TaskLabelListResponse,
  type TaskListResponse,
  type TaskSearchResponse,
  updateBoardInputSchema,
  updateColumnInputSchema,
  updateTaskInputSchema,
  updateTaskLabelInputSchema,
} from '@syncspace/shared'
import { type Request, Router } from 'express'

import { requireAuth } from '@/middleware/require-auth'
import { validate } from '@/middleware/validate'
import { getWorkspaceAccess } from '@/modules/workspaces/workspace-access'

import { loadBoard, loadBoardById, loadTaskById } from './access'
import {
  createBoard,
  getBoardDetail,
  listArchivedTasks,
  listBoards,
  setBoardArchived,
  updateBoard,
} from './boards.service'
import { createColumn, deleteColumn, moveColumn, renameColumn } from './columns.service'
import { createLabel, deleteLabel, listLabels, updateLabel } from './labels.service'
import {
  createTask,
  getTask,
  moveTask,
  searchTasks,
  setTaskArchived,
  setTaskAssignees,
  setTaskLabels,
  updateTask,
} from './tasks.service'

type RouteRequest = Pick<Request, 'params' | 'auth' | 'workspaceAccess'>

function param(req: RouteRequest, name: string): string {
  return idSchema.parse((req.params as Record<string, unknown>)[name])
}

const userId = (req: RouteRequest) => req.auth?.userId ?? ''

// ---------------------------------------------------------------------------
// /workspaces/:workspaceId/* (mounted behind requireWorkspaceMember)
// ---------------------------------------------------------------------------

export const tasksWorkspaceRouter = Router({ mergeParams: true })

const workspaceBoard = (req: RouteRequest) =>
  loadBoard(getWorkspaceAccess(req), param(req, 'boardId'))

tasksWorkspaceRouter.get('/boards', async (req, res) => {
  const body: BoardListResponse = { items: await listBoards(getWorkspaceAccess(req)) }
  res.json(body)
})

tasksWorkspaceRouter.post(
  '/boards',
  validate({ body: createBoardInputSchema }),
  async (req, res) => {
    const body: Board = await createBoard(getWorkspaceAccess(req), req.body)
    res.status(201).json(body)
  },
)

tasksWorkspaceRouter.get('/boards/:boardId', async (req, res) => {
  const body: BoardDetail = await getBoardDetail(await workspaceBoard(req))
  res.json(body)
})

tasksWorkspaceRouter.patch(
  '/boards/:boardId',
  validate({ body: updateBoardInputSchema }),
  async (req, res) => {
    const body: Board = await updateBoard(await workspaceBoard(req), req.body)
    res.json(body)
  },
)

tasksWorkspaceRouter.post('/boards/:boardId/archive', async (req, res) => {
  const body: Board = await setBoardArchived(await workspaceBoard(req), true)
  res.json(body)
})

tasksWorkspaceRouter.post('/boards/:boardId/restore', async (req, res) => {
  const body: Board = await setBoardArchived(await workspaceBoard(req), false)
  res.json(body)
})

tasksWorkspaceRouter.get(
  '/boards/:boardId/archived-tasks',
  validate({ query: archivedTasksQuerySchema }),
  async (req, res) => {
    const body: TaskListResponse = {
      items: await listArchivedTasks(await workspaceBoard(req), req.query.limit),
    }
    res.json(body)
  },
)

tasksWorkspaceRouter.get('/task-labels', async (req, res) => {
  const body: TaskLabelListResponse = {
    items: await listLabels(getWorkspaceAccess(req).workspaceId),
  }
  res.json(body)
})

tasksWorkspaceRouter.post(
  '/task-labels',
  validate({ body: createTaskLabelInputSchema }),
  async (req, res) => {
    const body: TaskLabel = await createLabel(getWorkspaceAccess(req), req.body)
    res.status(201).json(body)
  },
)

tasksWorkspaceRouter.get(
  '/tasks/search',
  validate({ query: searchTasksQuerySchema }),
  async (req, res) => {
    const body: TaskSearchResponse = {
      items: await searchTasks(getWorkspaceAccess(req), req.query.q, req.query.limit),
    }
    res.json(body)
  },
)

// ---------------------------------------------------------------------------
// /boards/:boardId/* — columns and task creation
// ---------------------------------------------------------------------------

export const boardsRouter = Router()
boardsRouter.use(requireAuth)

const board = (req: RouteRequest) => loadBoardById(userId(req), param(req, 'boardId'))

boardsRouter.post(
  '/:boardId/columns',
  validate({ body: createColumnInputSchema }),
  async (req, res) => {
    const body: ColumnListResponse = { items: await createColumn(await board(req), req.body.name) }
    res.status(201).json(body)
  },
)

boardsRouter.post(
  '/:boardId/columns/reorder',
  validate({ body: moveColumnInputSchema }),
  async (req, res) => {
    const body: ColumnListResponse = {
      items: await moveColumn(await board(req), req.body.columnId, req.body.afterColumnId),
    }
    res.json(body)
  },
)

boardsRouter.patch(
  '/:boardId/columns/:columnId',
  validate({ body: updateColumnInputSchema }),
  async (req, res) => {
    const body: ColumnListResponse = {
      items: await renameColumn(await board(req), param(req, 'columnId'), req.body.name),
    }
    res.json(body)
  },
)

boardsRouter.delete('/:boardId/columns/:columnId', async (req, res) => {
  const body: ColumnListResponse = {
    items: await deleteColumn(await board(req), param(req, 'columnId')),
  }
  res.json(body)
})

boardsRouter.post(
  '/:boardId/tasks',
  validate({ body: createTaskInputSchema }),
  async (req, res) => {
    const body: Task = await createTask(await board(req), req.body)
    res.status(201).json(body)
  },
)

// ---------------------------------------------------------------------------
// /tasks/:taskId/*
// ---------------------------------------------------------------------------

export const tasksRouter = Router()
tasksRouter.use(requireAuth)

const task = (req: RouteRequest) => loadTaskById(userId(req), param(req, 'taskId'))

tasksRouter.get('/:taskId', async (req, res) => {
  const body: Task = await getTask(await task(req))
  res.json(body)
})

tasksRouter.patch('/:taskId', validate({ body: updateTaskInputSchema }), async (req, res) => {
  const body: Task = await updateTask(await task(req), req.body)
  res.json(body)
})

tasksRouter.post('/:taskId/move', validate({ body: moveTaskInputSchema }), async (req, res) => {
  const body: MoveTaskResponse = await moveTask(await task(req), req.body)
  res.json(body)
})

tasksRouter.put(
  '/:taskId/assignees',
  validate({ body: setTaskAssigneesInputSchema }),
  async (req, res) => {
    const body: Task = await setTaskAssignees(await task(req), req.body.userIds)
    res.json(body)
  },
)

tasksRouter.put(
  '/:taskId/labels',
  validate({ body: setTaskLabelsInputSchema }),
  async (req, res) => {
    const body: Task = await setTaskLabels(await task(req), req.body.labelIds)
    res.json(body)
  },
)

tasksRouter.post('/:taskId/archive', async (req, res) => {
  const body: Task = await setTaskArchived(await task(req), true)
  res.json(body)
})

tasksRouter.post('/:taskId/restore', async (req, res) => {
  const body: Task = await setTaskArchived(await task(req), false)
  res.json(body)
})

// ---------------------------------------------------------------------------
// /task-labels/:labelId
// ---------------------------------------------------------------------------

export const labelsRouter = Router()
labelsRouter.use(requireAuth)

labelsRouter.patch(
  '/:labelId',
  validate({ body: updateTaskLabelInputSchema }),
  async (req, res) => {
    const body: TaskLabel = await updateLabel(userId(req), param(req, 'labelId'), req.body)
    res.json(body)
  },
)

labelsRouter.delete('/:labelId', async (req, res) => {
  await deleteLabel(userId(req), param(req, 'labelId'))
  res.status(204).end()
})
