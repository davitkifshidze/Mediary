import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { SyncKindRuns, SyncRun } from '@/api/syncRuns'
import type { TranslationParts } from '@/api/translations'
import type { MediaType } from '@/lib/media'
import i18n from '@/i18n'

/* ============================================================
   **თარგმანის ბარათები** — ინსტრუმენტების „თარგმანი" და მოდულის „თარგმანი".

   ⚠️ მოწმდება: თითო ნაწილი ბარათია თავისი რიცხვით; საერთო გვერდზე ჩანაწერის ნაწილს
   მოდულების ჩაშლა აქვს (ანიმე ცალკე), მოდულის გვერდზე — არა, და რიცხვები ამ მოდულზე
   იკითხება; ნაწილის ღილაკი ფანჯარას მხოლოდ ამ ნაწილით ხსნის, „ყველაფერი" — ყველა
   ნაწილით გადამოწმების გარდა; ცარიელი ნაწილის ღილაკი გამორთულია; „შედეგები" ისტორიას
   თარგმანზე გაფილტრულს ხსნის; გაწყვეტილ თარგმანს გვერდი ბარათების ზემოთ სთავაზობს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchTranslationParts: vi.fn(),
  fetchSyncKindRuns: vi.fn(),
}))

vi.mock('@/api/translations', async (original) => ({
  ...(await original<typeof import('@/api/translations')>()),
  fetchTranslationParts: mocks.fetchTranslationParts,
}))

vi.mock('@/api/syncRuns', async (original) => ({
  ...(await original<typeof import('@/api/syncRuns')>()),
  fetchSyncKindRuns: mocks.fetchSyncKindRuns,
}))

// გაშვების ფანჯარა თავის ტესტშია — აქ მხოლოდ ის მოწმდება, რომელი ნაწილებით და რომელ მოდულზე იხსნება
vi.mock('@/components/TranslateDialog', () => ({
  TranslateDialog: ({ parts, only }: { parts: string[]; only?: string }) =>
    h('div', { 'data-testid': 'translate-dialog', 'data-parts': parts.join(','), 'data-only': only ?? '' }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

const byType = (movie: number, series: number, anime: number) => ({ movie, series, anime })

const parts = (over: Partial<TranslationParts> = {}): TranslationParts => ({
  types: ['movie', 'series', 'anime'],
  parts: {
    title_ka: { count: 5, by_type: byType(3, 2, 0) },
    title_en: { count: 0, by_type: byType(0, 0, 0) },
    description_ka: { count: 7, by_type: byType(4, 2, 1) },
    description_en: { count: 1, by_type: byType(0, 1, 0) },
    review: { count: 40, by_type: byType(30, 10, 0) },
    genres: { count: 2 },
    cast_names: { count: 227 },
    cast_bios: { count: 500 },
  },
  translator_configured: true,
  tmdb_configured: true,
  ...over,
})

const run = (over: Partial<SyncRun> = {}): SyncRun => ({
  key: '0b0e7a8c-1111-4222-8333-444455556666',
  kind: 'translate',
  source: 'queue',
  total: 500,
  done: 40,
  left: 460,
  state: 'interrupted',
  resumable: true,
  retryable: false,
  stoppable: false,
  counts: { updated: 40, unchanged: 0, skipped: 0, failed: 0 },
  types: ['actor'],
  started_at: '2026-11-13T10:00:00+04:00',
  last_at: '2026-11-13T10:05:00+04:00',
  ...over,
})

const runs = (over: Partial<SyncKindRuns> = {}): SyncKindRuns => ({ runs: 0, latest: null, unfinished: [], ...over })

beforeEach(() => {
  mocks.fetchTranslationParts.mockResolvedValue(parts())
  mocks.fetchSyncKindRuns.mockResolvedValue(runs())
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

async function mount(type?: MediaType) {
  const { TranslationCards } = await import('@/components/TranslationCards')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(QueryClientProvider, { client: qc }, h(MemoryRouter, null, h(TooltipProvider, null, h(FeedbackProvider, null, h(TranslationCards, { type }))))),
    ),
  )
  await flush()
  await flush()

  return container
}

const card = (box: Element, part: string) => box.querySelector<HTMLElement>(`[data-testid="part-${part}"]`)!
const count = (box: Element, part: string) => card(box, part).querySelector('[data-testid="task-card-count"]')!.textContent
const open = (box: Element, part: string) => card(box, part).querySelector<HTMLButtonElement>('button:not([aria-label])')!

describe('TranslationCards', () => {
  it('draws one card per part with its number and the module breakdown', async () => {
    const box = await mount()

    // მთელი ბიბლიოთეკა — მოდულის გარეშე
    expect(mocks.fetchTranslationParts).toHaveBeenCalledWith(undefined)
    expect(mocks.fetchSyncKindRuns).toHaveBeenCalledWith('translate', undefined)

    expect([...box.querySelectorAll('[data-testid="translation-cards"] > section')].map((el) => el.getAttribute('data-testid'))).toEqual([
      'part-title_ka',
      'part-title_en',
      'part-description_ka',
      'part-description_en',
      'part-review',
      'part-genres',
      'part-cast_names',
      'part-cast_bios',
      'results-block',
    ])
    expect(count(box, 'title_ka')).toBe('5')
    expect(count(box, 'cast_names')).toBe('227')
    expect(count(box, 'cast_bios')).toBe('500')
    expect(card(box, 'title_ka').textContent).toContain(i18n.t('translate.part.title_ka.title'))

    // ჩანაწერის ნაწილი მოდულებად იშლება — ანიმე ცალკე; ჟანრებსა და მსახიობებს ჩაშლა არ აქვს
    const split = [...card(box, 'description_ka').querySelectorAll<HTMLElement>('[data-testid="part-by-type"] [data-module]')]
    expect(split.map((el) => [el.dataset.module, el.textContent])).toEqual([
      ['movie', `${i18n.t('nav.movies')}4`],
      ['series', `${i18n.t('nav.series')}2`],
      ['anime', `${i18n.t('nav.anime')}1`],
    ])
    expect(card(box, 'genres').querySelector('[data-testid="part-by-type"]')).toBeNull()
    expect(card(box, 'cast_names').querySelector('[data-testid="part-by-type"]')).toBeNull()

    // ცარიელი ნაწილის ღილაკი გამორთულია
    expect(open(box, 'title_en').disabled).toBe(true)
    expect(open(box, 'title_ka').disabled).toBe(false)
  })

  it('opens the window with the part of the pressed card, and with everything but review', async () => {
    const box = await mount()
    const dialog = () => box.querySelector('[data-testid="translate-dialog"]')

    expect(dialog()).toBeNull()
    await act(async () => open(box, 'cast_bios').click())
    expect(dialog()!.getAttribute('data-parts')).toBe('cast_bios')

    // გადამოწმებას მხოლოდ თავისი ბარათი ხსნის
    await act(async () => open(box, 'review').click())
    expect(dialog()!.getAttribute('data-parts')).toBe('review')

    // „ყველაფერი" — ყველა ნაწილი გადამოწმების გარდა; რიცხვი მათი ჯამია
    const all = box.querySelector<HTMLButtonElement>('[data-testid="translate-all"]')!
    expect(all.querySelector('[data-testid="count-badge"]')!.textContent).toBe(String(5 + 0 + 7 + 1 + 2 + 227 + 500))
    await act(async () => all.click())
    expect(dialog()!.getAttribute('data-parts')).toBe('title_ka,title_en,description_ka,description_en,genres,cast_names,cast_bios')
    expect(dialog()!.getAttribute('data-only')).toBe('')
  })

  it('narrows everything to one module on a module page', async () => {
    mocks.fetchTranslationParts.mockResolvedValue(
      parts({ types: ['series'], parts: { ...parts().parts, title_ka: { count: 2, by_type: { series: 2 } } } }),
    )
    const box = await mount('series')

    expect(mocks.fetchTranslationParts).toHaveBeenCalledWith('series')
    expect(mocks.fetchSyncKindRuns).toHaveBeenCalledWith('translate', 'series')
    expect(count(box, 'title_ka')).toBe('2')
    // ერთ მოდულზე ჩაშლა ზედმეტია
    expect(card(box, 'title_ka').querySelector('[data-testid="part-by-type"]')).toBeNull()

    await act(async () => open(box, 'title_ka').click())
    expect(box.querySelector('[data-testid="translate-dialog"]')!.getAttribute('data-only')).toBe('series')
  })

  it('links the results to the history filtered by translation and offers an interrupted run', async () => {
    const broken = run()
    mocks.fetchSyncKindRuns.mockResolvedValue(runs({ runs: 6, latest: broken, unfinished: [broken] }))
    const box = await mount()

    const results = box.querySelector<HTMLElement>('[data-testid="results-block"]')!
    expect(results.querySelector('[data-testid="task-card-count"]')!.textContent).toBe('6')
    expect(results.querySelector('[data-testid="translate-results-link"]')!.getAttribute('href')).toBe('/sync/results?kind=translate')
    expect(results.querySelector('[data-testid="last-run"]')!.getAttribute('href')).toBe('/sync/results/0b0e7a8c-1111-4222-8333-444455556666')

    // გაწყვეტილი თარგმანი (ლიმიტი ამოიწურა) ბარათების ზემოთაა — „გაგრძელებით"
    const offer = box.querySelector<HTMLElement>('[data-testid="sync-unfinished"] [data-testid="unfinished-run"]')!
    expect(offer.compareDocumentPosition(box.querySelector('[data-testid="translation-cards"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(offer.textContent).toContain(i18n.t('syncCards.interrupted', { kind: i18n.t('syncResults.kind.translate') }))
    expect(offer.querySelector('[data-testid="run-resume"] [data-testid="count-badge"]')!.textContent).toBe('460')
  })
})
