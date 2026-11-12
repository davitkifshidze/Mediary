import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { BatchStatus } from '@/api/batches'
import type { EpisodePlan } from '@/api/episodes'
import i18n from '@/i18n'

/* ============================================================
   **მოდულის „სინქრონიზაციის" გვერდი**.

   ⚠️ მოწმდება: სერიალსა და ანიმეს ორივე ბლოკი აქვს, ფილმს — მხოლოდ „მონაცემები
   TMDB-დან"; გეგმა ნაგულისხმევად დაუსრულებელ სერიალებს იღებს და „ყველა"
   გადამრთველით იცვლება; „დაწყება" ფონურ პარტიას უშვებს არჩეული პაუზით, პროგრესი და
   შედეგი (განახლდა · გამოტოვდა · ჩავარდა, მიზეზით) ჩანს; „შეჩერება" პარტიას აუქმებს;
   მიმდინარე პარტია ბრაუზერს ახსოვს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchEpisodePlan: vi.fn(),
  startBatch: vi.fn(),
  fetchBatch: vi.fn(),
  cancelBatch: vi.fn(),
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

// სინქრონის ფანჯარა თავის ტესტებშია — აქ მხოლოდ ის მოწმდება, რომელ მოდულზე იხსნება
vi.mock('@/components/SyncDialog', () => ({
  SyncDialog: ({ open, only }: { open: boolean; only?: string }) =>
    open ? h('div', { 'data-testid': 'sync-dialog', 'data-only': only }) : null,
}))

const settings = { settings: { syncDelayMs: 350 } }
vi.mock('@/lib/settings', async (original) => ({
  ...(await original<typeof import('@/lib/settings')>()),
  useSettings: () => settings,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => window.localStorage.clear())

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

describe('MediaSyncPage', () => {
  it('gives movies only the TMDB block, opened for that module', async () => {
    const box = await mount('movie')

    expect(box.querySelector('[data-testid="episodes-block"]')).toBeNull()
    expect(mocks.fetchEpisodePlan).not.toHaveBeenCalled()

    await act(async () => button(i18n.t('sync.open'))!.click())
    expect(box.querySelector('[data-testid="sync-dialog"]')?.getAttribute('data-only')).toBe('movie')
  })

  it('plans unfinished series by default and everything on the switch', async () => {
    mocks.fetchEpisodePlan.mockResolvedValue(plan({ fresh: 1 }))
    const box = await mount('series')

    expect(mocks.fetchEpisodePlan).toHaveBeenCalledWith('series', { all: false })
    const line = box.querySelector('[data-testid="episodes-plan"]')!.textContent!
    expect(line).toContain(i18n.t('mediaSync.planLine', { count: 2 }))
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
