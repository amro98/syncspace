import { describe, expect, it } from 'vitest'

import { queryKeys } from './query-keys'

function startsWith(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => Object.is(key[index], part))
}

describe('queryKeys', () => {
  it('nests workspace-scoped keys under the workspace key for prefix invalidation', () => {
    const workspace = queryKeys.workspaces.detail('w1')

    expect(startsWith(queryKeys.channels.list('w1'), workspace)).toBe(true)
    expect(startsWith(queryKeys.members.list('w1'), workspace)).toBe(true)
    expect(startsWith(queryKeys.tasks.list('w1', 'b1'), queryKeys.boards.detail('w1', 'b1'))).toBe(
      true,
    )
  })

  it('does not collide between workspaces or between message scopes', () => {
    expect(queryKeys.channels.list('w1')).not.toEqual(queryKeys.channels.list('w2'))
    expect(queryKeys.messages.channel('x')).not.toEqual(queryKeys.messages.conversation('x'))
  })

  it('includes filters so different pages/filters are cached separately', () => {
    expect(queryKeys.messages.channel('c1', { before: 'm9' })).not.toEqual(
      queryKeys.messages.channel('c1'),
    )
  })
})
