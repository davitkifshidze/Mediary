import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { FeedbackProvider } from '@/components/ui/feedback'
import { TooltipProvider } from '@/components/ui/tooltip'
import { EMPTY_SELECTION, type Suggestion, type SuggestionPage, type SuggestProgress } from '@/api/suggestions'
import type { Status } from '@/api/types'
import i18n from '@/i18n'
import { credentialShortName } from '@/lib/credentials'

/* ============================================================
   **„შემოთავაზებები"** — `/movies/suggestions` (სერიალსა და ანიმეზე იგივე გვერდია).

   ⚠️ მოწმდება: სანამ არაფერი შენახულა, საფუძველი ნანახი სათაურები და რჩეულებია; ახალ
   სათაურს „დამატება" (არჩეული სტატუსით), ტრეილერი და „არ მაინტერესებს" აქვს, ჩემსას —
   სტატუსი და „გახსნა"; „რატომ" ჩემს სათაურსა და წყაროს ასახელებს; არჩევანის ცვლილება
   მოდულზე ინახება და ახალ გაშვებას იწყებს; მასალის შეგროვებისას პროგრესი ჩანს; „თავიდან"
   ქეშის გვერდის ავლით ითხოვს; გასაღების არქონა თავის ტექსტს ამბობს; „დამალულებიდან"
   სათაური ბრუნდება.
   ============================================================ */

const status = (id: number, key: string, role: Status['role'], extra: Partial<Status> = {}): Status => ({
  id,
  key,
  module: 'movie',
  name_ka: key,
  name_en: key,
  role,
  icon: null,
  color: null,
  is_default: false,
  sort_order: id,
  ...extra,
})

const UNDECIDED = status(1, 'undecided', 'todo', { is_default: true })
const WATCHING = status(2, 'watching', 'doing')
const WATCHED = status(3, 'watched', 'done')

const mocks = vi.hoisted(() => ({
  fetchSuggestions: vi.fn(),
  fetchBasisPool: vi.fn(),
  setSuggestionHidden: vi.fn(),
  fetchSuggestionTrailer: vi.fn(),
  fetchGenres: vi.fn(),
  setStatus: vi.fn(),
  updateModuleSettings: vi.fn(),
  play: vi.fn(),
  // ⚠️ ყოველ გამოძახებაზე იგივე ობიექტი — სხვაგვარად ეფექტები უსასრულოდ ეშვება
  queue: { enqueue: vi.fn(), isQueued: vi.fn(() => false) },
  statuses: { data: [] as unknown[], isLoading: false },
  modules: {
    all: [{ key: 'movie', name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: '#3b6ea5', user_settings: {} as Record<string, unknown> }],
    enabled: [],
    mediaModules: [],
    pageModules: [],
    customModules: [],
    has: () => true,
    loading: false,
  },
}))

vi.mock('@/api/suggestions', async (original) => ({
  ...(await original<typeof import('@/api/suggestions')>()),
  fetchSuggestions: mocks.fetchSuggestions,
  fetchBasisPool: mocks.fetchBasisPool,
  setSuggestionHidden: mocks.setSuggestionHidden,
  fetchSuggestionTrailer: mocks.fetchSuggestionTrailer,
}))

const mediaApi = { setStatus: mocks.setStatus }
vi.mock('@/api/media', async (original) => ({
  ...(await original<typeof import('@/api/media')>()),
  fetchGenres: mocks.fetchGenres,
  mediaApi: () => mediaApi,
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  updateModuleSettings: mocks.updateModuleSettings,
}))

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useStatuses: () => mocks.statuses,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
}))

const player = { play: mocks.play }
vi.mock('@/lib/player', async (original) => ({
  ...(await original<typeof import('@/lib/player')>()),
  usePlayer: () => player,
}))

