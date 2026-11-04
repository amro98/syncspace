import type { BoardDetail } from '@syncspace/shared'
import { describe, expect, it } from 'vitest'

import { ada, grace } from '@/test/chat-fixtures'
import { boardFixture, bugLabel, columnsFixture, taskFixture, taskIds } from '@/test/task-fixtures'

import {
  applyLabels,
  applyPlacements,
  planTaskMove,
  setColumns,
  tasksByColumn,
  upsertTask,
} from './cache'
import {
  dueState,
  EMPTY_FILTERS,
  fromDateInput,
  hasFilters,
  matchesFilters,
  parseFilters,
  toDateInput,
  writeFilters,
} from './filters'

function detailWith(...titles: string[]): BoardDetail {
  return {
    board: boardFixture(),
    columns: columnsFixture(),
    tasks: titles.map((title, index) => taskFixture({ title, position: (index + 1) * 1024 })),
  }
}

const titles = (detail: BoardDetail | undefined, columnId: string) =>
  (detail ? (tasksByColumn(detail).get(columnId) ?? []) : []).map((task) => task.title)

describe('board cache', () => {
  it('plans moves like the server and applies placements idempotently', () => {
    const detail = detailWith('A', 'B', 'C')
    const c = detail.tasks[2]
    const a = detail.tasks[0]
    if (!c || !a) throw new Error('fixture')

    const placements = planTaskMove(detail, c.id, taskIds.todo, a.id)
    expect(placements).toEqual([{ taskId: c.id, columnId: taskIds.todo, position: 1536 }])
    const once = applyPlacements(detail, placements)
    expect(titles(once, taskIds.todo)).toEqual(['A', 'C', 'B'])
    // The socket echo of the same move changes nothing.
    expect(applyPlacements(once, placements)).toEqual(once)

    const toDone = applyPlacements(once, planTaskMove(detail, a.id, taskIds.done, null))
    expect(titles(toDone, taskIds.done)).toEqual(['A'])
  })

  it('upserts, archives away and keeps columns and labels in sync', () => {
    const detail = detailWith('A')
    const task = detail.tasks[0]
    if (!task) throw new Error('fixture')

    const renamed = upsertTask(detail, { ...task, title: 'A2', labels: [bugLabel] })
    expect(titles(renamed, taskIds.todo)).toEqual(['A2'])
    expect(upsertTask(renamed, { ...task, archivedAt: '2026-01-01T00:00:00.000Z' })?.tasks).toEqual(
      [],
    )
    expect(upsertTask(detail, { ...task, boardId: taskIds.otherBoard })).toBe(detail)

    const relabelled = applyLabels(renamed, [{ ...bugLabel, name: 'Defect' }])
    expect(relabelled?.tasks[0]?.labels.map((l) => l.name)).toEqual(['Defect'])
    expect(applyLabels(renamed, [])?.tasks[0]?.labels).toEqual([])

    const columns = setColumns(detail, columnsFixture().reverse())
    expect(columns?.columns.map((c) => c.name)).toEqual(['To Do', 'In Progress', 'Done'])
  })
})

describe('filters', () => {
  const now = new Date(2026, 2, 10, 12, 0, 0)

  it('round-trips through the URL and keeps unrelated params', () => {
    const params = new URLSearchParams('task=abc&priority=HIGH,BOGUS&due=overdue&status=nope')
    const filters = parseFilters(params)
    expect(filters).toEqual({ ...EMPTY_FILTERS, priorities: ['HIGH'], due: 'overdue' })
    expect(hasFilters(filters)).toBe(true)
    expect(writeFilters(params, { ...filters, q: ' docs ' }).toString()).toBe(
      'task=abc&priority=HIGH&due=overdue&q=docs',
    )
    expect(hasFilters(EMPTY_FILTERS)).toBe(false)
  })

  it('derives due states in the viewer’s timezone', () => {
    const at = (days: number, hours = 23) => new Date(2026, 2, 10 + days, hours, 59).toISOString()
    expect(dueState({ dueDate: null, completedAt: null }, now)).toBe('none')
    expect(dueState({ dueDate: at(-1), completedAt: null }, now)).toBe('overdue')
    expect(dueState({ dueDate: at(0), completedAt: null }, now)).toBe('today')
    expect(dueState({ dueDate: at(3), completedAt: null }, now)).toBe('soon')
    expect(dueState({ dueDate: at(30), completedAt: null }, now)).toBe('later')
    expect(dueState({ dueDate: at(-1), completedAt: at(-2) }, now)).toBe('done')

    const picked = fromDateInput('2026-03-12')
    expect(picked).not.toBeNull()
    expect(toDateInput(picked)).toBe('2026-03-12')
    expect(fromDateInput('12/03/2026')).toBeNull()
  })

  it('combines assignee, priority, label, due, status and text filters', () => {
    const task = taskFixture({
      title: 'Fix login',
      description: 'Cookie flags',
      priority: 'HIGH',
      assignees: [grace],
      labels: [bugLabel],
      dueDate: new Date(2026, 2, 10, 23, 59).toISOString(),
    })
    const match = (overrides: Partial<typeof EMPTY_FILTERS>) =>
      matchesFilters(task, { ...EMPTY_FILTERS, ...overrides }, ada.id, now)

    expect(
      match({ assignee: grace.id, priorities: ['HIGH'], labelIds: [bugLabel.id], due: 'today' }),
    ).toBe(true)
    expect(match({ assignee: 'me' })).toBe(false)
    expect(match({ assignee: 'none' })).toBe(false)
    expect(match({ priorities: ['LOW'] })).toBe(false)
    expect(match({ due: 'week', status: 'open', q: 'cookie' })).toBe(true)
    expect(match({ status: 'done' })).toBe(false)
    expect(match({ due: 'none' })).toBe(false)
    expect(match({ q: 'logout' })).toBe(false)
  })
})
