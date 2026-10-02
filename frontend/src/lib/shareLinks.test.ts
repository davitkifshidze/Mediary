import { describe, expect, it } from 'vitest'
import { buildDomains, librarySpec, shareTokenOf, specComplete } from '@/lib/shareLinks'

/* ============================================================
   გაზიარების ბმულის სუფთა წესები (Tasks §40).
   ============================================================ */

describe('specComplete — ცარიელი არჩევანი „არაფერია" და არა „ყველაფერი"', () => {
  it('modes without a value are incomplete', () => {
    expect(specComplete({ scope: 'status', statuses: [] })).toBe(false)
    expect(specComplete({ scope: 'genre' })).toBe(false)
    expect(specComplete({ scope: 'ids', ids: [] })).toBe(false)
  })

  it('modes that need no value are complete', () => {
    expect(specComplete({ scope: 'all' })).toBe(true)
    expect(specComplete({ scope: 'favorite' })).toBe(true)
    expect(specComplete({ scope: 'status', statuses: ['watched'] })).toBe(true)
  })
})

describe('buildDomains', () => {
  it('keeps only the selected sections and only their own mode fields', () => {
    const out = buildDomains(['series'], {
      movie: { scope: 'all' },
      series: { scope: 'genre', genres: ['drama'], statuses: ['watched'], ids: [1] },
    })

    expect(out).toEqual({ series: { scope: 'genre', genres: ['drama'], genre_mode: 'any', public_only: false } })
  })

  it('defaults an untouched section to "all"', () => {
    expect(buildDomains(['anime'], {})).toEqual({ anime: { scope: 'all', public_only: false } })
  })
})

describe('librarySpec — „ეს სია გაუზიარე"', () => {
  it('the sidebar section wins over genres', () => {
    expect(librarySpec('watched', ['drama'])).toEqual({ scope: 'status', statuses: ['watched'] })
    expect(librarySpec('favorite', [])).toEqual({ scope: 'favorite' })
  })

  it('genres are ANDed, like the library filter', () => {
    expect(librarySpec('all', ['drama', 'crime'])).toEqual({
      scope: 'genre',
      genres: ['drama', 'crime'],
      genre_mode: 'all',
    })
  })

  it('no filter shares everything', () => {
    expect(librarySpec(null, [])).toEqual({ scope: 'all' })
    expect(librarySpec('all', [])).toEqual({ scope: 'all' })
  })
})

describe('shareTokenOf', () => {
  it('reads the token from an absolute link', () => {
    expect(shareTokenOf('http://localhost:5173/share/Abc123XYZ')).toBe('Abc123XYZ')
    expect(shareTokenOf(null)).toBeNull()
    expect(shareTokenOf('http://localhost:5173/u/alice')).toBeNull()
  })
})
