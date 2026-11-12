import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { FranchisePage, FranchisePartRow, FranchiseRow } from '@/api/media'

/* ============================================================
   **„ფრანჩაიზები"** — ფილმების ქვემენიუს გვერდი.

   ⚠️ მოწმდება: ჩემი ნაწილი ჩანაწერზე ბმულია, ნაკლულს „დამატება" და „აღარ შემახსენო"
   აქვს; „ყველა ნაკლულის დამატება" გაჩუმებულ ნაწილს რიგში არ აყენებს; გაჩუმება ნაწილზე
   `tmdb_id`-ით მიდის, ფრანჩაიზზე — მის გარეშე, და გაჩუმებულზე იგივე ღილაკი ისევ რთავს;
   ჩიპები სრულებსა და დადუმებულებს ითხოვს და მათ რიცხვს წერს; `?open=` ფრანჩაიზს
   სერვერს გადასცემს და გამოკვეთს.
   ============================================================ */

const part = (tmdbId: number, title: string, extra: Partial<FranchisePartRow> = {}): FranchisePartRow => ({
  tmdb_id: tmdbId,
  title,
  year: 2003,
  date: '2003-05-15',
  released: true,
  rating: 7,
  poster: null,
  owned: false,
  movie_id: null,
  muted: false,
  ...extra,
})

const saga = (extra: Partial<FranchiseRow> = {}): FranchiseRow => ({
  collection_id: 2344,
  name: 'The Matrix Collection',
  muted: false,
  state: 'open',
  owned: 1,
  total: 4,
  missing: 2,
  parts: [
    part(603, 'The Matrix', { year: 1999, owned: true, movie_id: 15 }),
    part(604, 'Reloaded'),
    part(605, 'Revolutions', { muted: true }),
    part(606, 'Matrix 5', { year: null, date: '2031-01-01', released: false }),
  ],
  ...extra,
})

const page = (items: FranchiseRow[], counts = { open: items.length, complete: 3, muted: 1 }): FranchisePage => ({
  items,
  total: items.length,
  lastPage: 1,
  counts,
})

const mocks = vi.hoisted(() => ({
  fetchFranchises: vi.fn(),
  setFranchiseReminder: vi.fn(),
  // ⚠️ ყოველ გამოძახებაზე იგივე ობიექტი — სხვაგვარად ეფექტები უსასრულოდ ეშვება
  queue: { enqueue: vi.fn(), isQueued: vi.fn(() => false) },
  modules: {
    all: [{ key: 'movie', name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: '#3b6ea5' }],
    enabled: [],
    mediaModules: [],
    pageModules: [],
    customModules: [],
    has: () => true,
    loading: false,
  },
}))

vi.mock('@/api/media', async (original) => ({
  ...(await original<typeof import('@/api/media')>()),
  fetchFranchises: mocks.fetchFranchises,
  setFranchiseReminder: mocks.setFranchiseReminder,
}))

vi.mock('@/components/ui/queue', async (original) => ({
  ...(await original<typeof import('@/components/ui/queue')>()),
  useQueue: () => mocks.queue,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let lib: typeof import('@/pages/FranchisesPage')

beforeAll(async () => {
  lib = await import('@/pages/FranchisesPage')
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
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(url = '/movies/franchises') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: [url] },
        h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(lib.FranchisesPage)))),
      ),
    ),
  )
  await flush()
  await flush()
}

const all = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)]
const click = async (el: Element | null | undefined) => {
  act(() => (el as HTMLElement).click())
  await flush()
}

