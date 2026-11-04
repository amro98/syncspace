import { SERVER_EVENTS } from '@syncspace/shared'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { chatIds } from '@/test/chat-fixtures'
import { serverEmit } from '@/test/fake-socket'
import { ids, mockApi, renderRoute } from '@/test/render'
import {
  boardPath,
  notificationFixture,
  taskFixture,
  taskIds,
  taskRoutes,
} from '@/test/task-fixtures'

import { notificationPath } from './navigation'

describe('notification bell', () => {
  it('shows the unread count and opens the task a notification points to', async () => {
    const user = userEvent.setup()
    const task = taskFixture({ title: 'Write release notes' })
    const notification = notificationFixture({
      entityId: task.id,
      link: { kind: 'task', workspaceId: ids.workspace, boardId: taskIds.board, taskId: task.id },
    })
    const routes = taskRoutes({ notifications: [notification], unreadCount: 2 })
    routes[`POST /notifications/${notification.id}/read`] = ({ body }) => {
      expect(body).toEqual({ read: true })
      return { body: { ...notification, readAt: new Date().toISOString() } }
    }
    // The task is not on the loaded board yet (e.g. just assigned): fetched by id.
    routes[`GET /tasks/${task.id}`] = { body: task }
    const { calls } = mockApi(routes)
    const { router } = renderRoute(boardPath())

    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' })
    await user.click(bell)
    const panel = screen.getByRole('dialog', { name: 'Notifications' })
    const item = await within(panel).findByRole('button', {
      name: /Unread:\s*Grace Hopper assigned you a task/,
    })
    await user.click(item)

    await waitFor(() => {
      expect(router.state.location.search).toBe(`?task=${task.id}`)
    })
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'POST', path: `/notifications/${notification.id}/read` }),
    )
    const details = await screen.findByRole('complementary', { name: 'Task details' })
    expect(within(details).getByRole('textbox', { name: 'Task title' })).toHaveValue(
      'Write release notes',
    )
    expect(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    ).toBeInTheDocument()
  })

  it('receives notifications live and marks everything read', async () => {
    const user = userEvent.setup()
    const routes = taskRoutes()
    routes['POST /notifications/read-all'] = {
      body: { readAt: new Date().toISOString(), unreadCount: 0 },
    }
    mockApi(routes)
    renderRoute(boardPath())

    await user.click(await screen.findByRole('button', { name: 'Notifications' }))
    const panel = screen.getByRole('dialog', { name: 'Notifications' })
    expect(await within(panel).findByText('No notifications yet.')).toBeInTheDocument()

    act(() => {
      serverEmit(SERVER_EVENTS.NOTIFICATION_CREATED, {
        notification: notificationFixture({
          title: 'Grace Hopper completed a task assigned to you',
          type: 'TASK_UPDATED',
        }),
        unreadCount: 1,
      })
    })
    expect(
      await within(panel).findByText('Grace Hopper completed a task assigned to you'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Mark all read' }))
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(within(panel).queryByText(/Unread:/)).not.toBeInTheDocument()
  })

  it('explains when a notification’s target no longer exists', async () => {
    const user = userEvent.setup()
    const notification = notificationFixture({ link: null })
    const routes = taskRoutes({ notifications: [notification], unreadCount: 1 })
    routes[`POST /notifications/${notification.id}/read`] = {
      body: { ...notification, readAt: new Date().toISOString() },
    }
    mockApi(routes)
    const { router } = renderRoute(boardPath())

    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }))
    const panel = screen.getByRole('dialog', { name: 'Notifications' })
    await user.click(await within(panel).findByRole('button', { name: /assigned you a task/ }))
    expect(within(panel).getByRole('status')).toHaveTextContent('no longer exists')
    expect(router.state.location.pathname).toBe(boardPath())
  })
})

describe('notificationPath', () => {
  it('builds links for tasks, messages, conversations and workspaces', () => {
    const ws = ids.workspace
    expect(
      notificationPath({ kind: 'task', workspaceId: ws, boardId: taskIds.board, taskId: 't' }),
    ).toBe(`/app/workspaces/${ws}/tasks/${taskIds.board}?task=t`)
    expect(
      notificationPath({
        kind: 'message',
        workspaceId: ws,
        destination: { kind: 'channel', id: chatIds.general },
        messageId: 'm',
        threadId: 'p',
      }),
    ).toBe(`/app/workspaces/${ws}/channel/${chatIds.general}?thread=p`)
    expect(
      notificationPath({
        kind: 'destination',
        workspaceId: ws,
        destination: { kind: 'conversation', id: chatIds.dm },
      }),
    ).toBe(`/app/workspaces/${ws}/dm/${chatIds.dm}`)
    expect(notificationPath({ kind: 'workspace', workspaceId: ws })).toBe(`/app/workspaces/${ws}`)
    expect(notificationPath(null)).toBeNull()
  })
})
