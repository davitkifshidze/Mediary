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

/* საიდბარის განყოფილებების რიგი (ეტაპი 8) — ლექსიკონის გვერდი და საიდბარი
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
  it('starts with "all", ends with "favorite"', () => {
    expect(ids(arrangeSections(STATUSES, PSEUDO_SECTIONS.movie, EMPTY_LAYOUT))).toEqual([
      'all',
      'undecided',
      'to_watch',
      'watching',
      'watched',
      'favorite',
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
    const layout = { hidden: [], placement: placementFromRows(arrangeSections(STATUSES, PSEUDO_SECTIONS.movie, EMPTY_LAYOUT)) }
    const grown = [...STATUSES, status('abandoned', 4)]

    expect(ids(arrangeSections(grown, PSEUDO_SECTIONS.movie, layout)).slice(-2)).toEqual(['abandoned', 'favorite'])
  })

  it('drops a pseudo section with a dead anchor to the end instead of losing it', () => {
    const layout = { hidden: [], placement: [{ id: 'favorite', at: 'deleted_status' }] }

    expect(ids(arrangeSections(STATUSES, PSEUDO_SECTIONS.movie, layout)).at(-1)).toBe('favorite')
  })

  it('marks hidden rows but keeps them in the list', () => {
    const rows = arrangeSections(STATUSES, PSEUDO_SECTIONS.movie, { hidden: ['favorite', 'watched'], placement: [] })

    expect(rows).toHaveLength(6)
    expect(rows.filter((r) => r.hidden).map((r) => r.id)).toEqual(['watched', 'favorite'])
  })

  it('falls back to defaults when there are no statuses at all', () => {
    const rows = arrangeSections([], PSEUDO_SECTIONS.movie, EMPTY_LAYOUT)

    expect(ids(rows)).toEqual(['all', 'favorite'])
    expect(placementFromRows(rows)).toEqual([
      { id: 'all', at: 'start' },
      { id: 'favorite', at: 'end' },
    ])
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
