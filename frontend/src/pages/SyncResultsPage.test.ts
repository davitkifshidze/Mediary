import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { SyncRun, SyncRunItem } from '@/api/syncRuns'
import i18n from '@/i18n'

/* ============================================================
   **„სინქრონიზაციის შედეგები"** — გაშვებების სია და ერთი გაშვების ერთეულები.

   ⚠️ მოწმდება: გაშვება ბარათია — ბმული თავის გვერდზე, სახეობის ფერით, მოდულები
   ნიშნებად, ოთხივე შედეგის რიცხვი ფერადი ნიშნებით და დაუსრულებელზე პროგრესის ზოლი;
   ერთეულიც ბარათია — შედეგი თავისი ფერით და მოდულის ნიშანი; ერთეული ამბობს, რა შეიცვალა (ველების სახელებით) ან რატომ გამოტოვდა, არსებულ
   ჩანაწერზე ბმულია, წაშლილზე — არა; ჩიპი შედეგით ფილტრავს, ძებნა სათაურით;
   „აღარ გაეშვას" მონიშნულ ერთეულებს ან ყველა ჩავარდნილს აგზავნის და მერე სიას
   თავიდან კითხულობს; გასაღების ფორმა UUID-ია.

   ⚠️ **გაწყვეტილი გაშვება**: გაშვებას მდგომარეობის ნიშანი აქვს (მიმდინარეობს · გაწყდა ·
   დასრულდა); გაწყვეტილზე „გაგრძელება" (რიცხვით — რამდენი დარჩა) სერვერს იმავე გაშვების
   გაგრძელებას სთხოვს, ჩავარდნილებზე — „ჩავარდნილების თავიდან გაშვება"; სიაში ერთი ღილაკია,
   გაშვების გვერდზე ორივე; მიმდინარეზე — „შეჩერება"; დასრულებულს ღილაკი არ აქვს.
   გაშვების გვერდი ამბობს, რით გაეშვა (ველები, გადაწერა).

   ⚠️ **„რა რით შეიცვალა"**: ერთეული, რომელსაც მნიშვნელობები აქვს, იშლება — ყოველ
   ველზე „იყო → გახდა", ცარიელიდან შევსებულზე „ახალი" ნიშანი ძველის გარეშე,
   ჟანრებზე რა დაემატა და რა მოაკლდა, პოსტერზე მხოლოდ ფაქტი, თარგმანზე წყარო; გრძელი
   ტექსტი იკეცება და „მეტით" იშლება. მნიშვნელობების გარეშე ერთეულს (ძველი გაშვება)
   გასაშლელი ღილაკი არ აქვს.
   ============================================================ */

const run = (extra: Partial<SyncRun> = {}): SyncRun => ({
  key: '0b0e7a8c-1111-4222-8333-444455556666',
  kind: 'sync',
  source: 'queue',
  total: 4,
  done: 4,
  counts: { updated: 1, unchanged: 1, skipped: 1, failed: 1 },
  left: 0,
  state: 'finished',
  resumable: false,
  retryable: false,
  stoppable: false,
  types: ['movie'],
  started_at: '2026-11-13T10:00:00+04:00',
  last_at: '2026-11-13T10:05:00+04:00',
  ...extra,
})

const item = (id: number, extra: Partial<SyncRunItem> = {}): SyncRunItem => ({
  id,
  type: 'movie',
  record_id: id + 100,
  title: `Movie ${id}`,
  result: 'updated',
  reason: null,
  changes: [],
  details: [],
  exists: true,
  paused: false,
  ...extra,
})

const LONG = 'გრძელი აღწერა. '.repeat(40)

const ITEMS = [
  item(1, {
    changes: ['poster', 'description_ka'],
    details: [
      { field: 'title_en', from: 'The Matrix', to: 'The Matrix Remastered' },
      { field: 'description_ka', from: null, to: LONG, by: 'gemini' },
      { field: 'genres', added: ['Thriller'], removed: ['Science Fiction'] },
      { field: 'poster', file: true, replaced: true },
      { field: 'birthday', from: null, to: '1964-09-02' },
    ],
  }),
  item(2, { result: 'unchanged' }),
  item(3, { result: 'skipped', reason: 'empty' }),
  item(4, { result: 'failed', reason: 'TMDB said 401', exists: false, paused: true }),
]

