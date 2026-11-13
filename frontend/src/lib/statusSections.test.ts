import { describe, expect, it } from 'vitest'
import type { Status } from '@/api/types'
import {
  EMPTY_LAYOUT,
  PSEUDO_SECTIONS,
  arrangeSections,
  placementFromRows,
  readLayout,
  sectionSearch,
  toggleHidden,
  type SectionRow,
} from './statusSections'

/* საიდბარის განყოფილებების რიგი — ლექსიკონის გვერდი და საიდბარი
   ერთსა და იმავე ფუნქციას ეკითხება, ე.ი. ეს ტესტი ორივეს ფარავს. */

const status = (key: string, i: number) =>
  ({
    id: i + 1,
    key,
    module: 'movie',
    name_ka: key,
    name_en: key,
    role: 'todo',
    icon: null,
    color: null,
    is_default: false,
    sort_order: i + 1,
  }) as unknown as Status

const STATUSES = ['undecided', 'to_watch', 'watching', 'watched'].map(status)
const ids = (rows: SectionRow[]) => rows.map((r) => r.id)

/** `id`-ის ამოღება და `index`-ზე ჩასმა — ზუსტად ის, რასაც გადათრევა აკეთებს */
function move(rows: SectionRow[], id: string, index: number): SectionRow[] {
  const row = rows.find((r) => r.id === id)!
  const rest = rows.filter((r) => r.id !== id)
  rest.splice(index, 0, row)
  return rest
}

describe('arrangeSections', () => {
  // მედიას „მალე", „ჩაკეტილები" და „სინქრონიზაციაც" აქვს, „რჩეულის" შემდეგ
  it('starts with "all", ends with "favorite", "soon", "locked" and "sync"', () => {
    expect(ids(arrangeSections(STATUSES, PSEUDO_SECTIONS.series, EMPTY_LAYOUT))).toEqual([
      'all',
      'undecided',
      'to_watch',
      'watching',
      'watched',
      'favorite',
      'soon',
      'suggestions',
      'locked',
      'sync',
    ])
  })

  it('keeps video "downloaded" before "favorite"', () => {
    const rows = arrangeSections(STATUSES, PSEUDO_SECTIONS.video, EMPTY_LAYOUT)
    expect(ids(rows).slice(-2)).toEqual(['downloaded', 'favorite'])
  })

  it('round-trips "favorite" moved between statuses', () => {
    const moved = move(arrangeSections(STATUSES, PSEUDO_SECTIONS.movie, EMPTY_LAYOUT), 'favorite', 3)
    const layout = { hidden: [], placement: placementFromRows(moved) }

    expect(layout.placement).toContainEqual({ id: 'favorite', at: 'to_watch' })
    expect(ids(arrangeSections(STATUSES, PSEUDO_SECTIONS.movie, layout))).toEqual(ids(moved))
  })

  it('round-trips "all" at the end and "favorite" at the start', () => {
    let rows = arrangeSections(STATUSES, PSEUDO_SECTIONS.movie, EMPTY_LAYOUT)
    rows = move(rows, 'all', rows.length - 1)
    rows = move(rows, 'favorite', 0)
    const layout = { hidden: [], placement: placementFromRows(rows) }

    expect(ids(arrangeSections(STATUSES, PSEUDO_SECTIONS.movie, layout))).toEqual(ids(rows))
  })

  /* ⚠️ სწორედ ამიტომ ანკერია და არა ინდექსი — ახალი სტატუსი ბოლოს ემატება */
  it('puts a new status before an end-anchored "favorite"', () => {
    const layout = { hidden: [], placement: placementFromRows(arrangeSections(STATUSES, PSEUDO_SECTIONS.series, EMPTY_LAYOUT)) }
    const grown = [...STATUSES, status('abandoned', 4)]

    expect(ids(arrangeSections(grown, PSEUDO_SECTIONS.series, layout)).slice(-6)).toEqual(['abandoned', 'favorite', 'soon', 'suggestions', 'locked', 'sync'])
  })

  it('drops a pseudo section with a dead anchor to the end instead of losing it', () => {
    const layout = { hidden: [], placement: [{ id: 'favorite', at: 'deleted_status' }] }

    expect(ids(arrangeSections(STATUSES, PSEUDO_SECTIONS.series, layout)).slice(-5)).toEqual(['favorite', 'soon', 'suggestions', 'locked', 'sync'])
  })

  it('marks hidden rows but keeps them in the list', () => {
    const rows = arrangeSections(STATUSES, PSEUDO_SECTIONS.series, { hidden: ['favorite', 'watched'], placement: [] })

    expect(rows).toHaveLength(10)
    expect(rows.filter((r) => r.hidden).map((r) => r.id)).toEqual(['watched', 'favorite'])
  })

  it('falls back to defaults when there are no statuses at all', () => {
    const rows = arrangeSections([], PSEUDO_SECTIONS.series, EMPTY_LAYOUT)

    expect(ids(rows)).toEqual(['all', 'favorite', 'soon', 'suggestions', 'locked', 'sync'])
    expect(placementFromRows(rows)).toEqual([
      { id: 'all', at: 'start' },
      { id: 'favorite', at: 'end' },
      { id: 'soon', at: 'end' },
      { id: 'suggestions', at: 'end' },
      { id: 'locked', at: 'end' },
      { id: 'sync', at: 'end' },
    ])
  })
})

