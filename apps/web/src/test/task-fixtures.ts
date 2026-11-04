import type {
  Board,
  BoardColumn,
  BoardDetail,
  Notification,
  Task,
  TaskLabel,
} from '@syncspace/shared'

import { ada, grace, member, uuid } from './chat-fixtures'
import { authUser, ids, type MockRoutes, signedInRoutes, workspaceDetail } from './render'

export const taskIds = {
  board: uuid(0xb1),
  otherBoard: uuid(0xb2),
  todo: uuid(0xe1),
  doing: uuid(0xe2),
  done: uuid(0xe3),
  label: uuid(0xf1),
}

export function boardFixture(overrides: Partial<Board> = {}): Board {
  return {
    id: taskIds.board,
    workspaceId: ids.workspace,
    name: 'Launch',
    description: null,
    createdBy: ada,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    columnCount: 3,
    taskCount: 0,
    ...overrides,
  }
}

export function columnsFixture(boardId = taskIds.board): BoardColumn[] {
  return [
    { id: taskIds.todo, boardId, name: 'To Do', position: 1024 },
    { id: taskIds.doing, boardId, name: 'In Progress', position: 2048 },
    { id: taskIds.done, boardId, name: 'Done', position: 3072 },
  ]
}

export const bugLabel: TaskLabel = {
  id: taskIds.label,
  workspaceId: ids.workspace,
  name: 'Bug',
  color: '#EF4444',
}

let sequence = 0x5000

export function taskFixture(overrides: Partial<Task> = {}): Task {
  sequence += 1
  return {
    id: uuid(sequence),
    workspaceId: ids.workspace,
    boardId: taskIds.board,
    columnId: taskIds.todo,
    title: 'Task',
    description: null,
    priority: 'MEDIUM',
    position: sequence,
    dueDate: null,
    completedAt: null,
    archivedAt: null,
    createdBy: ada,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
    assignees: [],
    labels: [],
    attachments: [],
    ...overrides,
  }
}

export function notificationFixture(overrides: Partial<Notification> = {}): Notification {
  sequence += 1
  return {
    id: uuid(sequence),
    type: 'TASK_ASSIGNED',
    title: 'Grace Hopper assigned you a task',
    body: 'Write release notes',
    workspace: { id: ids.workspace, name: 'Acme Inc.' },
    actor: grace,
    entityType: 'TASK',
    entityId: uuid(0x9999),
    link: {
      kind: 'task',
      workspaceId: ids.workspace,
      boardId: taskIds.board,
      taskId: uuid(0x9999),
    },
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

const base = `/workspaces/${ids.workspace}`
export const boardBase = base

/** A signed-in workspace with one board (or the given ones) and its detail. */
export function taskRoutes(
  options: {
    board?: Board
    tasks?: Task[]
    boards?: Board[]
    labels?: TaskLabel[]
    role?: 'OWNER' | 'ADMIN' | 'MEMBER'
    notifications?: Notification[]
    unreadCount?: number
  } = {},
): MockRoutes {
  const board = options.board ?? boardFixture()
  const detail: BoardDetail = {
    board,
    columns: columnsFixture(board.id),
    tasks: options.tasks ?? [],
  }
  const routes: MockRoutes = {
    ...signedInRoutes({
      user: authUser(),
      workspaces: [workspaceDetail({ role: options.role ?? 'OWNER' })],
    }),
    [`GET ${base}/members`]: {
      body: { items: [member({ ...ada, email: 'ada@example.com', role: 'OWNER' }), member()] },
    },
    [`GET ${base}/boards`]: { body: { items: options.boards ?? [board] } },
    [`GET ${base}/boards/${board.id}`]: { body: detail },
    [`GET ${base}/task-labels`]: { body: { items: options.labels ?? [bugLabel] } },
    'GET /notifications/unread-count': { body: { unreadCount: options.unreadCount ?? 0 } },
    'GET /notifications': {
      body: {
        items: options.notifications ?? [],
        nextCursor: null,
        unreadCount: options.unreadCount ?? 0,
      },
    },
  }
  return routes
}

export const boardPath = (boardId = taskIds.board, query = '') =>
  `/app/workspaces/${ids.workspace}/tasks/${boardId}${query}`
export const tasksPath = `/app/workspaces/${ids.workspace}/tasks`
