import { describe, expect, it } from 'vitest'
import { isCustomModule, isCustomModuleKey } from '@/lib/customModules'

/* ============================================================
   **პირადი მოდულის გასაღები (Tasks §37).**

   ⚠️ ფორმა `App\Support\CustomModules::PATTERN`-ის სარკეა: აქ შეცდომა
   ჩუმია — საბაზისო მოდული „პირადად" წაიკითხება (და მისი ველები `custom`-ის
   სივრცეში დაიხატება) ან პირადი საიდბარიდან გაქრება.
   ============================================================ */

describe('isCustomModuleKey', () => {
  it('accepts the owner-prefixed form', () => {
    expect(isCustomModuleKey('c5-recipes')).toBe(true)
    expect(isCustomModuleKey('c12-books-to-buy-2')).toBe(true)
  })

  it('never takes a built-in module for a personal one', () => {
    for (const key of ['movie', 'series', 'anime', 'video', 'song', 'book', 'board_game', 'game', 'note', 'bookmark', 'course', 'place', 'gallery']) {
      expect(isCustomModuleKey(key), key).toBe(false)
    }
  })

  it('rejects near misses', () => {
    expect(isCustomModuleKey('c-recipes')).toBe(false)
    expect(isCustomModuleKey('cx-recipes')).toBe(false)
    expect(isCustomModuleKey('c5_recipes')).toBe(false)
    expect(isCustomModuleKey('c5-Recipes')).toBe(false)
    expect(isCustomModuleKey(null)).toBe(false)
    // ⚠️ `statuses.module` — `varchar(32)`: გრძელი გასაღები სერვერზე ვერ იარსებებს
    expect(isCustomModuleKey(`c1-${'a'.repeat(40)}`)).toBe(false)
  })

  it('trusts the server flag as well as the key', () => {
    expect(isCustomModule({ key: 'odd', is_custom: true })).toBe(true)
    expect(isCustomModule({ key: 'song', is_custom: false })).toBe(false)
    expect(isCustomModule(null)).toBe(false)
  })
})
