import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { EpisodePlan, TvType } from '@/api/episodes'
import type { SyncOverview, SyncRun } from '@/api/syncRuns'
import i18n from '@/i18n'

/* ============================================================
   **ინსტრუმენტების „სინქრონიზაცია"** — `/sync`, ბარათებად.

   ⚠️ მოწმდება: ოთხი ბარათი (მონაცემები TMDB-დან · სეზონები და სერიები · მსახიობები ·
   შედეგები) მთელ ბიბლიოთეკაზე და მათ ქვემოთ ცალკე — პაუზის ბარათი; რიცხვები
   სერვერის `overview`-დანაა, მოდულის გარეშე; სეზონების ბარათი ყველა TV-მოდულის გეგმას
   ერთ გაშვებად კრებს; ბარათის ღილაკი ფანჯარას თავისი ნაკადით ხსნის, მოდულით
   შეუზღუდავად; პაუზის არჩევა პარამეტრს ცვლის და შეუნახავი ცვლილება ჩანს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchEpisodePlan: vi.fn(),
  startBatch: vi.fn(),
  fetchBatch: vi.fn(),
  fetchSyncOverview: vi.fn(),
  set: vi.fn(),
}))

vi.mock('@/api/episodes', async (original) => ({
  ...(await original<typeof import('@/api/episodes')>()),
  fetchEpisodePlan: mocks.fetchEpisodePlan,
}))

vi.mock('@/api/batches', async (original) => ({
  ...(await original<typeof import('@/api/batches')>()),
  startBatch: mocks.startBatch,
  fetchBatch: mocks.fetchBatch,
}))

vi.mock('@/api/syncRuns', async (original) => ({
  ...(await original<typeof import('@/api/syncRuns')>()),
  fetchSyncOverview: mocks.fetchSyncOverview,
}))

vi.mock('@/components/SyncDialog', () => ({
  SyncDialog: ({ open, only, flow }: { open: boolean; only?: string; flow?: string }) =>
    open ? h('div', { 'data-testid': 'sync-dialog', 'data-only': only ?? '', 'data-flow': flow }) : null,
}))

// შენახვის ზოლი პარამეტრების საერთო ნაწილია — თავის ტესტებშია
vi.mock('@/components/SettingsSaveBar', () => ({ SettingsSaveBar: () => null }))

// ⚠️ კონტექსტის ჰუკი ყოველ გამოძახებაზე ერთსა და იმავე ობიექტს აბრუნებს
const state = { dirty: false }
const settings = { settings: { syncDelayMs: 350, dateFormat: 'dmy' }, set: mocks.set, isDirty: () => state.dirty }
vi.mock('@/lib/settings', async (original) => ({
  ...(await original<typeof import('@/lib/settings')>()),
  useSettings: () => settings,
}))

const modules = {
  all: [],
  mediaModules: [{ key: 'movie', type: 'movie' }, { key: 'series', type: 'series' }, { key: 'anime', type: 'anime' }],
  pageModules: [],
  customModules: [],
  has: () => true,
}
vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => modules,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

const run = (over: Partial<SyncRun> = {}): SyncRun => ({
  key: '0b0e7a8c-1111-4222-8333-444455556666',
  kind: 'episodes',
  source: 'batch',
  total: 3,
  done: 3,
  counts: { updated: 2, unchanged: 1, skipped: 0, failed: 0 },
  types: ['series'],
  started_at: '2026-11-13T10:00:00+04:00',
  last_at: '2026-11-13T10:05:00+04:00',
  ...over,
})

const overview = (over: Partial<SyncOverview> = {}): SyncOverview => ({
  pending: { sync: 12, episodes: 3, cast: 40 },
  last: { sync: null, episodes: run(), cast: null },
  runs: 4,
  latest: run(),
  ...over,
})

const plan = (type: TvType, ids: number[], over: Partial<EpisodePlan> = {}): EpisodePlan => ({
  items: ids.map((id) => ({ type, id, title: `${type} ${id}` })),
  total: ids.length,
  ended: 0,
  in_scope: ids.length,
  fresh: 0,
  resume_hours: 6,
  ...over,
})

beforeEach(() => {
  window.localStorage.clear()
  state.dirty = false
  mocks.fetchSyncOverview.mockResolvedValue(overview())
  mocks.fetchEpisodePlan.mockImplementation(async (type: TvType) => (type === 'series' ? plan('series', [1, 2], { ended: 4 }) : plan('anime', [7], { fresh: 1 })))
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount() {
  const { SyncPage } = await import('@/pages/SyncPage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(QueryClientProvider, { client: qc }, h(MemoryRouter, null, h(TooltipProvider, null, h(FeedbackProvider, null, h(SyncPage))))),
    ),
  )
  await flush()
  await flush()

  return container
}

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)

const count = (box: Element, block: string) => box.querySelector(`[data-testid="${block}"] [data-testid="task-card-count"]`)?.textContent

describe('SyncPage', () => {
  it('draws four cards over the whole library and the pause card below them', async () => {
    const box = await mount()

    // მოდულის გარეშე — მთელი ბიბლიოთეკა
    expect(mocks.fetchSyncOverview).toHaveBeenCalledWith(undefined)
    expect([...box.querySelectorAll('[data-testid="sync-cards"] > section')].map((card) => card.getAttribute('data-testid'))).toEqual([
      'tmdb-block',
      'episodes-block',
      'cast-block',
      'results-block',
    ])
    expect(count(box, 'tmdb-block')).toBe('12')
    expect(count(box, 'cast-block')).toBe('40')
    expect(count(box, 'results-block')).toBe('4')

    // პაუზა ბარათების ბადის გარეთაა, ქვემოთ, და რიცხვი არ აქვს
    const pause = box.querySelector('[data-testid="pause-block"]')!
    expect(pause.closest('[data-testid="sync-cards"]')).toBeNull()
    expect(pause.textContent).toContain(i18n.t('settings.syncDelay'))
    expect(pause.querySelector('[data-testid="task-card-count"]')).toBeNull()
    expect(pause.querySelector('[role="combobox"]')).not.toBeNull()
    expect(pause.querySelector('[data-testid="pause-dirty"]')).toBeNull()

    // ბოლო გაშვების ბმული და ისტორიის ბმული
    expect(box.querySelector('[data-testid="episodes-block"] [data-testid="last-run"]')!.getAttribute('href')).toBe('/sync/results/0b0e7a8c-1111-4222-8333-444455556666')
    expect(box.querySelector('[data-testid="sync-results-link"]')!.getAttribute('href')).toBe('/sync/results')
  })

  it('gathers the plans of every TV module into one seasons run', async () => {
    mocks.startBatch.mockResolvedValue({ id: 'b-1', kind: 'episodes', total: 3, pending: 3, processed: 0, failed: 0, progress: 0, cancelled: false, finished: false, items: [] })
    mocks.fetchBatch.mockResolvedValue({ id: 'b-1', kind: 'episodes', total: 3, pending: 3, processed: 0, failed: 0, progress: 0, cancelled: false, finished: false, items: [] })
    const box = await mount()

    expect(mocks.fetchEpisodePlan).toHaveBeenCalledWith('series', { all: false })
    expect(mocks.fetchEpisodePlan).toHaveBeenCalledWith('anime', { all: false })
    // რიცხვი ორივე გეგმის ჯამია; სათაური მოდულს არ ასახელებს
    expect(count(box, 'episodes-block')).toBe('3')
    const card = box.querySelector('[data-testid="episodes-block"]')!
    expect(card.querySelector('h2')!.textContent).toBe(i18n.t('mediaSync.episodesTitle'))
    expect(card.querySelector('[data-testid="episodes-plan"]')!.textContent).toBe(
      `${i18n.t('mediaSync.planFresh', { count: 1 })} · ${i18n.t('mediaSync.planEnded', { count: 4 })}`,
    )

    await act(async () => button(i18n.t('mediaSync.start'))!.click())
    await flush()

    expect(mocks.startBatch).toHaveBeenCalledWith(
      'episodes',
      [
        { type: 'series', id: 1 },
        { type: 'series', id: 2 },
        { type: 'anime', id: 7 },
      ],
      { delay_ms: 350 },
    )
    // საერთო გვერდის პარტიას თავისი მეხსიერება აქვს — მოდულის გვერდისას არ ეხება
    expect(window.localStorage.getItem('episodes-batch.all')).toBe('b-1')
    expect(window.localStorage.getItem('episodes-batch.series')).toBeNull()
  })

  it('opens the window with the flow of the pressed card, for every module', async () => {
    const box = await mount()

    await act(async () => button(i18n.t('syncCards.castOpen'))!.click())
    const dialog = box.querySelector('[data-testid="sync-dialog"]')!
    expect(dialog.getAttribute('data-flow')).toBe('cast')
    expect(dialog.getAttribute('data-only')).toBe('')
  })

  it('marks the pause as changed until it is saved', async () => {
    state.dirty = true
    const box = await mount()

    expect(box.querySelector('[data-testid="pause-block"] [data-testid="pause-dirty"]')).not.toBeNull()
  })
})
