import { describe, expect, it } from 'vitest'
import { cardRatings, formatRating, parseRating, ratingFromStar, starFill } from '@/lib/rating'

/* ============================================================
   **ქულის არითმეტიკა** (Tasks §9) — ვარსკვლავების შევსება, დაჭერა → ქულა,
   ხელით აკრეფილი ტექსტი → ქულა, საჯარო ბარათზე TMDB-ის საშუალოსა და
   შენი ქულის გარჩევა.
   ============================================================ */

describe('formatRating', () => {
  it('writes whole scores without a decimal and fractions with one', () => {
    expect(formatRating(7)).toBe('7')
    expect(formatRating(7.0)).toBe('7')
    expect(formatRating(4.6)).toBe('4.6')
    expect(formatRating(4.66)).toBe('4.7')
    expect(formatRating(10)).toBe('10')
  })
})

describe('starFill', () => {
  it('fills two points per star, the rest proportionally', () => {
    // 4.6 → ორი სავსე, მესამე 0.3, დანარჩენი ცარიელი
    expect(starFill(4.6, 0)).toBe(1)
    expect(starFill(4.6, 1)).toBe(1)
    expect(starFill(4.6, 2)).toBeCloseTo(0.3)
    expect(starFill(4.6, 3)).toBe(0)
    expect(starFill(4.6, 4)).toBe(0)
    // ნახევარი ვარსკვლავი
    expect(starFill(1, 0)).toBe(0.5)
    expect(starFill(10, 4)).toBe(1)
    expect(starFill(null, 0)).toBe(0)
  })
})

describe('ratingFromStar', () => {
  it('maps a star half to one point and a full star to two', () => {
    expect(ratingFromStar(0, true)).toBe(1)
    expect(ratingFromStar(0, false)).toBe(2)
    expect(ratingFromStar(3, true)).toBe(7)
    expect(ratingFromStar(4, false)).toBe(10)
  })
})

describe('parseRating', () => {
  it('reads tenths, accepts a comma, caps at ten and treats empty or zero as none', () => {
    expect(parseRating('4.6')).toBe(4.6)
    expect(parseRating('4,6')).toBe(4.6)
    expect(parseRating('4.66')).toBe(4.7)
    expect(parseRating('11')).toBe(10)
    expect(parseRating('')).toBeNull()
    expect(parseRating('  ')).toBeNull()
    expect(parseRating('0')).toBeNull()
    expect(parseRating('-2')).toBeNull()
    expect(parseRating('abc')).toBeNull()
  })
})

describe('cardRatings', () => {
  it('keeps the TMDB average apart from the owner score on media cards', () => {
    expect(cardRatings({ domain: 'movie', rating: '6.8', my_rating: 4.6 })).toEqual({ mine: 4.6, average: '6.8' })
    expect(cardRatings({ domain: 'series', rating: '7.1', my_rating: null })).toEqual({ mine: null, average: '7.1' })
    expect(cardRatings({ domain: 'anime', rating: null })).toEqual({ mine: null, average: null })
  })

  it('treats the rating of every other domain as the owner score', () => {
    expect(cardRatings({ domain: 'book', rating: 9 })).toEqual({ mine: 9, average: null })
    expect(cardRatings({ domain: 'place', rating: null })).toEqual({ mine: null, average: null })
  })
})
