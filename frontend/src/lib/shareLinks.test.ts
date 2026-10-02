import { describe, expect, it } from 'vitest'
import { SHARE_DOMAINS } from '@/api/shareLinks'
import {
  SHARE_DOMAIN_META,
  buildDomains,
  librarySpec,
  shareGenreName,
  shareTokenOf,
  specComplete,
} from '@/lib/shareLinks'

/* ============================================================
   გაზიარების ბმულის სუფთა წესები (Tasks §40, §40.10).
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

  it('reads the classifier field the domain actually sends', () => {
    // მედია — გლობალური ჟანრის slug-ები
    expect(specComplete({ scope: 'genre', genres: ['drama'] }, 'movie')).toBe(true)
    expect(specComplete({ scope: 'genre', categories: [3] }, 'movie')).toBe(false)
    // ეტაპი 2 — მფლობელის ლექსიკონის id-ები
    expect(specComplete({ scope: 'genre', categories: [3] }, 'book')).toBe(true)
    expect(specComplete({ scope: 'genre', genres: ['drama'] }, 'book')).toBe(false)
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

  it('sends the owner dictionary ids on stage-2 sections, never slugs', () => {
    expect(buildDomains(['game'], { game: { scope: 'genre', categories: [4, 9], genres: ['x'], genre_mode: 'all' } })).toEqual({
      game: { scope: 'genre', categories: [4, 9], genre_mode: 'all', public_only: false },
    })
  })

  it('"all at once" only travels on a pivot — one column cannot hold two values', () => {
    expect(buildDomains(['book'], { book: { scope: 'genre', categories: [1, 2], genre_mode: 'all' } })).toEqual({
      book: { scope: 'genre', categories: [1, 2], genre_mode: 'any', public_only: false },
    })
  })

  it('a section without statuses falls back to "all" instead of an empty status scope', () => {
    expect(buildDomains(['song'], { song: { scope: 'status', statuses: ['done'] } })).toEqual({
      song: { scope: 'all', public_only: false },
    })
  })
})

describe('librarySpec — „ეს სია გაუზიარე"', () => {
  it('the sidebar section wins over genres', () => {
    expect(librarySpec('movie', 'watched', ['drama'])).toEqual({ scope: 'status', statuses: ['watched'] })
    expect(librarySpec('movie', 'favorite', [])).toEqual({ scope: 'favorite' })
  })

  it('genres are ANDed, like the library filter', () => {
    expect(librarySpec('movie', 'all', ['drama', 'crime'])).toEqual({
      scope: 'genre',
      genres: ['drama', 'crime'],
      genre_mode: 'all',
    })
  })

  it('no filter shares everything', () => {
    expect(librarySpec('movie', null, [])).toEqual({ scope: 'all' })
    expect(librarySpec('movie', 'all', [])).toEqual({ scope: 'all' })
  })

  it('stage-2 filters are dictionary ids: AND on a pivot, OR on a single column', () => {
    // თამაშის ჟანრი pivot-ია — სიის ფილტრი „და"-თია
    expect(librarySpec('game', 'all', ['4', '9'])).toEqual({ scope: 'genre', categories: [4, 9], genre_mode: 'all' })
    // ბუკმარკის კატეგორია ერთი სვეტია — სია „ან"-ით ფილტრავს (`whereIn`)
    expect(librarySpec('bookmark', null, ['2', '5'])).toEqual({ scope: 'genre', categories: [2, 5], genre_mode: 'any' })
  })

  it('a section without statuses never turns its view into a status scope', () => {
    // სიმღერას სტატუსი არ აქვს — უცნობი `view` „ყველა"-ა და არა `invalid_status`
    expect(librarySpec('song', 'done', [])).toEqual({ scope: 'all' })
    // ვიდეოს „ჩამოტვირთული" სტატუსი არაა
    expect(librarySpec('video', 'downloaded', [])).toEqual({ scope: 'all' })
    expect(librarySpec('course', 'taking', [])).toEqual({ scope: 'status', statuses: ['taking'] })
  })

  it('drops a value that is not an id', () => {
    expect(librarySpec('place', 'all', ['x', '0'])).toEqual({ scope: 'all' })
  })
})

describe('SHARE_DOMAIN_META', () => {
  it('describes every share domain', () => {
    expect(Object.keys(SHARE_DOMAIN_META).sort()).toEqual([...SHARE_DOMAINS].sort())
  })

  it('only the media domains use the global genre', () => {
    const global = SHARE_DOMAINS.filter((d) => SHARE_DOMAIN_META[d].global)
    expect(global).toEqual(['movie', 'series', 'anime'])
  })
})

describe('shareGenreName', () => {
  it('falls back across languages and never prints null', () => {
    expect(shareGenreName({ name_ka: null, name_en: 'Drama' }, 'ka')).toBe('Drama')
    expect(shareGenreName({ name_ka: 'დრამა', name_en: null }, 'en')).toBe('დრამა')
    expect(shareGenreName({ name_ka: null, name_en: null }, 'ka')).toBe('')
  })
})

describe('shareTokenOf', () => {
  it('reads the token from an absolute link', () => {
    expect(shareTokenOf('http://localhost:5173/share/Abc123XYZ')).toBe('Abc123XYZ')
    expect(shareTokenOf(null)).toBeNull()
    expect(shareTokenOf('http://localhost:5173/u/alice')).toBeNull()
  })
})