vi.mock('@/components/ui/queue', async (original) => ({
  ...(await original<typeof import('@/components/ui/queue')>()),
  useQueue: () => mocks.queue,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let lib: typeof import('@/pages/SuggestionsPage')

beforeAll(async () => {
  lib = await import('@/pages/SuggestionsPage')
}, 60_000)
vi.setConfig({ testTimeout: 15_000 })

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
  mocks.queue.isQueued.mockImplementation(() => false)
  mocks.modules.all[0].user_settings = {}
})

async function flush(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

const suggestion = (id: number, extra: Partial<Suggestion> = {}): Suggestion => ({
  tmdb_id: id,
  title: `Title ${id}`,
  title_ka: null,
  year: 2020,
  rating: 7.5,
  poster: `https://image.tmdb.org/t/p/w342/p${id}.jpg`,
  overview: `About ${id}`,
  overview_ka: null,
  genres: [{ name_en: 'Action', name_ka: null }],
  owned: false,
  record: null,
  hidden: false,
  score: 3,
  why: {
    bases: [{ id: 5, title_ka: null, title_en: 'Inception', sources: ['tmdb', 'trakt'] }],
    bases_total: 3,
    genres: [{ name_en: 'Action', name_ka: null }],
    keywords: ['heist'],
    plot: { id: 5, title_ka: null, title_en: 'Inception', match: 82 },
  },
  ...extra,
})

const page = (items: Suggestion[], extra: Partial<SuggestionPage> = {}): SuggestionPage => ({
  items,
  total: items.length,
  lastPage: 1,
  basis: {
    used: 2,
    total: 2,
    limit: 30,
    records: [
      { id: 5, title_ka: null, title_en: 'Inception', year: 2010, poster: null, is_favorite: true, status: WATCHED },
      { id: 6, title_ka: null, title_en: 'Heat', year: 1995, poster: null, is_favorite: false, status: WATCHED },
    ],
  },
  sources: { trakt: 'ok', anilist: 'off', gemini: 'ok' },
  counts: { all: items.length, mine: items.filter((i) => i.owned).length, new: items.filter((i) => !i.owned).length, hidden: 4 },
  plot: { vectors: 10, missing: 0 },
  ...extra,
})

function apiError(statusCode: number, data: Record<string, unknown>): AxiosError {
  const response = { status: statusCode, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data } as AxiosResponse

  return new AxiosError(`Request failed with status code ${statusCode}`, 'ERR_BAD_REQUEST', undefined, undefined, response)
}

async function mount(result: SuggestionPage | (() => Promise<SuggestionPage>) = page([suggestion(101)])) {
  mocks.statuses.data = [UNDECIDED, WATCHING, WATCHED]
  mocks.fetchGenres.mockResolvedValue([{ id: 1, slug: 'action', name_en: 'Action', name_ka: null }])
  mocks.updateModuleSettings.mockResolvedValue({})
  if (typeof result === 'function') mocks.fetchSuggestions.mockImplementation(result)
  else mocks.fetchSuggestions.mockResolvedValue(result)

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: ['/movies/suggestions'] },
        h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(lib.SuggestionsPage, { type: 'movie' })))),
      ),
    ),
  )
  await flush()
  await flush()
}

const all = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)]
const one = <T extends Element>(selector: string) => document.querySelector<T>(selector)
const click = async (el: Element | null | undefined) => {
  act(() => (el as HTMLElement).click())
  await flush()
}
/** ბოლო გაშვების არგუმენტები: `[type, selection, filters, page, perPage, options]` */
const lastRun = () => mocks.fetchSuggestions.mock.calls.at(-1)!

