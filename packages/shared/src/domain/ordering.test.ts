import { describe, expect, it } from 'vitest'

import { byPosition, planInsert, POSITION_GAP } from './ordering'

const list = (...positions: number[]) =>
  positions.map((position, index) => ({ id: `item-${String(index)}`, position }))

describe('planInsert', () => {
  it('places at the top, between neighbours and at the end with one update', () => {
    const siblings = list(1024, 2048, 3072)
    expect(planInsert(siblings, 'new', null)).toEqual({
      position: 0,
      updates: [{ id: 'new', position: 0 }],
    })
    expect(planInsert(siblings, 'new', 'item-0').position).toBe(1536)
    expect(planInsert(siblings, 'new', 'item-2').position).toBe(3072 + POSITION_GAP)
    expect(planInsert([], 'new', null).position).toBe(POSITION_GAP)
  })

  it('re-spaces the whole list when the gap is exhausted or positions tie', () => {
    const tight = planInsert(list(5, 5 + 1e-12, 9), 'new', 'item-0')
    expect(tight.updates).toEqual([
      { id: 'item-0', position: 1024 },
      { id: 'new', position: 2048 },
      { id: 'item-1', position: 3072 },
      { id: 'item-2', position: 4096 },
    ])
    expect(tight.position).toBe(2048)

    const tied = planInsert(list(7, 7), 'new', 'item-0')
    expect(tied.updates.map((u) => u.id)).toEqual(['item-0', 'new', 'item-1'])
  })

  it('rejects an unknown anchor', () => {
    expect(() => planInsert(list(1), 'new', 'missing')).toThrow(RangeError)
  })

  it('sorts by position with id as tie-breaker', () => {
    const items = [
      { id: 'b', position: 2 },
      { id: 'c', position: 1 },
      { id: 'a', position: 2 },
    ]
    expect([...items].sort(byPosition).map((i) => i.id)).toEqual(['c', 'a', 'b'])
  })
})
