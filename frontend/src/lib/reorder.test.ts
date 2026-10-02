import { describe, expect, it } from 'vitest'
import { moveWithin, sortByIds } from '@/lib/reorder'

/* ============================================================
   **გადალაგების არითმეტიკა** (Tasks §11).
   ============================================================ */

describe('moveWithin', () => {
  it('moves one step and refuses the edges', () => {
    expect(moveWithin(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
    expect(moveWithin(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(moveWithin(['a', 'b', 'c'], 'a', -1)).toBeNull()
    expect(moveWithin(['a', 'b', 'c'], 'c', 1)).toBeNull()
    expect(moveWithin(['a', 'b', 'c'], 'x', 1)).toBeNull()
    expect(moveWithin([1, 2, 3], 2, 0)).toBeNull()
  })

  it('does not touch the input', () => {
    const ids = [1, 2, 3]
    moveWithin(ids, 1, 1)
    expect(ids).toEqual([1, 2, 3])
  })
})

describe('sortByIds', () => {
  it('orders items by the id list and keeps unknown ones at the end', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 9 }]
    expect(sortByIds(items, [3, 1, 2], (x) => x.id).map((x) => x.id)).toEqual([3, 1, 2, 9])
  })
})