describe('pseudo sections', () => {
  /* „სინქრონიზაცია" ბმულია ცალკე გვერდზე (`path`) და დამალვამდე გაფრთხილება აქვს;
     სიის სექციებს (`მალე`, `ჩაკეტილი`) არც ერთი არ აქვს */
  it('marks sync as a link with a hide warning — on all three media modules', () => {
    for (const domain of ['movie', 'series', 'anime'] as const) {
      const sync = PSEUDO_SECTIONS[domain].find((s) => s.id === 'sync')!
      expect(sync.path).toBe('/sync')
      expect(sync.hideWarningKey).toBe('mediaSync.hideWarning')
      expect(
        PSEUDO_SECTIONS[domain].filter((s) => !['sync', 'franchises', 'suggestions'].includes(s.id)).every((s) => !s.path && !s.hideWarningKey),
      ).toBe(true)
    }
    expect(PSEUDO_SECTIONS.video.some((s) => s.id === 'sync')).toBe(false)
  })

  /* „ფრანჩაიზები" მხოლოდ ფილმებს აქვს (TMDB-ის კოლექცია): ბმულია თავის გვერდზე,
     „მალეს" შემდეგ დგას და დამალვის გაფრთხილება არ სჭირდება */
  it('gives movies alone a franchises link after "soon"', () => {
    expect(ids(arrangeSections([], PSEUDO_SECTIONS.movie, EMPTY_LAYOUT))).toEqual(['all', 'favorite', 'soon', 'franchises', 'suggestions', 'locked', 'sync'])

    const franchises = PSEUDO_SECTIONS.movie.find((s) => s.id === 'franchises')!
    expect(franchises.path).toBe('/franchises')
    expect(franchises.hideWarningKey).toBeUndefined()

    for (const domain of ['series', 'anime', 'video', 'note', 'bookmark'] as const) {
      expect(PSEUDO_SECTIONS[domain].some((s) => s.id === 'franchises')).toBe(false)
    }
  })

  /* „შემოთავაზებები" სამივე მედია-მოდულს აქვს — ბმულია თავის გვერდზე, „ჩაკეტილის" წინ;
     სხვა მოდულებს მსგავსების წყარო არ აქვთ */
  it('gives the three media modules a suggestions link', () => {
    for (const domain of ['movie', 'series', 'anime'] as const) {
      const suggestions = PSEUDO_SECTIONS[domain].find((s) => s.id === 'suggestions')!
      expect(suggestions.path).toBe('/suggestions')
      expect(suggestions.hideWarningKey).toBeUndefined()

      const order = PSEUDO_SECTIONS[domain].map((s) => s.id)
      expect(order.indexOf('suggestions')).toBe(order.indexOf('locked') - 1)
    }

    for (const domain of ['video', 'note', 'bookmark'] as const) {
      expect(PSEUDO_SECTIONS[domain].some((s) => s.id === 'suggestions')).toBe(false)
    }
  })
})

describe('readLayout', () => {
  it('tolerates missing and malformed settings', () => {
    expect(readLayout(undefined)).toEqual(EMPTY_LAYOUT)
    expect(readLayout({ status_sections: 'nope' })).toEqual(EMPTY_LAYOUT)
    expect(
      readLayout({
        status_sections: { hidden: ['watched', 3], placement: [{ id: 'all', at: 'start' }, { id: 1 }] },
      }),
    ).toEqual({ hidden: ['watched'], placement: [{ id: 'all', at: 'start' }] })
  })
})

describe('toggleHidden / sectionSearch', () => {
  it('toggles one id and leaves the placement alone', () => {
    const placement = [{ id: 'all', at: 'start' }]
    const hiddenOnce = toggleHidden({ hidden: [], placement }, 'favorite')

    expect(hiddenOnce).toEqual({ hidden: ['favorite'], placement })
    expect(toggleHidden(hiddenOnce, 'favorite').hidden).toEqual([])
  })

  it('"all" has no ?view=', () => {
    const [all, first] = arrangeSections(STATUSES, PSEUDO_SECTIONS.movie, EMPTY_LAYOUT)

    expect(sectionSearch(all)).toBe('')
    expect(sectionSearch(first)).toBe('view=undecided')
  })
})
