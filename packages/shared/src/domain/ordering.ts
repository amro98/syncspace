/**
 * Ordering for drag-and-drop lists (board columns, tasks within a column).
 *
 * Items carry a floating-point `position`; lists sort ascending by position
 * (ties broken by id). Moving an item assigns it the midpoint of its new
 * neighbours, so a move updates exactly one row and needs no schema change.
 *
 * Repeated insertion into the same gap halves it each time; after ~50 halvings
 * doubles run out of precision. `positionBetween` detects this and reports it,
 * and the caller then rewrites the list with `evenlySpacedPositions` (one
 * batched update, rare in practice).
 *
 * Shared so the client can compute the same position for optimistic updates.
 */

export const POSITION_GAP = 1024

/** Smallest gap we accept between neighbours before asking for a rebalance. */
const MIN_GAP = 1e-9

export type PositionResult = { ok: true; position: number } | { ok: false; reason: 'rebalance' }

/**
 * Position for an item placed between `before` and `after` (either may be null
 * for the start/end of the list, both null for an empty list).
 */
export function positionBetween(before: number | null, after: number | null): PositionResult {
  if (before !== null && !Number.isFinite(before)) throw new RangeError('before must be finite')
  if (after !== null && !Number.isFinite(after)) throw new RangeError('after must be finite')

  if (before === null) {
    return { ok: true, position: after === null ? POSITION_GAP : after - POSITION_GAP }
  }
  if (after === null) return { ok: true, position: before + POSITION_GAP }

  if (before >= after) throw new RangeError('before must be less than after')
  if (after - before < MIN_GAP) return { ok: false, reason: 'rebalance' }

  const position = before + (after - before) / 2
  // Precision exhausted: the midpoint collapsed onto a neighbour.
  if (position <= before || position >= after) return { ok: false, reason: 'rebalance' }
  return { ok: true, position }
}

/** Fresh, evenly spaced positions for `count` items (initial seeding or a rebalance). */
export function evenlySpacedPositions(count: number): number[] {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('count must be a whole number')
  return Array.from({ length: count }, (_, index) => (index + 1) * POSITION_GAP)
}
