import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_FILTERS, EMPTY_SELECTION, fetchSuggestions, selectionParams, type SuggestSelection } from '@/api/suggestions'
import type { Status } from '@/api/types'
import { defaultSelection, narrowingCount, readSelection } from '@/lib/suggest'

/* ============================================================
   **„შემოთავაზებების" საფუძვლის არჩევანი და მოთხოვნის გამეორება**.

   ⚠️ მოწმდება: შენახული ბლობი ნებისმიერი იყოს — დაზიანებული ველი ცარიელია, არაფერი კი
   „ჯერ არ შენახულა"; ნაგულისხმევი საფუძველი ნანახია (როლით და არა სახელით) და რჩეული;
   საფუძვლის ფილტრები მოთხოვნაში `b_` თავსართით მიდის; სანამ მასალა გროვდება, მოთხოვნა
   მეორდება, „თავიდან" კი მხოლოდ პირველს მიჰყვება.
   ============================================================ */

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/lib/api', () => ({ api: { get: mocks.get } }))

const status = (key: string, role: Status['role']): Status => ({
  id: key.length,
  key,
  module: 'movie',
  name_ka: key,
  name_en: key,
  role,
  icon: null,
  color: null,
  is_default: false,
  sort_order: 0,
})

beforeEach(() => vi.clearAllMocks())

describe('readSelection', () => {
  it('returns null until something was saved', () => {
    expect(readSelection(undefined)).toBeNull()
    expect(readSelection({})).toBeNull()
    expect(readSelection({ suggest: 'watched' })).toBeNull()
    expect(readSelection({ suggest: ['watched'] })).toBeNull()
  })

  it('keeps what is well-formed and empties what is not', () => {
    expect(
      readSelection({
        suggest: { statuses: ['watched', 5, null], favorite: 'yes', ids: [3, '4', -1, 2.5], genre: 'action', yearMin: '2000', yearMax: 2010 },
      }),
    ).toEqual({ ...EMPTY_SELECTION, statuses: ['watched'], favorite: false, ids: [3], yearMin: '2000' })
  })
})

describe('defaultSelection / narrowingCount', () => {
  it('starts from what I have watched — by role, not by name — plus favourites', () => {
    const picked = defaultSelection([status('undecided', 'todo'), status('watching', 'doing'), status('seen', 'done'), status('rewatched', 'done')])

    expect(picked).toEqual({ ...EMPTY_SELECTION, statuses: ['seen', 'rewatched'], favorite: true })
  })

  it('counts each narrowing once, a range by either end', () => {
    expect(narrowingCount(EMPTY_SELECTION)).toBe(0)
    expect(narrowingCount({ ...EMPTY_SELECTION, genre: ['action', 'drama'], yearMin: '2000', yearMax: '2010', ratingMax: '8' })).toBe(3)
  })
})

describe('selectionParams', () => {
  it('sends the basis filters with a b_ prefix and drops what is empty', () => {
    const selection: SuggestSelection = { ...EMPTY_SELECTION, statuses: ['watched', 'watching'], favorite: true, ids: [4, 9], genre: ['action'], yearMin: ' 2000 ', ratingMax: '8.5' }

    expect(selectionParams(selection)).toEqual({
      statuses: 'watched,watching',
      favorite: 1,
      ids: '4,9',
      b_genre: 'action',
      b_year_min: '2000',
      b_year_max: undefined,
      b_my_rating_min: undefined,
      b_my_rating_max: undefined,
      b_rating_min: undefined,
      b_rating_max: '8.5',
    })
    expect(selectionParams(EMPTY_SELECTION).statuses).toBeUndefined()
    expect(selectionParams(EMPTY_SELECTION).favorite).toBeUndefined()
  })
})

describe('fetchSuggestions', () => {
  const basis = { used: 2, total: 2, limit: 30, records: [] }
  const sources = { trakt: 'ok', anilist: 'off', gemini: 'missing' }
  const waiting = (done: number) => ({ data: { ready: false, progress: { stage: 'sources', done, total: 2 }, basis, sources, counts: null, plot: null, data: [], meta: null } })
  const ready = {
    data: {
      ready: true,
      progress: null,
      basis,
      sources,
      counts: { all: 1, mine: 0, new: 1, hidden: 0 },
      plot: { vectors: 0, missing: 0 },
      data: [{ tmdb_id: 7 }],
      meta: { total: 41, last_page: 3 },
    },
  }

  it('repeats the request while the material is being collected and reports the progress', async () => {
    mocks.get.mockResolvedValueOnce(waiting(0)).mockResolvedValueOnce(waiting(1)).mockResolvedValueOnce(ready)
    const onProgress = vi.fn()

    const page = await fetchSuggestions('series', { ...EMPTY_SELECTION, statuses: ['watched'] }, { ...EMPTY_FILTERS, cut: 'new', ratingMin: '6' }, 2, 12, {
      refresh: true,
      onProgress,
    })

    expect(mocks.get).toHaveBeenCalledTimes(3)
    expect(mocks.get.mock.calls[0][0]).toBe('/series/suggestions')
    expect(mocks.get.mock.calls[0][1].params).toMatchObject({ statuses: 'watched', cut: 'new', rating_min: '6', page: 2, per_page: 12, refresh: 1 })
    // „თავიდან" მხოლოდ პირველს მიჰყვება — თორემ ყოველი გამეორება ქეშს თავიდან დაცლიდა
    expect(mocks.get.mock.calls[1][1].params.refresh).toBeUndefined()
    expect(mocks.get.mock.calls[2][1].params.refresh).toBeUndefined()

    expect(onProgress.mock.calls.map(([progress]) => progress?.done ?? null)).toEqual([0, 1, null])
    expect(page).toMatchObject({ items: [{ tmdb_id: 7 }], total: 41, lastPage: 3, basis, counts: { all: 1, new: 1 } })
  })

  it('does not send the default cut or an empty filter', async () => {
    mocks.get.mockResolvedValueOnce(ready)

    await fetchSuggestions('movie', EMPTY_SELECTION, EMPTY_FILTERS, 1, 9)

    const { params } = mocks.get.mock.calls[0][1]
    expect(mocks.get.mock.calls[0][0]).toBe('/movies/suggestions')
    expect(params.cut).toBeUndefined()
    expect(params.hidden).toBeUndefined()
    expect(params.genre).toBeUndefined()
    expect(params.refresh).toBeUndefined()
  })
})
