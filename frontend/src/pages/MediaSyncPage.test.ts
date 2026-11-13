import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { BatchStatus } from '@/api/batches'
import type { EpisodePlan } from '@/api/episodes'
import type { SyncOverview, SyncRun } from '@/api/syncRuns'
import i18n from '@/i18n'

/* ============================================================
   **მოდულის „სინქრონიზაციის" გვერდი**.

   ⚠️ მოწმდება: გვერდი ბარათებია ამ მოდულზე — მონაცემები TMDB-დან · სეზონები და
   სერიები · მსახიობები · შედეგები; ფილმს სეზონების ბარათი არ აქვს; ბარათის რიცხვი
   სერვერის „რამდენია გასაშვები"-ა, ქვედა ხაზი — ბოლო გაშვება (ბმული მის გვერდზე);
   ბარათი, რომელიც ამ ანგარიშს არ ეკუთვნის, არ იხატება; „მონაცემების" და
   „მსახიობების" ღილაკი ერთსა და იმავე ფანჯარას ხსნის თავისი ნაკადით და ამ მოდულზე.
   სეზონების ბარათი: გეგმა ნაგულისხმევად დაუსრულებელ სერიალებს იღებს და „ყველა"
   გადამრთველით იცვლება; „დაწყება" ფონურ პარტიას უშვებს არჩეული პაუზით, პროგრესი და
   შედეგი (განახლდა · გამოტოვდა · ჩავარდა, მიზეზით) ჩანს; „შეჩერება" პარტიას აუქმებს;
   მიმდინარე პარტია ბრაუზერს ახსოვს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchEpisodePlan: vi.fn(),
  startBatch: vi.fn(),
  fetchBatch: vi.fn(),
  cancelBatch: vi.fn(),
  fetchSyncOverview: vi.fn(),
}))

vi.mock('@/api/syncRuns', async (original) => ({
  ...(await original<typeof import('@/api/syncRuns')>()),
  fetchSyncOverview: mocks.fetchSyncOverview,
}))

vi.mock('@/api/episodes', async (original) => ({
  ...(await original<typeof import('@/api/episodes')>()),
  fetchEpisodePlan: mocks.fetchEpisodePlan,
}))

vi.mock('@/api/batches', async (original) => ({
  ...(await original<typeof import('@/api/batches')>()),
  startBatch: mocks.startBatch,
  fetchBatch: mocks.fetchBatch,
  cancelBatch: mocks.cancelBatch,
}))

// სინქრონის ფანჯარა თავის ტესტებშია — აქ მხოლოდ ის მოწმდება, რომელ მოდულზე და რომელი ნაკადით იხსნება
vi.mock('@/components/SyncDialog', () => ({
  SyncDialog: ({ open, only, flow }: { open: boolean; only?: string; flow?: string }) =>
    open ? h('div', { 'data-testid': 'sync-dialog', 'data-only': only, 'data-flow': flow }) : null,
}))

const settings = { settings: { syncDelayMs: 350 } }
vi.mock('@/lib/settings', async (original) => ({
  ...(await original<typeof import('@/lib/settings')>()),
  useSettings: () => settings,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

const run = (over: Partial<SyncRun> = {}): SyncRun => ({
  key: '0b0e7a8c-1111-4222-8333-444455556666',
  kind: 'sync',
  source: 'queue',
  total: 6,
  done: 6,
  counts: { updated: 3, unchanged: 2, skipped: 0, failed: 1 },
  types: ['movie'],
  started_at: '2026-11-13T10:00:00+04:00',
  last_at: '2026-11-13T10:05:00+04:00',
  ...over,
})

const overview = (over: Partial<SyncOverview> = {}): SyncOverview => ({
  pending: { sync: 12, episodes: 2, cast: 40 },
  last: { sync: null, episodes: null, cast: null },
  runs: 0,
  latest: null,
  ...over,
})

beforeEach(() => {
  window.localStorage.clear()
  mocks.fetchSyncOverview.mockResolvedValue(overview())
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

const plan = (over: Partial<EpisodePlan> = {}): EpisodePlan => ({
  items: [
    { type: 'series', id: 1, title: 'Returning' },
    { type: 'series', id: 2, title: 'Unknown' },
  ],
  total: 4,
  ended: 2,
  in_scope: 2,
  fresh: 0,
  resume_hours: 6,
  ...over,
})

const batch = (over: Partial<BatchStatus> = {}): BatchStatus => ({
  id: 'b-1',
  kind: 'episodes',
  total: 2,
  pending: 2,
  processed: 0,
  failed: 0,
  progress: 0,
  cancelled: false,
  finished: false,
  items: [],
  ...over,
})

async function mount(type: 'movie' | 'series' | 'anime') {
  const { MediaSyncPage } = await import('@/pages/MediaSyncPage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(MemoryRouter, null, h(TooltipProvider, null, h(FeedbackProvider, null, h(MediaSyncPage, { type })))),
      ),
    ),
  )
  await flush()
  await flush()

  return container
}

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)

const count = (box: Element, block: string) => box.querySelector(`[data-testid="${block}"] [data-testid="task-card-count"]`)?.textContent

const cards = (box: Element) => [...box.querySelectorAll('[data-testid="sync-cards"] > section')].map((card) => card.getAttribute('data-testid'))

describe('MediaSyncPage', () => {
  it('draws the cards of a movie module with their numbers, last runs and links', async () => {
    const castRun = run({ key: 'aaaa1111-2222-4333-8444-555566667777', kind: 'cast', types: ['actor'] })
    mocks.fetchSyncOverview.mockResolvedValue(
      overview({ pending: { sync: 12, episodes: null, cast: 40 }, last: { sync: run(), episodes: null, cast: null }, runs: 7, latest: castRun }),
    )
    const box = await mount('movie')

    // რიცხვები ამ მოდულისაა
    expect(mocks.fetchSyncOverview).toHaveBeenCalledWith('movie')
    // ფილმს სეზონი არ აქვს — სამი ბარათი
    expect(cards(box)).toEqual(['tmdb-block', 'cast-block', 'results-block'])
    expect(mocks.fetchEpisodePlan).not.toHaveBeenCalled()

    expect(count(box, 'tmdb-block')).toBe('12')
    expect(count(box, 'cast-block')).toBe('40')
    expect(count(box, 'results-block')).toBe('7')
    expect(box.querySelector('[data-testid="tmdb-block"]')!.textContent).toContain(i18n.t('mediaSync.tmdbTitle'))
    expect(box.querySelector('[data-testid="tmdb-block"]')!.textContent).toContain(i18n.t('syncCards.dataCount'))

    // ბოლო გაშვება: ბმული მის გვერდზე და შედეგის ჯამები; გაუშვებელზე — „ჯერ არ გაშვებულა"
    const last = box.querySelector<HTMLAnchorElement>('[data-testid="tmdb-block"] [data-testid="last-run"]')!
    expect(last.getAttribute('href')).toBe('/sync/results/0b0e7a8c-1111-4222-8333-444455556666')
    expect(last.querySelector('[data-testid="run-counts"]')!.textContent).toBe('3201')
    expect(box.querySelector('[data-testid="cast-block"] [data-testid="last-run-none"]')!.textContent).toBe(i18n.t('syncCards.neverRan'))

    // შედეგების ბარათი ისტორიას ხსნის; მისი ბოლო გაშვება სახეობასაც ამბობს
    expect(box.querySelector('[data-testid="sync-results-link"]')!.getAttribute('href')).toBe('/sync/results')
    const latest = box.querySelector<HTMLAnchorElement>('[data-testid="results-block"] [data-testid="last-run"]')!
    expect(latest.getAttribute('href')).toBe('/sync/results/aaaa1111-2222-4333-8444-555566667777')
    expect(latest.textContent).toContain(i18n.t('syncResults.kind.cast'))
  })

  it('opens one window from two cards, each with its own flow, for that module', async () => {
    const box = await mount('movie')

    await act(async () => button(i18n.t('sync.open'))!.click())
    expect(box.querySelector('[data-testid="sync-dialog"]')?.getAttribute('data-only')).toBe('movie')
    expect(box.querySelector('[data-testid="sync-dialog"]')?.getAttribute('data-flow')).toBe('records')

    await act(async () => button(i18n.t('syncCards.castOpen'))!.click())
    expect(box.querySelector('[data-testid="sync-dialog"]')?.getAttribute('data-only')).toBe('movie')
    expect(box.querySelector('[data-testid="sync-dialog"]')?.getAttribute('data-flow')).toBe('cast')
  })

  it('leaves out a card the account has no right to run', async () => {
    // მხოლოდ ნახვის უფლება: მონაცემები და სეზონები რედაქტირებაა
    mocks.fetchSyncOverview.mockResolvedValue(overview({ pending: { sync: null, episodes: null, cast: 5 } }))
    const box = await mount('series')

    expect(cards(box)).toEqual(['cast-block', 'results-block'])
    expect(mocks.fetchEpisodePlan).not.toHaveBeenCalled()
  })

  it('plans unfinished series by default and everything on the switch', async () => {
    mocks.fetchEpisodePlan.mockResolvedValue(plan({ fresh: 1 }))
    const box = await mount('series')

    expect(mocks.fetchEpisodePlan).toHaveBeenCalledWith('series', { all: false })
    // ოთხივე ბარათი; სეზონების რიცხვი გეგმაა, მის გვერდით — რა გამოიტოვა გეგმამ
    expect(cards(box)).toEqual(['tmdb-block', 'episodes-block', 'cast-block', 'results-block'])
    expect(count(box, 'episodes-block')).toBe('2')
    const line = box.querySelector('[data-testid="episodes-plan"]')!.textContent!
    expect(line).toContain(i18n.t('mediaSync.planFresh', { count: 1 }))
    expect(line).toContain(i18n.t('mediaSync.planEnded', { count: 2 }))
    expect(box.textContent).toContain(i18n.t('mediaSync.episodesTitleSeries'))

    await act(async () => box.querySelector<HTMLButtonElement>('[role="switch"]')!.click())
    await flush()
    expect(mocks.fetchEpisodePlan).toHaveBeenLastCalledWith('series', { all: true })
  })

  it('starts a background batch, shows what failed and why, and can be stopped', async () => {
    mocks.fetchEpisodePlan.mockResolvedValue(plan())
    mocks.startBatch.mockResolvedValue(batch())
    mocks.fetchBatch.mockResolvedValue(batch())
    mocks.cancelBatch.mockResolvedValue(
      batch({
        cancelled: true,
        finished: true,
        progress: 50,
        pending: 1,
        failed: 1,
        items: [
          { type: 'series', id: 1, title: 'Returning', status: 'ok', error: null },
          { type: 'series', id: 2, title: 'Unknown', status: 'failed', error: 'tmdb_unavailable' },
        ],
      }),
    )
    const box = await mount('series')

    await act(async () => button(i18n.t('mediaSync.start'))!.click())
    await flush()

    // პაუზა ერთეულებს შორის — „მონაცემების სინქრონიზაციის" პარამეტრი
    expect(mocks.startBatch).toHaveBeenCalledWith(
      'episodes',
      [
        { type: 'series', id: 1 },
        { type: 'series', id: 2 },
      ],
      { delay_ms: 350 },
    )
    // მიმდინარე პარტია ბრაუზერს ახსოვს — გადატვირთვის შემდეგ პროგრესი ისევ ჩანს
    expect(window.localStorage.getItem('episodes-batch.series')).toBe('b-1')
    expect(box.querySelector('[data-testid="episodes-progress"]')!.textContent).toContain(
      i18n.t('mediaSync.running', { done: 0, total: 2 }),
    )

    await act(async () => button(i18n.t('mediaSync.stop'))!.click())
    await flush()

    expect(mocks.cancelBatch).toHaveBeenCalledWith('b-1')
    const result = box.querySelector('[data-testid="episodes-progress"]')!.textContent!
    expect(result).toContain(i18n.t('mediaSync.stopped'))
    expect(result).toContain(i18n.t('mediaSync.updated', { count: 1 }))
    expect(result).toContain(i18n.t('mediaSync.failed', { count: 1 }))
    // რომელი ჩავარდა და რატომ
    expect(result).toContain('Unknown')
    expect(result).toContain(i18n.t('errors.tmdb_unavailable'))
    // დასრულებული პარტია აღარ ახსოვს; „დაწყება" ისევ ჩანს
    expect(window.localStorage.getItem('episodes-batch.series')).toBeNull()
    expect(button(i18n.t('mediaSync.start'))).toBeDefined()
  })

  it('picks up a batch that is still running after a reload', async () => {
    window.localStorage.setItem('episodes-batch.anime', 'b-9')
    mocks.fetchEpisodePlan.mockResolvedValue(plan({ items: [{ type: 'anime', id: 5, title: 'Anime' }] }))
    mocks.fetchBatch.mockResolvedValue(batch({ id: 'b-9', total: 3, pending: 1 }))
    const box = await mount('anime')

    expect(mocks.fetchBatch).toHaveBeenCalledWith('b-9')
    expect(box.querySelector('[data-testid="episodes-progress"]')!.textContent).toContain(
      i18n.t('mediaSync.running', { done: 2, total: 3 }),
    )
    // მიმდინარე პარტიაზე „დაწყების" ნაცვლად „შეჩერებაა"
    expect(button(i18n.t('mediaSync.start'))).toBeUndefined()
    expect(button(i18n.t('mediaSync.stop'))).toBeDefined()
  })
})
