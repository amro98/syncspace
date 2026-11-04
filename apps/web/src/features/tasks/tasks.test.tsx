import { SERVER_EVENTS } from '@syncspace/shared'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ada, grace } from '@/test/chat-fixtures'
import { serverEmit } from '@/test/fake-socket'
import { apiError, ids, type MockReply, mockApi, renderRoute } from '@/test/render'
import {
  boardBase,
  boardFixture,
  boardPath,
  bugLabel,
  columnsFixture,
  taskFixture,
  taskIds,
  taskRoutes,
  tasksPath,
} from '@/test/task-fixtures'

const column = (name: string) => screen.getByRole('list', { name: `Tasks in ${name}` })

async function openBoard(path = boardPath()) {
  const result = renderRoute(path)
  await screen.findByRole('heading', { level: 1, name: 'Launch' })
  return result
}

describe('boards', () => {
  it('opens the first board from Tasks and renders columns with useful card summaries', async () => {
    const overdue = new Date(Date.now() - 2 * 86_400_000).toISOString()
    mockApi(
      taskRoutes({
        tasks: [
          taskFixture({
            title: 'Fix login crash',
            priority: 'URGENT',
            dueDate: overdue,
            labels: [bugLabel],
            assignees: [grace],
          }),
          taskFixture({ title: 'Ship docs', columnId: taskIds.done, completedAt: overdue }),
        ],
      }),
    )
    const { router } = renderRoute(tasksPath)

    await screen.findByRole('heading', { level: 1, name: 'Launch' })
    expect(router.state.location.pathname).toBe(boardPath())
    expect(
      screen.getAllByRole('region', { name: /column$/ }).map((r) => r.getAttribute('aria-label')),
    ).toEqual(['To Do column', 'In Progress column', 'Done column'])
    const card = within(column('To Do')).getByRole('button', { name: /Fix login crash/ })
    expect(card).toHaveTextContent('Bug')
    expect(card).toHaveTextContent('Urgent priority')
    expect(card).toHaveTextContent(/Overdue/)
    expect(within(card).getByLabelText('Assigned to Grace Hopper')).toBeInTheDocument()
    expect(within(column('Done')).getByLabelText('Completed')).toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'Boards' })).getByRole('link', { name: 'Launch' }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('offers to create the first board and opens it', async () => {
    const user = userEvent.setup()
    const created = boardFixture({ name: 'Roadmap' })
    const routes = taskRoutes({ boards: [], board: created })
    routes[`POST ${boardBase}/boards`] = ({ body }) => {
      expect(body).toEqual({ name: 'Roadmap' })
      return { status: 201, body: created }
    }
    mockApi(routes)
    const { router } = renderRoute(tasksPath)

    expect(
      await screen.findByRole('heading', { name: 'Create your first board' }),
    ).toBeInTheDocument()
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Create board' }))
    const dialog = screen.getByRole('dialog', { name: 'Create a board' })
    await user.type(within(dialog).getByLabelText('Name'), 'Roadmap')
    await user.click(within(dialog).getByRole('button', { name: 'Create board' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(boardPath(created.id))
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Roadmap' })).toBeInTheDocument()
  })

  it('makes archived boards read-only', async () => {
    mockApi(
      taskRoutes({
        board: boardFixture({ archivedAt: '2026-02-01T00:00:00.000Z' }),
        tasks: [taskFixture()],
      }),
    )
    await openBoard()

    expect(screen.getByText(/This board is archived and read-only/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add column' })).not.toBeInTheDocument()
  })

  it('explains why a column with tasks cannot be deleted', async () => {
    const user = userEvent.setup()
    const routes = taskRoutes({ tasks: [taskFixture()] })
    routes[`DELETE /boards/${taskIds.board}/columns/${taskIds.todo}`] = apiError(
      'COLUMN_NOT_EMPTY',
      409,
      'This column still has 1 task. Move it to another column first.',
    )
    mockApi(routes)
    await openBoard()

    await user.click(screen.getByRole('button', { name: 'Column options for To Do' }))
    await user.click(screen.getByRole('button', { name: 'Delete column' }))
    const dialog = screen.getByRole('dialog', { name: /Delete “To Do”/ })
    await user.click(within(dialog).getByRole('button', { name: 'Delete column' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Move it to another column first',
    )
  })
})

describe('tasks', () => {
  it('creates a task inline at the bottom of a column', async () => {
    const user = userEvent.setup()
    const routes = taskRoutes()
    routes[`POST /boards/${taskIds.board}/tasks`] = ({ body }) => {
      expect(body).toEqual({ columnId: taskIds.todo, title: 'Ship it' })
      return { status: 201, body: taskFixture({ title: 'Ship it' }) }
    }
    mockApi(routes)
    await openBoard()

    const todo = screen.getByRole('region', { name: 'To Do column' })
    await user.click(within(todo).getByRole('button', { name: 'Add task' }))
    await user.type(
      within(todo).getByRole('textbox', { name: 'New task in To Do' }),
      'Ship it{Enter}',
    )
    expect(
      await within(column('To Do')).findByRole('button', { name: /Ship it/ }),
    ).toBeInTheDocument()
  })

  it('moves a task optimistically, confirms it and ignores the socket echo', async () => {
    const user = userEvent.setup()
    const task = taskFixture({ title: 'Draft spec' })
    let release: ((reply: MockReply) => void) | undefined
    const routes = taskRoutes({ tasks: [task] })
    routes[`POST /tasks/${task.id}/move`] = ({ body }) => {
      expect(body).toEqual({ columnId: taskIds.doing, afterTaskId: null })
      return new Promise<MockReply>((resolve) => {
        release = resolve
      })
    }
    mockApi(routes)
    await openBoard(boardPath(taskIds.board, `?task=${task.id}`))

    const panel = await screen.findByRole('complementary', { name: 'Task details' })
    await user.selectOptions(within(panel).getByLabelText('Column'), 'In Progress')

    // Moved before the server answered.
    expect(
      within(column('In Progress')).getByRole('button', { name: /Draft spec/ }),
    ).toBeInTheDocument()
    expect(
      within(column('To Do')).queryByRole('button', { name: /Draft spec/ }),
    ).not.toBeInTheDocument()

    const placements = [{ taskId: task.id, columnId: taskIds.doing, position: 1024 }]
    act(() => {
      serverEmit(SERVER_EVENTS.TASK_MOVED, {
        workspaceId: ids.workspace,
        boardId: taskIds.board,
        placements,
      })
    })
    await act(async () => {
      release?.({
        body: { task: { ...task, columnId: taskIds.doing, position: 1024 }, placements },
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(
        within(column('In Progress')).getAllByRole('button', { name: /Draft spec/ }),
      ).toHaveLength(1)
    })
    expect(
      within(column('To Do')).queryByRole('button', { name: /Draft spec/ }),
    ).not.toBeInTheDocument()
  })

  it('rolls a failed move back and explains why', async () => {
    const user = userEvent.setup()
    const task = taskFixture({ title: 'Locked' })
    const routes = taskRoutes({ tasks: [task] })
    routes[`POST /tasks/${task.id}/move`] = apiError('FORBIDDEN', 403, 'This board is archived.')
    mockApi(routes)
    await openBoard(boardPath(taskIds.board, `?task=${task.id}`))

    const panel = await screen.findByRole('complementary', { name: 'Task details' })
    await user.selectOptions(within(panel).getByLabelText('Column'), 'Done')

    expect(await within(panel).findByRole('alert')).toHaveTextContent('This board is archived.')
    await waitFor(() => {
      expect(within(column('To Do')).getByRole('button', { name: /Locked/ })).toBeInTheDocument()
    })
    expect(within(column('Done')).queryByRole('button', { name: /Locked/ })).not.toBeInTheDocument()
  })

  it('edits details, labels, completion and archive state in the panel', async () => {
    const user = userEvent.setup()
    const task = taskFixture({ title: 'Polish' })
    const routes = taskRoutes({ tasks: [task] })
    let current = task
    routes[`PATCH /tasks/${task.id}`] = ({ body }) => {
      const input = body as { priority?: string; completed?: boolean }
      current = {
        ...current,
        ...(input.priority && { priority: input.priority as typeof task.priority }),
        ...(input.completed !== undefined && {
          completedAt: input.completed ? '2026-03-02T10:00:00.000Z' : null,
        }),
      }
      return { body: current }
    }
    routes[`PUT /tasks/${task.id}/labels`] = ({ body }) => {
      expect(body).toEqual({ labelIds: [bugLabel.id] })
      current = { ...current, labels: [bugLabel] }
      return { body: current }
    }
    routes[`PUT /tasks/${task.id}/assignees`] = ({ body }) => {
      expect(body).toEqual({ userIds: [grace.id] })
      current = { ...current, assignees: [grace] }
      return { body: current }
    }
    routes[`POST /tasks/${task.id}/archive`] = () => {
      current = { ...current, archivedAt: '2026-03-02T11:00:00.000Z' }
      return { body: current }
    }
    mockApi(routes)
    await openBoard(boardPath(taskIds.board, `?task=${task.id}`))
    const panel = await screen.findByRole('complementary', { name: 'Task details' })

    await user.selectOptions(within(panel).getByLabelText('Priority'), 'High')
    await waitFor(() => {
      expect(within(column('To Do')).getByRole('button', { name: /Polish/ })).toHaveTextContent(
        'High priority',
      )
    })

    await user.click(within(panel).getByRole('button', { name: 'Mark complete' }))
    expect(await within(panel).findByRole('button', { name: 'Completed' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(within(panel).getByRole('button', { name: /Bug/ }))
    await waitFor(() => {
      expect(within(panel).getByRole('button', { name: /Bug/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    await user.click(within(panel).getByRole('button', { name: 'Assign' }))
    await user.click(within(panel).getByRole('button', { name: /Grace Hopper/ }))
    expect(
      await within(within(panel).getByRole('list', { name: 'Assignees' })).findByText(
        'Grace Hopper',
      ),
    ).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Archive task' }))
    expect(await within(panel).findByText(/Archived/)).toBeInTheDocument()
    expect(
      within(column('To Do')).queryByRole('button', { name: /Polish/ }),
    ).not.toBeInTheDocument()
  })

  it('applies other people’s changes in realtime without refetching', async () => {
    const { calls } = mockApi(taskRoutes())
    await openBoard()
    const detailFetches = () =>
      calls.filter((c) => c.path === `${boardBase}/boards/${taskIds.board}`).length
    const before = detailFetches()

    const remote = taskFixture({ title: 'From Grace', columnId: taskIds.doing, createdBy: grace })
    act(() => {
      serverEmit(SERVER_EVENTS.TASK_CREATED, { task: remote })
    })
    expect(
      await within(column('In Progress')).findByRole('button', { name: /From Grace/ }),
    ).toBeInTheDocument()

    act(() => {
      serverEmit(SERVER_EVENTS.TASK_MOVED, {
        workspaceId: ids.workspace,
        boardId: taskIds.board,
        placements: [{ taskId: remote.id, columnId: taskIds.done, position: 10 }],
      })
    })
    expect(
      await within(column('Done')).findByRole('button', { name: /From Grace/ }),
    ).toBeInTheDocument()

    act(() => {
      serverEmit(SERVER_EVENTS.COLUMNS_UPDATED, {
        workspaceId: ids.workspace,
        boardId: taskIds.board,
        columns: columnsFixture().map((c) =>
          c.id === taskIds.done ? { ...c, name: 'Shipped' } : c,
        ),
      })
      serverEmit(SERVER_EVENTS.BOARD_CREATED, {
        board: boardFixture({ id: taskIds.otherBoard, name: 'Ops', createdBy: grace }),
      })
    })
    expect(await screen.findByRole('list', { name: 'Tasks in Shipped' })).toHaveTextContent(
      'From Grace',
    )
    expect(
      within(screen.getByRole('list', { name: 'Boards' })).getByRole('link', { name: 'Ops' }),
    ).toBeInTheDocument()

    act(() => {
      serverEmit(SERVER_EVENTS.TASK_UPDATED, {
        task: { ...remote, columnId: taskIds.done, archivedAt: '2026-03-03T00:00:00.000Z' },
      })
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /From Grace/ })).not.toBeInTheDocument()
    })
    expect(detailFetches()).toBe(before)
  })
})

describe('filters', () => {
  it('filters from the URL, combines filters and searches titles and descriptions', async () => {
    const user = userEvent.setup()
    mockApi(
      taskRoutes({
        tasks: [
          taskFixture({ title: 'Fix crash', priority: 'URGENT' }),
          taskFixture({
            title: 'Polish copy',
            priority: 'LOW',
            assignees: [grace],
            description: 'Landing page',
          }),
          taskFixture({ title: 'Mine', priority: 'URGENT', assignees: [ada] }),
        ],
      }),
    )
    const { router } = await openBoard(boardPath(taskIds.board, '?priority=URGENT'))

    expect(screen.getByText('Showing 2 of 3 tasks')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Polish copy/ })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Assignee'), 'Assigned to me')
    expect(router.state.location.search).toContain('assignee=me')
    expect(screen.getByRole('button', { name: /Mine/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Fix crash/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(router.state.location.search).toBe('')
    await user.type(
      screen.getByRole('searchbox', { name: 'Search tasks on this board' }),
      'landing',
    )
    expect(screen.getByRole('button', { name: /Polish copy/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Fix crash/ })).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 3 tasks')).toBeInTheDocument()
  })
})
