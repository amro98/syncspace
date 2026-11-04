import { SERVER_EVENTS, type Task, TASK_PRIORITIES } from '@syncspace/shared'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { serverEmit } from '@/test/fake-socket'
import { ids, mockApi, renderRoute } from '@/test/render'
import {
  boardBase,
  boardFixture,
  boardPath,
  columnsFixture,
  taskFixture,
  taskIds,
  taskRoutes,
} from '@/test/task-fixtures'

import { applyPlacements, upsertTask } from './cache'

const COLUMN_IDS = [taskIds.todo, taskIds.doing, taskIds.done]

/** 400 tasks spread over the three columns with mixed priorities. */
function bigBoard(): Task[] {
  return Array.from({ length: 400 }, (_, i) =>
    taskFixture({
      title: `Task ${String(i + 1)}`,
      columnId: COLUMN_IDS[i % 3] ?? taskIds.todo,
      priority: TASK_PRIORITIES[i % 4] ?? 'MEDIUM',
      position: (i + 1) * 1024,
    }),
  )
}

// A plain selector: accessible-name queries over 400 cards are slow in jsdom.
const cards = () => document.querySelectorAll('[aria-roledescription="draggable task"]')

describe('large boards', () => {
  it(
    'renders 400 tasks, filters them and applies realtime updates without refetching',
    { timeout: 40_000 },
    async () => {
      const user = userEvent.setup()
      const tasks = bigBoard()
      const { calls } = mockApi(taskRoutes({ tasks }))
      renderRoute(boardPath())

      await screen.findByRole('heading', { level: 1, name: 'Launch' })
      expect(cards()).toHaveLength(400)
      expect(screen.getByText('400 tasks')).toBeInTheDocument()

      await user.selectOptions(screen.getByLabelText('Priority'), 'Urgent')
      expect(cards()).toHaveLength(100)
      expect(screen.getByText('Showing 100 of 400 tasks')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Clear filters' }))

      const fetches = calls.filter((c) => c.path === `${boardBase}/boards/${taskIds.board}`).length
      const target = tasks[5]
      if (!target) throw new Error('fixture')
      act(() => {
        serverEmit(SERVER_EVENTS.TASK_UPDATED, { task: { ...target, title: 'Task 6 (renamed)' } })
        serverEmit(SERVER_EVENTS.TASK_MOVED, {
          workspaceId: ids.workspace,
          boardId: taskIds.board,
          placements: [{ taskId: target.id, columnId: taskIds.done, position: 0 }],
        })
      })
      await waitFor(() => {
        expect(
          screen.getByRole('list', { name: 'Tasks in Done' }).querySelector('button'),
        ).toHaveTextContent('Task 6 (renamed)')
      })
      expect(cards()).toHaveLength(400)
      expect(calls.filter((c) => c.path === `${boardBase}/boards/${taskIds.board}`)).toHaveLength(
        fetches,
      )
    },
  )

  it('keeps untouched tasks referentially identical so memoized cards skip re-rendering', () => {
    const detail = { board: boardFixture(), columns: columnsFixture(), tasks: bigBoard() }
    const moved = detail.tasks[10]
    const edited = detail.tasks[20]
    if (!moved || !edited) throw new Error('fixture')

    const afterMove = applyPlacements(detail, [
      { taskId: moved.id, columnId: taskIds.done, position: 1 },
    ])
    const afterEdit = upsertTask(afterMove, { ...edited, title: 'Edited' })
    const changed = new Set([moved.id, edited.id])
    const before = new Map(detail.tasks.map((task) => [task.id, task]))
    for (const task of afterEdit?.tasks ?? []) {
      if (!changed.has(task.id)) expect(task).toBe(before.get(task.id))
    }
    expect(afterEdit?.tasks).toHaveLength(400)
  })
})
