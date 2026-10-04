import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { DrillChips } from '@/components/DrillChips'
import { drillChips, genreLink, monthLink, ratingLink, statusLink, yearLink } from '@/lib/statsLinks'
import i18n from '@/i18n'

/* ============================================================
   **სტატისტიკიდან სიაზე** (Tasks §49.3) — ბმულები და ჭრილის ჩიპები.

   მოწმდება: თითო მოდულის პარამეტრი (მედიის ჟანრი slug-ით, ვიდეოს ტიპი,
   კურსის სტატუსი `status`-ით, პირადი მოდულის კატეგორია), „სხვა" ბმული
   არაა, თვე — მედიაზე ნახვა, სხვაზე დასრულება, მორიგეობაზე კალენდარი,
   გალერეაზე — არაფერი; ქულის კალათა (6.5…7.4); ჩიპი სიაზე და მისი მოხსნა.
   ============================================================ */

const status = (key: string | null) => ({ key, name_ka: null, name_en: null, role: null, color: null, count: 1 })
const genre = (id: number, slug: string | null = null) => ({ id, name_ka: null, name_en: null, slug, count: 1 })

describe('stats links', () => {
  it('a genre opens the list with that module own parameter', () => {
    expect(genreLink('movie', '/movies', genre(5, 'drama'))).toBe('/movies?genre=drama')
    expect(genreLink('anime', '/anime', genre(5))).toBeNull()
    expect(genreLink('video', '/videos', genre(3))).toBe('/videos?type=3')
    expect(genreLink('book', '/books', genre(2))).toBe('/books?genre=2')
    expect(genreLink('note', '/notes', genre(4))).toBe('/notes?category=4')
    expect(genreLink('c1-recipes', '/c/c1-recipes', genre(4))).toBe('/c/c1-recipes?category=4')
    // „სხვა" რამდენიმე ჟანრია — ერთი ფილტრი ვერ იქნება
    expect(genreLink('movie', '/movies', genre(0))).toBeNull()
    expect(genreLink('personal', '/personal', genre(1))).toBeNull()
  })

  it('a status uses the sidebar section, or the filter on courses and places', () => {
    expect(statusLink('movie', '/movies', status('watched'))).toBe('/movies?view=watched')
    expect(statusLink('book', '/books', status('read'))).toBe('/books?view=read')
    expect(statusLink('course', '/courses', status('done'))).toBe('/courses?status=done')
    expect(statusLink('place', '/places', status('visited'))).toBe('/places?status=visited')
    expect(statusLink('movie', '/movies', status(null))).toBeNull()
  })

  it('a month is the watch log on media, the finish date elsewhere, the calendar on duty', () => {
    expect(monthLink('movie', '/movies', 2026, 3)).toBe('/movies?watched=2026-03')
    expect(monthLink('book', '/books', 2026, 3)).toBe('/books?done=2026-03')
    expect(monthLink('duty', '/duty', 2026, 11)).toBe('/duty?date=2026-11-01')
    expect(monthLink('personal', '/personal', 2026, 3)).toBeNull()
  })

  it('a year and a rating bucket match the bar', () => {
    expect(yearLink('song', '/songs', 2011)).toBe('/songs?year_min=2011&year_max=2011')
    // `round()`-ის კალათა: 7 = 6.5…7.4
    expect(ratingLink('movie', '/movies', 7)).toBe('/movies?my_rating_min=6.5&my_rating_max=7.4')
    expect(ratingLink('book', '/books', 10)).toBe('/books?my_rating_min=9.5&my_rating_max=10.4')
  })

  it('chips read a whole bucket as one score and a range as a range', () => {
    expect(drillChips({ my_rating_min: '6.5', my_rating_max: '7.4' })).toEqual([
      { kind: 'rating', value: '7', keys: ['my_rating_min', 'my_rating_max'] },
    ])
    expect(drillChips({ year_min: '2011', year_max: '2011', done: '2026-03' }).map((c) => [c.kind, c.value])).toEqual([
      ['done', '2026-03'],
      ['year', '2011'],
    ])
    expect(drillChips({ year_min: '2000', year_max: '2010' })[0].value).toBe('2000–2010')
    expect(drillChips({})).toEqual([])
  })
})

/* ---------- ჩიპი სიაზე ---------- */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null
let location = ''

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

function Where() {
  const at = useLocation()
  location = at.pathname + at.search
  return null
}

describe('DrillChips', () => {
  it('shows the slice from the stats page and removes it on click', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root!.render(
        h(MemoryRouter, {
          initialEntries: ['/books?done=2026-03&my_rating_min=6.5&my_rating_max=7.4&page=2'],
          children: [h(Where, { key: 'where' }), h(DrillChips, { key: 'chips' })],
        }),
      ),
    )

    const chips = [...document.querySelectorAll<HTMLButtonElement>('[data-drill]')]
    expect(chips.map((c) => c.textContent)).toEqual([
      i18n.t('drill.done', { month: `${i18n.t('stats.month.3')} 2026` }),
      i18n.t('drill.rating', { score: '7' }),
    ])

    await act(async () => chips[1].click())
    // ⚠️ ჭრილის შეცვლა სიას პირველ გვერდზე აბრუნებს
    expect(location).toBe('/books?done=2026-03')
    expect(document.querySelectorAll('[data-drill]')).toHaveLength(1)
  })
})
