import { describe, expect, it } from 'vitest'

import {
  canCreateBoard,
  canCreateTask,
  canDeleteBoard,
  canDeleteTask,
  canEditTask,
  canManageBoard,
  canManageLabels,
  canViewBoard,
} from './boards'
import type { BoardContext, TaskContext } from './context'
import { ADMIN, matrix, MEMBER, OWNER } from './test-fixtures'

const board = (overrides: Partial<BoardContext> = {}): BoardContext => ({
  createdById: 'u-someone',
  isArchived: false,
  ...overrides,
})

const task = (overrides: Partial<TaskContext> = {}): TaskContext => ({
  createdById: 'u-someone',
  board: board(),
  ...overrides,
})

describe('boards', () => {
  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: true, OUTSIDER: false }))(
    '%s can view and create boards: %s',
    (_name, actor, expected) => {
      expect(canViewBoard(actor)).toBe(expected)
      expect(canCreateBoard(actor)).toBe(expected)
    },
  )

  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: false, OUTSIDER: false }))(
    '%s can manage someone else’s board: %s',
    (_name, actor, expected) => {
      expect(canManageBoard(actor, board())).toBe(expected)
    },
  )

  it('lets members manage boards they created', () => {
    expect(canManageBoard(MEMBER, board({ createdById: MEMBER.userId }))).toBe(true)
    expect(canManageBoard({ ...MEMBER, role: null }, board({ createdById: MEMBER.userId }))).toBe(
      false,
    )
  })

  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: false, OUTSIDER: false }))(
    '%s can permanently delete boards: %s',
    (_name, actor, expected) => {
      expect(canDeleteBoard(actor)).toBe(expected)
    },
  )
})

describe('tasks', () => {
  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: true, OUTSIDER: false }))(
    '%s can create and edit tasks on an active board: %s',
    (_name, actor, expected) => {
      expect(canCreateTask(actor, board())).toBe(expected)
      expect(canEditTask(actor, task())).toBe(expected)
    },
  )

  it('makes archived boards read-only for everyone', () => {
    const archived = board({ isArchived: true })
    for (const actor of [OWNER, ADMIN, MEMBER]) {
      expect(canCreateTask(actor, archived)).toBe(false)
      expect(canEditTask(actor, task({ board: archived }))).toBe(false)
    }
  })

  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: false, OUTSIDER: false }))(
    '%s can delete someone else’s task: %s',
    (_name, actor, expected) => {
      expect(canDeleteTask(actor, task())).toBe(expected)
    },
  )

  it('lets creators delete their own tasks while the board is active', () => {
    expect(canDeleteTask(MEMBER, task({ createdById: MEMBER.userId }))).toBe(true)
    expect(
      canDeleteTask(
        MEMBER,
        task({ createdById: MEMBER.userId, board: board({ isArchived: true }) }),
      ),
    ).toBe(false)
  })

  it('treats tasks whose creator was deleted as admin-deletable only', () => {
    expect(canDeleteTask(MEMBER, task({ createdById: null }))).toBe(false)
    expect(canDeleteTask(ADMIN, task({ createdById: null }))).toBe(true)
  })
})

describe('labels', () => {
  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: false, OUTSIDER: false }))(
    '%s can manage workspace labels: %s',
    (_name, actor, expected) => {
      expect(canManageLabels(actor)).toBe(expected)
    },
  )
})