describe('FranchisesPage', () => {
  it('draws my part as a link and a missing part with its two actions', async () => {
    mocks.fetchFranchises.mockResolvedValue(page([saga()]))
    await mount()

    expect(mocks.fetchFranchises).toHaveBeenCalledWith(expect.objectContaining({ complete: false, muted: false, open: null, page: 1 }))

    const parts = all<HTMLElement>('[data-testid="franchise-part"]')
    expect(parts).toHaveLength(4)
    expect(parts[0].tagName).toBe('A')
    expect(parts[0].getAttribute('href')).toBe('/movies/15')
    expect(parts[0].querySelector('button')).toBeNull()

    // ნაკლულს ორი ღილაკი აქვს; გამოუსვლელს — „მალე" და თარიღი წლის ნაცვლად
    expect(parts.slice(1).every((row) => row.querySelectorAll('button').length === 2)).toBe(true)
    expect(parts[3].textContent).toContain('2031')
    expect(document.querySelector('[data-testid="franchise-have"]')!.textContent).toMatch(/1.*4/)
    expect(document.querySelector('[data-testid="franchise"]')!.hasAttribute('data-focused')).toBe(false)
  })

  it('queues one part, or every missing part that is not muted', async () => {
    mocks.fetchFranchises.mockResolvedValue(page([saga()]))
    await mount()

    await click(all('[data-testid="franchise-add"]')[0])
    expect(mocks.queue.enqueue).toHaveBeenLastCalledWith([{ tmdbId: 604, title: 'Reloaded' }], 'movie')

    // გაჩუმებული „Revolutions" განზრახ გამორჩეულია — რიგში არ დგება
    const addAll = document.querySelector('[data-testid="franchise-add-all"]')!
    expect(addAll.querySelector('[data-testid="count-badge"]')!.textContent).toBe('2')
    await click(addAll)
    expect(mocks.queue.enqueue).toHaveBeenLastCalledWith(
      [
        { tmdbId: 604, title: 'Reloaded' },
        { tmdbId: 606, title: 'Matrix 5' },
      ],
      'movie',
    )
  })

  it('mutes a part by its id and the franchise without one, and unmutes with the same buttons', async () => {
    mocks.fetchFranchises.mockResolvedValue(page([saga()]))
    mocks.setFranchiseReminder.mockResolvedValue(undefined)
    await mount()

    const mutes = all('[data-testid="franchise-part-mute"]')
    await click(mutes[0])
    expect(mocks.setFranchiseReminder).toHaveBeenLastCalledWith(2344, true, 604)

    // უკვე გაჩუმებულ ნაწილზე იგივე ღილაკი ისევ რთავს
    await click(all('[data-testid="franchise-part-mute"]')[1])
    expect(mocks.setFranchiseReminder).toHaveBeenLastCalledWith(2344, false, 605)

    await click(document.querySelector('[data-testid="franchise-mute"]'))
    expect(mocks.setFranchiseReminder).toHaveBeenLastCalledWith(2344, true, undefined)
    // ყოველი ცვლილების შემდეგ სია თავიდან იკითხება
    expect(mocks.fetchFranchises.mock.calls.length).toBeGreaterThanOrEqual(4)
  })

  it('asks for complete and muted franchises through the chips and shows their counts', async () => {
    mocks.fetchFranchises.mockResolvedValue(page([saga()]))
    await mount()

    expect(document.querySelector('[data-testid="franchises-complete"]')!.textContent).toContain('3')
    expect(document.querySelector('[data-testid="franchises-muted"]')!.textContent).toContain('1')

    await click(document.querySelector('[data-testid="franchises-complete"]'))
    expect(mocks.fetchFranchises).toHaveBeenLastCalledWith(expect.objectContaining({ complete: true, muted: false }))

    await click(document.querySelector('[data-testid="franchises-muted"]'))
    expect(mocks.fetchFranchises).toHaveBeenLastCalledWith(expect.objectContaining({ complete: true, muted: true }))
  })

  it('hands the franchise from a notification to the server and marks it', async () => {
    mocks.fetchFranchises.mockResolvedValue(
      page([saga({ collection_id: 77, name: 'Done Saga', state: 'complete', missing: 0, parts: [part(11, 'Alpha', { owned: true, movie_id: 3 })] }), saga()]),
    )
    await mount('/movies/franchises?open=77')

    expect(mocks.fetchFranchises).toHaveBeenCalledWith(expect.objectContaining({ open: 77 }))

    const cards = all<HTMLElement>('[data-testid="franchise"]')
    expect(cards[0].hasAttribute('data-focused')).toBe(true)
    expect(cards[1].hasAttribute('data-focused')).toBe(false)
    // სრულ ფრანჩაიზს არც დასამატებელი აქვს, არც გასაჩუმებელი
    expect(cards[0].querySelector('[data-testid="franchise-add-all"]')).toBeNull()
    expect(cards[0].querySelector('[data-testid="franchise-mute"]')).toBeNull()
  })

  it('says so when nothing is unfinished', async () => {
    mocks.fetchFranchises.mockResolvedValue(page([], { open: 0, complete: 2, muted: 0 }))
    await mount()

    expect(all('[data-testid="franchise"]')).toHaveLength(0)
    expect(document.querySelector('[data-testid="franchises-complete"]')!.textContent).toContain('2')
  })
})