describe('SuggestionsPage', () => {
  it('starts from what I have watched plus favourites and says what the result stands on', async () => {
    await mount()

    const [type, selection, filters] = lastRun()
    expect(type).toBe('movie')
    expect(selection).toEqual({ ...EMPTY_SELECTION, statuses: ['watched'], favorite: true })
    expect(filters).toMatchObject({ cut: 'all', hidden: false })

    // მონიშნული ჩიპები: ნანახი და რჩეული
    const chips = all<HTMLButtonElement>('[data-testid="suggest-status"]')
    expect(chips.map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])
    expect(one('[data-testid="suggest-favorite"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(one('[data-testid="suggest-basis-used"]')?.textContent).toBe(i18n.t('suggest.basis.used', { count: 2 }))

    // ჯერ არაფერი შენახულა — ნაგულისხმევი არჩევანი თავისით არ იწერება
    expect(mocks.updateModuleSettings).not.toHaveBeenCalled()
  })

  it('says "N of M" when a big status was cut to the limit', async () => {
    const result = page([suggestion(101)])
    await mount({ ...result, basis: { ...result.basis, used: 30, total: 481 } })

    expect(one('[data-testid="suggest-basis-used"]')?.textContent).toBe(i18n.t('suggest.basis.usedOf', { used: 30, total: 481 }))
  })

  it('gives a new title add, trailer and "not interested", and explains why it is suggested', async () => {
    await mount()

    const card = one('[data-testid="suggestion"]')!
    expect(card.textContent).toContain('Title 101')
    expect(card.querySelector('[data-testid="suggestion-owned"]')).toBeNull()

    // „რატომ": ჩემი სათაური წყაროებით, დანარჩენი რიცხვით; სიუჟეტი, ჟანრები, თემები
    const why = card.querySelector('[data-testid="suggestion-why"]')!
    expect(why.querySelector('[data-why="bases"]')?.textContent).toBe(
      `${i18n.t('suggest.why.bases', { titles: 'Inception (TMDB, Trakt)' })} ${i18n.t('suggest.why.more', { count: 2 })}`,
    )
    expect(why.querySelector('[data-why="plot"]')?.textContent).toBe(i18n.t('suggest.why.plot', { title: 'Inception', match: 82 }))
    expect(why.querySelector('[data-why="genres"]')?.textContent).toBe(i18n.t('suggest.why.genres', { genres: 'Action' }))
    expect(why.querySelector('[data-why="keywords"]')?.textContent).toBe(i18n.t('suggest.why.keywords', { keywords: 'heist' }))

    // დამატება — ლექსიკონის ნაგულისხმევი სტატუსით, „აღმოჩენის" რიგით
    await click(card.querySelector('[data-testid="suggestion-add"]'))
    expect(mocks.queue.enqueue).toHaveBeenCalledWith([{ tmdbId: 101, title: 'Title 101', status: 'undecided' }], 'movie')

    mocks.setSuggestionHidden.mockResolvedValue({ hidden: true, count: 5 })
    await click(card.querySelector('[data-testid="suggestion-hide"]'))
    expect(mocks.setSuggestionHidden).toHaveBeenCalledWith('movie', expect.objectContaining({ tmdb_id: 101 }), true)
  })

  it('plays the trailer in the app player and says so when there is none', async () => {
    await mount()

    mocks.fetchSuggestionTrailer.mockResolvedValueOnce({ url: 'https://www.youtube.com/watch?v=abc', embed_url: 'https://e/abc', platform: 'youtube' })
    await click(one('[data-testid="suggestion-trailer"]'))

    expect(mocks.fetchSuggestionTrailer).toHaveBeenCalledWith('movie', 101)
    expect(mocks.play).toHaveBeenCalledTimes(1)
    expect(mocks.play.mock.calls[0][0][0]).toMatchObject({ kind: 'link', id: 101, title: 'Title 101', embedUrl: 'https://e/abc' })

    mocks.fetchSuggestionTrailer.mockResolvedValueOnce(null)
    await click(one('[data-testid="suggestion-trailer"]'))

    expect(mocks.play).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain(i18n.t('suggest.trailerMissing'))
  })

  it('shows my own unwatched title with its status and an open button instead of add', async () => {
    await mount(page([suggestion(101, { owned: true, record: { id: 44, status: UNDECIDED, is_favorite: false } })]))

    const card = one('[data-testid="suggestion"]')!
    expect(card.querySelector('[data-testid="suggestion-owned"]')?.textContent).toBe(i18n.t('suggest.inLibrary'))
    expect(card.querySelector('[data-testid="suggestion-add"]')).toBeNull()
    expect(card.querySelector('[data-testid="suggestion-hide"]')).toBeNull()
    expect(card.querySelector('[data-testid="suggestion-open"]')).not.toBeNull()
    // „ყველა ნაჩვენები ახლის" ღილაკი ჩემს სათაურს არ ითვლის
    expect(one<HTMLButtonElement>('[data-testid="suggest-add-shown"]')?.disabled).toBe(true)
  })

  it('adds every new title on the page at once, skipping what is mine or already queued', async () => {
    mocks.queue.isQueued.mockImplementation((id?: number) => id === 103)
    await mount(page([suggestion(101), suggestion(102, { owned: true, record: { id: 9, status: null, is_favorite: false } }), suggestion(103), suggestion(104)]))

    await click(one('[data-testid="suggest-add-shown"]'))

    expect(mocks.queue.enqueue).toHaveBeenCalledWith(
      [
        { tmdbId: 101, title: 'Title 101', status: 'undecided' },
        { tmdbId: 104, title: 'Title 104', status: 'undecided' },
      ],
      'movie',
    )
  })

  it('remembers a changed basis on the module and starts a new run with it', async () => {
    await mount()
    const runs = mocks.fetchSuggestions.mock.calls.length

    // „ვუყურებ" ემატება — ცვლილება ცოტა ხანს ელოდება და ერთ გაშვებად მიდის
    await click(all('[data-testid="suggest-status"]')[1])
    expect(mocks.fetchSuggestions.mock.calls.length).toBe(runs)

    await flush(500)

    const picked = { ...EMPTY_SELECTION, statuses: ['watched', 'watching'], favorite: true }
    expect(mocks.updateModuleSettings).toHaveBeenCalledWith('movie', { suggest: picked })
    expect(mocks.fetchSuggestions.mock.calls.length).toBeGreaterThan(runs)
    expect(lastRun()[1]).toEqual(picked)
  })

  it('uses the saved basis and asks to choose when nothing is selected', async () => {
    mocks.modules.all[0].user_settings = { suggest: { statuses: [], favorite: false } }
    const empty = page([])
    await mount({ ...empty, basis: { ...empty.basis, used: 0, total: 0, records: [] } })

    expect(lastRun()[1]).toEqual(EMPTY_SELECTION)
    expect(document.body.textContent).toContain(i18n.t('suggest.emptyBasisTitle'))
    expect(one('[data-testid="suggestion"]')).toBeNull()
    // ამრჩევი ავზის გარეშე არ იხსნება, „თავიდან" კი არაფერს გაუშვებდა
    expect(one<HTMLButtonElement>('[data-testid="suggest-pick"]')?.disabled).toBe(true)
    expect(one<HTMLButtonElement>('[data-testid="suggest-refresh"]')?.disabled).toBe(true)
  })

  it('shows the progress while the server collects the material', async () => {
    let finish!: (value: SuggestionPage) => void
    await mount(
      () =>
        new Promise<SuggestionPage>((resolve) => {
          finish = resolve
          const onProgress = lastRun()[5].onProgress as (progress: SuggestProgress | null) => void
          onProgress({ stage: 'sources', done: 3, total: 10 })
        }),
    )

    const progress = one('[data-testid="suggest-progress"]')!
    expect(progress.textContent).toContain(i18n.t('suggest.progress.sources'))
    expect(progress.textContent).toContain('3 / 10')
    expect(one('[data-testid="suggestion"]')).toBeNull()

    await act(async () => finish(page([suggestion(101)])))
    await flush()

    expect(one('[data-testid="suggest-progress"]')).toBeNull()
    expect(all('[data-testid="suggestion"]')).toHaveLength(1)
  })

  it('"start over" asks once past the cache', async () => {
    await mount()
    expect(lastRun()[5].refresh).toBe(false)

    await click(one('[data-testid="suggest-refresh"]'))

    expect(lastRun()[5].refresh).toBe(true)
  })

  it('filters the result by cut and lists the hidden titles with a way back', async () => {
    await mount()

    await click([...all<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(i18n.t('suggest.cut.mine'))))
    expect(lastRun()[2]).toMatchObject({ cut: 'mine', hidden: false })

    mocks.fetchSuggestions.mockResolvedValue(page([suggestion(900, { hidden: true, why: null, score: null, genres: [], overview: null })]))
    await click(one('[data-testid="suggest-hidden"]'))
    expect(lastRun()[2]).toMatchObject({ hidden: true })

    const card = one('[data-testid="suggestion"]')!
    expect(card.querySelector('[data-testid="suggestion-add"]')).toBeNull()

    mocks.setSuggestionHidden.mockResolvedValue({ hidden: false, count: 3 })
    await click(card.querySelector('[data-testid="suggestion-restore"]'))
    expect(mocks.setSuggestionHidden).toHaveBeenCalledWith('movie', expect.objectContaining({ tmdb_id: 900 }), false)
  })

  it('names a skipped or failing source and what the plot comparison still lacks', async () => {
    await mount(page([suggestion(101)], { sources: { trakt: 'missing', anilist: 'off', gemini: 'failed' }, plot: { vectors: 3, missing: 7 } }))

    const notes = one('[data-testid="suggest-sources"]')!
    expect(notes.querySelector('[data-source="trakt-missing"]')?.textContent).toContain(i18n.t('suggest.source.missing', { source: 'Trakt' }))
    expect(notes.querySelector('[data-source="trakt-missing"] a')?.getAttribute('href')).toBe('/credentials')
    expect(notes.querySelector('[data-source="gemini-failed"]')?.textContent).toBe(i18n.t('suggest.source.gemini.failed'))
    // „ამ მოდულს არ ეხება" შენიშვნა არ არის
    expect(notes.textContent).not.toContain('AniList')
  })

  it('says nothing about sources that work', async () => {
    await mount()

    expect(one('[data-testid="suggest-sources"]')).toBeNull()
  })

  it('tells a missing TMDB key apart from an empty result', async () => {
    await mount(() => Promise.reject(apiError(409, { message: 'credential_missing', provider: 'tmdb' })))

    expect(document.body.textContent).toContain(i18n.t('errors.credential_missing_for', { provider: credentialShortName('tmdb') }))
    expect(document.body.textContent).not.toContain(i18n.t('suggest.emptyTitle'))
  })

  it('picks the basis titles by hand from the chosen statuses', async () => {
    mocks.fetchBasisPool.mockResolvedValue({
      total: 12,
      limit: 30,
      data: [
        { id: 5, title_ka: null, title_en: 'Inception', year: 2010, poster: null, is_favorite: true, status: WATCHED },
        { id: 6, title_ka: null, title_en: 'Heat', year: 1995, poster: null, is_favorite: false, status: WATCHED },
      ],
    })
    await mount()

    await click(one('[data-testid="suggest-pick"]'))
    expect(mocks.fetchBasisPool).toHaveBeenCalledWith('movie', expect.objectContaining({ statuses: ['watched'], favorite: true }), '')

    const rows = all<HTMLButtonElement>('[data-testid="basis-row"]')
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining('Inception'), expect.stringContaining('Heat')])

    await click(rows[1])
    expect(rows[1].getAttribute('aria-pressed')).toBe('true')
    await click(one('[data-testid="basis-apply"]'))
    await flush(500)

    expect(lastRun()[1]).toMatchObject({ statuses: ['watched'], ids: [6] })
    expect(all('[data-testid="suggest-picked"]').map((chip) => chip.textContent)).toEqual(['Heat'])
  })
})
