import { describe, expect, it } from 'vitest'
import { arrangeByKeys, isCustomOrder, sameOrder, sharedOrder } from '@/lib/moduleOrder'

const row = (key: string, sort_order: number, id: number) => ({ key, sort_order, id })

describe('sharedOrder', () => {
  it('sorts by sort_order, then by id — the server order', () => {
    // ორ მოდულს ერთი `sort_order` აქვს (სიდერში board_game და game = 39)
    const list = [row('game', 39, 8), row('movie', 10, 1), row('board_game', 39, 7)]

    expect(sharedOrder(list)).toEqual(['movie', 'board_game', 'game'])
  })

  it('does not mutate the list', () => {
    const list = [row('b', 20, 2), row('a', 10, 1)]
    sharedOrder(list)

    expect(list.map((m) => m.key)).toEqual(['b', 'a'])
  })
})

describe('isCustomOrder', () => {
  it('is false when the list already is the shared order', () => {
    expect(isCustomOrder([row('movie', 10, 1), row('series', 20, 2)])).toBe(false)
  })

  it('is true when the list differs from it', () => {
    expect(isCustomOrder([row('series', 20, 2), row('movie', 10, 1)])).toBe(true)
  })
})

describe('sameOrder', () => {
  it('compares position by position', () => {
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(sameOrder(['a'], ['a', 'b'])).toBe(false)
  })
})

describe('arrangeByKeys', () => {
  it('puts the listed keys first, in their order', () => {
    const list = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]

    expect(arrangeByKeys(list, ['c', 'a', 'b']).map((m) => m.key)).toEqual(['c', 'a', 'b'])
  })

  // ⚠️ ქეშიდან ჩუმად გამქრალი მოდული საიდბარიდანაც გაქრებოდა
  it('keeps an unlisted element at the end instead of dropping it', () => {
    const list = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]

    expect(arrangeByKeys(list, ['c']).map((m) => m.key)).toEqual(['c', 'a', 'b'])
  })

  it('ignores a key that is not in the list', () => {
    expect(arrangeByKeys([{ key: 'a' }], ['zzz', 'a']).map((m) => m.key)).toEqual(['a'])
  })
})