const mocks = vi.hoisted(() => ({
  fetchSyncRuns: vi.fn(),
  fetchSyncRun: vi.fn(),
  fetchSyncRunItems: vi.fn(),
  pauseSyncRunItems: vi.fn(),
  resumeSyncRun: vi.fn(),
  stopSyncRun: vi.fn(),
}))

vi.mock('@/api/syncRuns', async (original) => ({
  ...(await original<typeof import('@/api/syncRuns')>()),
  ...mocks,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let lib: typeof import('@/pages/SyncResultsPage')

beforeAll(async () => {
  lib = await import('@/pages/SyncResultsPage')
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
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(url: string) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: [url] },
        h(
          QueryClientProvider,
          { client: qc },
          h(
            TooltipProvider,
            null,
            h(
              FeedbackProvider,
              null,
              h(Routes, null, [
                h(Route, { key: 'list', path: '/sync/results', element: h(lib.SyncResultsPage) }),
                h(Route, { key: 'one', path: '/sync/results/:key', element: h(lib.SyncResultsPage) }),
              ]),
            ),
          ),
        ),
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
  await flush()
}

describe('SyncResultsPage: the list of runs', () => {
  it('links each run to its own page and shows all four counts', async () => {
    mocks.fetchSyncRuns.mockResolvedValue({
      items: [run(), run({ key: 'aaaa1111-2222-4333-8444-555566667777', kind: 'cast', source: 'batch', types: ['actor'], total: 9, done: 5, left: 4, state: 'interrupted' })],
      total: 2,
      lastPage: 1,
    })
    await mount('/sync/results')

    const runs = all<HTMLAnchorElement>('[data-testid="sync-run"]')
    expect(runs.map((a) => a.getAttribute('href'))).toEqual(['/sync/results/0b0e7a8c-1111-4222-8333-444455556666', '/sync/results/aaaa1111-2222-4333-8444-555566667777'])
    expect(runs[0].textContent).toContain(i18n.t('syncResults.kind.sync'))
    expect(runs[0].querySelector('[data-testid="run-counts"]')!.textContent).toBe('1111')
    // შეწყვეტილი გაშვება ამბობს, რამდენი დასრულდა
    expect(runs[1].textContent).toContain(i18n.t('syncResults.partial', { done: 5, total: 9 }))
    expect(runs[1].textContent).toContain(i18n.t('syncResults.source.batch'))
  })

  it('draws a run as a card: kind colour, modules, coloured counts and a bar while incomplete', async () => {
    mocks.fetchSyncRuns.mockResolvedValue({
      items: [
        run({ types: ['movie', 'series'], counts: { updated: 3, unchanged: 0, skipped: 0, failed: 1 } }),
        run({ key: 'aaaa1111-2222-4333-8444-555566667777', kind: 'cast', source: 'batch', types: ['actor'], total: 8, done: 2, left: 6, state: 'interrupted' }),
      ],
      total: 2,
      lastPage: 1,
    })
    await mount('/sync/results')

    const [full, partial] = all<HTMLElement>('[data-testid="sync-run-card"]')
    // სახეობას თავისი ფერი აქვს — ბარათი მას აქცენტად იღებს
    expect(full.style.getPropertyValue('--mod')).toBe('var(--tool-sync)')
    expect(partial.style.getPropertyValue('--mod')).toBe('var(--tool-actors)')
    // მოდულები ნიშნებად
    expect([...full.querySelectorAll('[data-testid="run-module"]')].map((badge) => badge.textContent)).toEqual([i18n.t('nav.movies'), i18n.t('nav.series')])
    expect(partial.querySelector('[data-testid="run-module"]')!.textContent).toBe(i18n.t('sync.changed.cast'))

    // შედეგის ნიშნები: ოთხივე იხატება, ნულიანი გაუფერულებულია
    const badge = (card: Element, result: string) => card.querySelector<HTMLElement>(`[data-testid="run-counts"] [data-result="${result}"]`)!
    expect(badge(full, 'updated').textContent).toBe('3')
    expect(badge(full, 'updated').className).not.toContain('opacity-40')
    expect(badge(full, 'skipped').className).toContain('opacity-40')
    expect(badge(full, 'failed').getAttribute('title')).toBe(i18n.t('syncResults.result.failed'))

    // ზოლი მხოლოდ დაუსრულებელ გაშვებაზეა
    expect(full.querySelector('[data-testid="run-progress"]')).toBeNull()
    const bar = partial.querySelector('[data-testid="run-progress"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('25')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('25%')
  })

  it('says so when nothing has been run', async () => {
    mocks.fetchSyncRuns.mockResolvedValue({ items: [], total: 0, lastPage: 1 })
    await mount('/sync/results')

    expect(all('[data-testid="sync-run"]')).toHaveLength(0)
    expect(document.body.textContent).toContain(i18n.t('syncResults.none'))
  })
})

describe('SyncResultsPage: an interrupted run', () => {
  const BROKEN = 'bbbb1111-2222-4333-8444-555566667777'
  const HALF = 'cccc1111-2222-4333-8444-555566667777'
  const LIVE = 'dddd1111-2222-4333-8444-555566667777'
  const QUEUED = 'eeee1111-2222-4333-8444-555566667777'

  const broken = () => run({ key: BROKEN, total: 170, done: 12, left: 158, state: 'interrupted', resumable: true, retryable: true, counts: { updated: 9, unchanged: 0, skipped: 0, failed: 3 } })

  it('says the state of each run and offers one button in the list', async () => {
    mocks.fetchSyncRuns.mockResolvedValue({
      items: [
        broken(),
        // ყველაფერს შედეგი აქვს, მაგრამ ორი ჩავარდა — მხოლოდ თავიდან გაშვება
        run({ key: HALF, retryable: true, counts: { updated: 2, unchanged: 0, skipped: 0, failed: 2 } }),
        run({ key: LIVE, kind: 'translate', total: 40, done: 10, left: 30, state: 'running', stoppable: true }),
        // ბრაუზერის რიგით მიმდინარე: სერვერი მას ვერ აჩერებს — ღილაკი არ აქვს
        run({ key: QUEUED, total: 6, done: 1, left: 5, state: 'running' }),
        run(),
      ],
      total: 5,
      lastPage: 1,
    })
    mocks.resumeSyncRun.mockResolvedValue(broken())
    mocks.stopSyncRun.mockResolvedValue(broken())
    await mount('/sync/results')

    const cards = all<HTMLElement>('[data-testid="sync-run-card"]')
    expect(cards.map((card) => card.querySelector('[data-testid="run-state"]')!.getAttribute('data-state'))).toEqual(['interrupted', 'finished', 'running', 'running', 'finished'])
    expect(cards[0].querySelector('[data-testid="run-state"]')!.textContent).toBe(i18n.t('syncResults.state.interrupted'))

    // გაწყვეტილზე სიაში ერთი ღილაკია — „გაგრძელება", რამდენი დარჩა
    const resume = cards[0].querySelector<HTMLButtonElement>('[data-testid="run-resume"]')!
    expect(resume.textContent).toContain(i18n.t('syncResults.resume'))
    expect(resume.querySelector('[data-testid="count-badge"]')!.textContent).toBe('158')
    expect(cards[0].querySelector('[data-testid="run-retry"]')).toBeNull()
    // ღილაკი ბმულის შიგნით არ არის — დაჭერა გაშვების გვერდს არ ხსნის
    expect(resume.closest('a')).toBeNull()

    // მხოლოდ ჩავარდნილები; მიმდინარეზე — შეჩერება; დასრულებულს ღილაკი არ აქვს
    expect(cards[1].querySelector('[data-testid="run-resume"]')).toBeNull()
    expect(cards[1].querySelector('[data-testid="run-retry"]')!.querySelector('[data-testid="count-badge"]')!.textContent).toBe('2')
    expect(cards[2].querySelector('[data-testid="run-actions"]')).toBeNull()
    expect(cards[2].querySelector('[data-testid="run-stop"]')).not.toBeNull()
    expect(cards[3].querySelector('button')).toBeNull()
    expect(cards[4].querySelector('button')).toBeNull()

    await click(resume)
    expect(mocks.resumeSyncRun).toHaveBeenLastCalledWith(BROKEN, { only: undefined, delay_ms: 200 })
    // გაგრძელების შემდეგ სია თავიდან იკითხება
    expect(mocks.fetchSyncRuns.mock.calls.length).toBeGreaterThanOrEqual(2)

    await click(cards[1].querySelector('[data-testid="run-retry"]'))
    expect(mocks.resumeSyncRun).toHaveBeenLastCalledWith(HALF, { only: 'failed', delay_ms: 200 })

    // თარგმანს თავისი პაუზა აქვს; მიმდინარე გაშვება ჩერდება
    await click(cards[2].querySelector('[data-testid="run-stop"]'))
    expect(mocks.stopSyncRun).toHaveBeenCalledWith(LIVE)
  })

  it('shows both variants and what the run ran with on its own page', async () => {
    mocks.fetchSyncRun.mockResolvedValue({ ...broken(), params: { fields: ['title', 'year'], media: true, only_missing: true, overwrite: true } })
    mocks.fetchSyncRunItems.mockResolvedValue({ items: ITEMS, total: 4, lastPage: 1 })
    mocks.resumeSyncRun.mockResolvedValue(broken())
    await mount(`/sync/results/${BROKEN}`)

    const head = document.querySelector<HTMLElement>('[data-testid="sync-run-head"]')!
    expect(head.querySelector('[data-testid="run-state"]')!.getAttribute('data-state')).toBe('interrupted')
    expect(head.querySelector('[data-testid="run-progress"]')!.getAttribute('aria-valuenow')).toBe('7')

    // რით გაეშვა: მედია, ველები და გადაწერა
    const params = head.querySelector('[data-testid="run-params"]')!.textContent!
    for (const key of ['syncResults.param.mediaMissing', 'sync.field.title', 'sync.field.year', 'sync.modeOverwrite']) {
      expect(params).toContain(i18n.t(key))
    }

    // ორივე ვარიანტი: გაგრძელება და ჩავარდნილების თავიდან გაშვება
    expect(head.querySelector('[data-testid="run-resume"]')).not.toBeNull()
    const retry = head.querySelector<HTMLButtonElement>('[data-testid="run-retry"]')!
    expect(retry.textContent).toContain(i18n.t('syncResults.retryFailed'))
    expect(retry.querySelector('[data-testid="count-badge"]')!.textContent).toBe('3')

    await click(retry)
    expect(mocks.resumeSyncRun).toHaveBeenLastCalledWith(BROKEN, { only: 'failed', delay_ms: 200 })
    // გაშვებაც და ერთეულებიც თავიდან იკითხება
    expect(mocks.fetchSyncRun.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('gives a finished or an old run nothing to continue', async () => {
    // ძველი გაშვება: გაწყდა, მაგრამ რაზე და რით გაეშვა, არ ინახება
    mocks.fetchSyncRun.mockResolvedValue({ ...run({ total: 9, done: 5, left: 4, state: 'interrupted' }), params: null })
    mocks.fetchSyncRunItems.mockResolvedValue({ items: ITEMS, total: 4, lastPage: 1 })
    await mount('/sync/results/0b0e7a8c-1111-4222-8333-444455556666')

    const head = document.querySelector<HTMLElement>('[data-testid="sync-run-head"]')!
    expect(head.querySelector('[data-testid="run-state"]')!.textContent).toBe(i18n.t('syncResults.state.interrupted'))
    expect(head.querySelector('[data-testid="run-resume"]')).toBeNull()
    expect(head.querySelector('[data-testid="run-retry"]')).toBeNull()
    expect(head.querySelector('[data-testid="run-params"]')).toBeNull()
    // ღილაკის ნაცვლად — ახსნა, რატომ არ გრძელდება
    expect(head.querySelector('[data-testid="run-old"]')).not.toBeNull()
  })
})

describe('SyncResultsPage: one run', () => {
  const KEY = '0b0e7a8c-1111-4222-8333-444455556666'

  async function open() {
    mocks.fetchSyncRun.mockResolvedValue(run())
    mocks.fetchSyncRunItems.mockResolvedValue({ items: ITEMS, total: 4, lastPage: 1 })
    mocks.pauseSyncRunItems.mockResolvedValue(1)
    await mount(`/sync/results/${KEY}`)
  }

  it('tells what changed, why an item was skipped and links only what still exists', async () => {
    await open()

    expect(mocks.fetchSyncRunItems).toHaveBeenCalledWith(KEY, expect.objectContaining({ result: null, q: '', page: 1 }))

    const rows = all<HTMLElement>('[data-testid="sync-run-item"]')
    expect(rows.map((row) => row.dataset.result)).toEqual(['updated', 'unchanged', 'skipped', 'failed'])
    // ველების სახელები და არა გასაღებები
    expect(rows[0].textContent).toContain(i18n.t('syncResults.changed', { fields: `${i18n.t('sync.changed.poster')}, ${i18n.t('sync.changed.description_ka')}` }))
    expect(rows[2].textContent).toContain(i18n.t('syncResults.reason.empty'))
    expect(rows[3].textContent).toContain('TMDB said 401')

    expect(rows[0].querySelector('[data-testid="sync-run-item-link"]')!.getAttribute('href')).toBe('/movies/101')
    expect(rows[3].querySelector('[data-testid="sync-run-item-link"]')).toBeNull()
    expect(rows[3].textContent).toContain(i18n.t('syncResults.gone'))
    expect(rows[3].querySelector('[data-testid="sync-run-item-paused"]')).not.toBeNull()
    expect(rows[0].querySelector('[data-testid="sync-run-item-paused"]')).toBeNull()

    // ერთეული ბარათია: მოდულის ნიშანი; გაშვების თავიც ბარათია თავისი სახეობის ფერით
    expect(rows[0].textContent).toContain(i18n.t('nav.movies'))
    const head = document.querySelector<HTMLElement>('[data-testid="sync-run-head"]')!
    expect(head.style.getPropertyValue('--mod')).toBe('var(--tool-sync)')
    expect(head.querySelector('[data-testid="run-counts"]')!.textContent).toBe('1111')
  })

  it('unfolds an item into what changed to what', async () => {
    await open()

    const rows = all<HTMLElement>('[data-testid="sync-run-item"]')
    const toggle = rows[0].querySelector<HTMLButtonElement>('[data-testid="sync-run-item-toggle"]')!
    // რამდენი ველი შეიცვალა — ღილაკზე; მნიშვნელობების გარეშე ერთეულს ღილაკი არ აქვს
    expect(toggle.querySelector('[data-testid="count-badge"]')!.textContent).toBe('5')
    expect(rows[1].querySelector('[data-testid="sync-run-item-toggle"]')).toBeNull()
    expect(rows[0].querySelector('[data-testid="sync-run-item-details"]'), 'თავიდან აკეცილია').toBeNull()

    await click(toggle)
    const detail = (field: string) => rows[0].querySelector<HTMLElement>(`[data-testid="sync-run-detail"][data-field="${field}"]`)!
    expect(all('[data-testid="sync-run-detail"]')).toHaveLength(5)

    // გადაწერილი ველი: ძველი და ახალი ერთად
    expect(detail('title_en').textContent).toContain(i18n.t('sync.changed.title_en'))
    expect(detail('title_en').textContent).toContain('The Matrix')
    expect(detail('title_en').textContent).toContain('The Matrix Remastered')
    expect(detail('title_en').querySelector('[data-testid="detail-new"]')).toBeNull()

    // ცარიელიდან შევსებული: „ახალი" ნიშანი, წყარო და გრძელი ტექსტი „მეტით"
    const description = detail('description_ka')
    expect(description.querySelector('[data-testid="detail-new"]')!.textContent).toContain(i18n.t('syncResults.detail.new'))
    expect(description.textContent).toContain(i18n.t('translate.source.gemini'))
    const text = description.querySelector('.line-clamp-3')
    expect(text, 'გრძელი ტექსტი იკეცება').not.toBeNull()
    await click(description.querySelector('[data-testid="detail-more"]'))
    expect(description.querySelector('.line-clamp-3')).toBeNull()
    expect(description.querySelector('[data-testid="detail-more"]')!.textContent).toContain(i18n.t('syncResults.detail.less'))

    // სია: რა დაემატა და რა მოაკლდა
    expect(detail('genres').querySelector('[data-testid="detail-added"]')!.textContent).toContain('Thriller')
    expect(detail('genres').querySelector('[data-testid="detail-removed"]')!.textContent).toContain('Science Fiction')
    // ფაილი: მხოლოდ ფაქტი
    expect(detail('poster').textContent).toContain(i18n.t('syncResults.detail.fileReplaced'))
    // მსახიობის სვეტს თავისი წარწერა აქვს
    expect(detail('birthday').textContent).toContain(i18n.t('syncResults.field.birthday'))

    await click(toggle)
    expect(rows[0].querySelector('[data-testid="sync-run-item-details"]')).toBeNull()

    // „ყველას გაშლა" ამ გვერდის ყველა გასაშლელს ხსნის და მერე კეცავს
    const everything = document.querySelector<HTMLButtonElement>('[data-testid="details-all"]')!
    expect(everything.textContent).toContain(i18n.t('syncResults.detail.showAll'))
    await click(everything)
    expect(all('[data-testid="sync-run-item-details"]')).toHaveLength(1)
    expect(everything.textContent).toContain(i18n.t('syncResults.detail.hideAll'))
    await click(everything)
    expect(all('[data-testid="sync-run-item-details"]')).toHaveLength(0)
  })

  it('filters by result and searches by title', async () => {
    await open()

    expect(document.querySelector('[data-testid="result-failed"]')!.textContent).toContain('1')
    await click(document.querySelector('[data-testid="result-failed"]'))
    expect(mocks.fetchSyncRunItems).toHaveBeenLastCalledWith(KEY, expect.objectContaining({ result: 'failed' }))

    const search = document.querySelector<HTMLInputElement>('[data-testid="sync-run-search"]')!
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setValue.call(search, 'matrix')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
    await flush()
    expect(mocks.fetchSyncRunItems).toHaveBeenLastCalledWith(KEY, expect.objectContaining({ result: 'failed', q: 'matrix' }))
  })

  it('pauses the picked items or every failed one and reads the list again', async () => {
    await open()

    const pausePicked = document.querySelector<HTMLButtonElement>('[data-testid="pause-picked"]')!
    expect(pausePicked.disabled).toBe(true)

    // ერთი ერთეულის მონიშვნა
    await click(all('[data-testid="sync-run-item"]')[1].querySelector('[role="checkbox"]'))
    expect(pausePicked.disabled).toBe(false)
    await click(pausePicked)
    expect(mocks.pauseSyncRunItems).toHaveBeenLastCalledWith(KEY, true, { items: [2] })
    // შენახვის შემდეგ მონიშვნა იხსნება და სია თავიდან იკითხება
    expect(pausePicked.disabled).toBe(true)
    expect(mocks.fetchSyncRunItems.mock.calls.length).toBeGreaterThanOrEqual(2)

    // გვერდის ყველა → „ისევ გაეშვას"
    await click(document.querySelector('[data-testid="pick-page"]'))
    await click(document.querySelector('[data-testid="resume-picked"]'))
    expect(mocks.pauseSyncRunItems).toHaveBeenLastCalledWith(KEY, false, { items: [1, 2, 3, 4] })

    await click(document.querySelector('[data-testid="pause-failed"]'))
    expect(mocks.pauseSyncRunItems).toHaveBeenLastCalledWith(KEY, true, { failed: true })
  })
})

describe('newRunKey', () => {
  it('is a UUID the server accepts, new on every call', async () => {
    const { newRunKey } = await vi.importActual<typeof import('@/api/syncRuns')>('@/api/syncRuns')
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

    expect(newRunKey()).toMatch(uuid)
    expect(newRunKey()).not.toBe(newRunKey())
  })
})
