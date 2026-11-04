import type { Board, BoardDetail, Task, TaskLabel } from '@syncspace/shared'
import { expect } from 'vitest'

import type { Agent } from './helpers'

export {
  chatWorkspace as taskWorkspace,
  type ChatWorkspace as TaskWorkspace,
} from './chat-fixtures'

export async function createBoardAs(agent: Agent, base: string, name = 'Roadmap'): Promise<Board> {
  const response = await agent.post(`${base}/boards`).send({ name })
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body as Board
}

export async function getBoardDetail(
  agent: Agent,
  base: string,
  boardId: string,
): Promise<BoardDetail> {
  const response = await agent.get(`${base}/boards/${boardId}`)
  expect(response.status, JSON.stringify(response.body)).toBe(200)
  return response.body as BoardDetail
}

/** A fresh board plus its default columns (To Do, In Progress, Done). */
export async function boardWithColumns(agent: Agent, base: string, name?: string) {
  const board = await createBoardAs(agent, base, name)
  const detail = await getBoardDetail(agent, base, board.id)
  const [todo, doing, done] = detail.columns
  if (!todo || !doing || !done) throw new Error('default columns missing')
  return { board, todo, doing, done }
}

export async function createTaskAs(
  agent: Agent,
  boardId: string,
  input: Record<string, unknown> & { columnId: string; title: string },
): Promise<Task> {
  const response = await agent.post(`/boards/${boardId}/tasks`).send(input)
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body as Task
}

export async function createLabelAs(
  agent: Agent,
  base: string,
  name: string,
  color = '#22C55E',
): Promise<TaskLabel> {
  const response = await agent.post(`${base}/task-labels`).send({ name, color })
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body as TaskLabel
}

/** Task titles per column, in board order. */
export function titlesByColumn(detail: BoardDetail): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const column of detail.columns) {
    result[column.name] = detail.tasks
      .filter((task) => task.columnId === column.id)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .map((task) => task.title)
  }
  return result
}
