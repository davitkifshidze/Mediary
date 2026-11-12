import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { SoonItem, UpcomingItem } from '@/api/soon'
import i18n from '@/i18n'
import { soonLine, tmdbStatusLabel } from '@/lib/soon'

/* ============================================================
   **„მალე" — გამოუსვლელი სათაურები**.

   ⚠️ მოწმდება: ჩემი სია ბარათზე თარიღს, „დარჩა N დღე"-ს და რა გამოდის
   (პრემიერა · ახალი სეზონი · სერია) აჩვენებს; თრეილერის ღილაკი მხოლოდ იქაა,
   სადაც თრეილერი არის, და აპის ფლეიერში უკრავს; ცარიელი სია TMDB-ის ჩანართს
   სთავაზობს; „TMDB-ზე მალე" ერთი დაჭერით ამატებს და უკვე დამატებულს ნიშნავს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchSoon: vi.fn(),
  fetchUpcoming: vi.fn(),
  play: vi.fn(),
  enqueue: vi.fn(),
  queued: new Set<number>(),
}))

vi.mock('@/api/soon', async (original) => ({
  ...(await original<typeof import('@/api/soon')>()),
  fetchSoon: mocks.fetchSoon,
  fetchUpcoming: mocks.fetchUpcoming,
}))

const player = { play: mocks.play }
vi.mock('@/lib/player', async (original) => ({
  ...(await original<typeof import('@/lib/player')>()),
  usePlayer: () => player,
}))

const queue = { enqueue: mocks.enqueue, isQueued: (id: number) => mocks.queued.has(id) }
vi.mock('@/components/ui/queue', async (original) => ({
  ...(await original<typeof import('@/components/ui/queue')>()),
  useQueue: () => queue,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  mocks.queued.clear()
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const trailer = { url: 'https://www.youtube.com/watch?v=abc', embed_url: 'https://www.youtube-nocookie.com/embed/abc', platform: 'youtube' }

function soon(id: number, over: Partial<SoonItem> = {}): SoonItem {
  return {
    id,
    title_ka: null,
    title_en: `Title ${id}`,
    year: 2027,
    poster: null,
    date: '2027-03-01',
    days: 12,
    kind: 'premiere',
    season: null,
    episode: null,
    tmdb_status: null,
    trailer: null,
    status: null,
    is_favorite: false,
    ...over,
  }
}

function upcoming(id: number, over: Partial<UpcomingItem> = {}): UpcomingItem {
  return {
    tmdb_id: id,
    title: `Upcoming ${id}`,
    title_ka: null,
    date: '2030-01-01',
    poster: 'https://image.tmdb.org/t/p/w342/a.jpg',
    overview: null,
    genres: [],
    trailer: null,
    owned: false,
    record_id: null,
    ...over,
  }
}

async function mount(mine: SoonItem[], tmdb: UpcomingItem[] = []) {
  mocks.fetchSoon.mockResolvedValue(mine)
  mocks.fetchUpcoming.mockResolvedValue({ items: tmdb, total: tmdb.length, lastPage: 1 })

  const { SoonView } = await import('@/components/soon/SoonView')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(QueryClientProvider, { client: qc }, h(MemoryRouter, null, h(TooltipProvider, null, h(SoonView, { type: 'series' })))),
    ),
  )
  await flush()
  await flush()

  return container
}

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith(label))

describe('SoonView', () => {
  it('shows my upcoming titles with the days left, what is coming and a trailer where there is one', async () => {
    const box = await mount([
      soon(1, { days: 0, trailer }),
      soon(2, { kind: 'season', season: 4, episode: 1, days: 12 }),
      soon(3, { kind: 'announced', date: null, days: null, tmdb_status: 'Post Production' }),
    ])

    expect(mocks.fetchSoon).toHaveBeenCalledWith('/series')

    const cards = [...box.querySelectorAll('[data-testid="soon-card"]')]
    expect(cards).toHaveLength(3)
    expect(cards[0].querySelector('[data-testid="soon-days"]')?.textContent).toBe(i18n.t('soon.today'))
    expect(cards[1].querySelector('[data-testid="soon-days"]')?.textContent).toBe(i18n.t('soon.daysLeft', { count: 12 }))
    expect(cards[1].textContent).toContain(i18n.t('soon.kind.season', { season: 4 }))
    // უთარიღოს „დარჩა" არ აქვს — თარიღის ადგილას „თარიღი უცნობია" და TMDB-ის მდგომარეობა
    expect(cards[2].querySelector('[data-testid="soon-days"]')).toBeNull()
    expect(cards[2].textContent).toContain(i18n.t('soon.dateUnknown'))
    expect(cards[2].textContent).toContain(i18n.t('soon.tmdbStatus.post_production'))

    // ბარათი ჩანაწერს ხსნის
    expect(cards[0].querySelector('a')?.getAttribute('href')).toBe('/series/1')

    // თრეილერი მხოლოდ იქ, სადაც არის — და აპის ფლეიერში უკრავს
    expect(box.querySelectorAll('[data-testid="soon-trailer"]')).toHaveLength(1)
    await act(async () => cards[0].querySelector<HTMLButtonElement>('[data-testid="soon-trailer"]')!.click())
    expect(mocks.play).toHaveBeenCalledWith(
      [expect.objectContaining({ kind: 'link', id: 1, url: trailer.url, embedUrl: trailer.embed_url, platform: 'youtube' })],
      0,
      i18n.t('detail.trailer'),
    )
  })

  it('offers the TMDB tab when nothing of mine is ahead, and adds a title with one press', async () => {
    const box = await mount([], [upcoming(11, { trailer }), upcoming(12, { owned: true, record_id: 7 })])

    expect(box.textContent).toContain(i18n.t('soon.emptyTitle'))

    await act(async () => button(i18n.t('soon.tab.tmdb'))!.click())
    await flush()
    await flush()

    expect(mocks.fetchUpcoming).toHaveBeenCalledWith('series', 1)
    const cards = [...box.querySelectorAll('[data-testid="soon-tmdb-card"]')]
    expect(cards).toHaveLength(2)

    // უკვე დამატებული ნიშნით ჩანს და ჩანაწერზე მიდის — „დამატება" აღარ აქვს
    expect(cards[1].textContent).toContain(i18n.t('discover.added'))
    expect(cards[1].querySelector('a')?.getAttribute('href')).toBe('/series/7')
    expect([...cards[1].querySelectorAll('button')].some((b) => b.textContent?.includes(i18n.t('actor.add')))).toBe(false)

    const add = [...cards[0].querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(i18n.t('actor.add')))!
    await act(async () => add.click())
    expect(mocks.enqueue).toHaveBeenCalledWith([{ tmdbId: 11, title: 'Upcoming 11' }], 'series')
  })
})

describe('soonLine', () => {
  const date = (value: string) => `<${value}>`

  it('says the date and what is coming', () => {
    expect(soonLine(soon(1), i18n.t, date)).toBe(`<2027-03-01> · ${i18n.t('soon.kind.premiere')}`)
    expect(soonLine(soon(1, { kind: 'episode', season: 2, episode: 5 }), i18n.t, date)).toBe(
      `<2027-03-01> · ${i18n.t('soon.kind.episode', { season: 2, episode: 5 })}`,
    )
    expect(soonLine(soon(1, { kind: 'announced', date: null, tmdb_status: null }), i18n.t, date)).toBe(i18n.t('soon.dateUnknown'))
  })

  it('keeps an unknown TMDB status as it came', () => {
    expect(tmdbStatusLabel('Planned', i18n.t)).toBe(i18n.t('soon.tmdbStatus.planned'))
    expect(tmdbStatusLabel('Something New', i18n.t)).toBe('Something New')
    expect(tmdbStatusLabel(null, i18n.t)).toBeNull()
  })
})
