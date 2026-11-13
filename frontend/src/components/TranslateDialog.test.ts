import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { TranslationPart, TranslationParts, TranslationPlan } from '@/api/translations'
import type { MediaType } from '@/lib/media'
import i18n from '@/i18n'

/* ============================================================
   **თარგმანის გაშვების ფანჯარა** — ნაწილებით.

   ⚠️ მოწმდება: ფანჯარა იმ ნაწილებით იხსნება, რომლითაც ბარათმა გახსნა, და გეგმას მხოლოდ
   მათზე ითხოვს; ნაწილის მონიშვნა გეგმას ცვლის; ჩანაწერის ნაწილის გარეშე მოდული, სკოუპი
   და „დამუშავებულების დამალვა" არ ჩანს (მსახიობებსა და ჟანრებს ისინი არ ეხება);
   გადამოწმება გაფრთხილებას აჩენს; ქვედა ხაზი წერს, რამდენი ჩანაწერი და მსახიობია და
   რამდენ დღეს გაწვდება Gemini-ს დღიური ლიმიტი; გაშვება რიგს აძლევს ჩანაწერებს,
   მსახიობებს და არჩეულ ველებს — ერთი ნაწილის გაშვება სხვას არ ეხება; მოდულის
   გვერდიდან გახსნილი ფანჯარა მხოლოდ ამ მოდულს გეგმავს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchTranslationParts: vi.fn(),
  fetchTranslationPlan: vi.fn(),
  enqueueTranslate: vi.fn(),
}))

vi.mock('@/api/translations', async (original) => ({
  ...(await original<typeof import('@/api/translations')>()),
  fetchTranslationParts: mocks.fetchTranslationParts,
  fetchTranslationPlan: mocks.fetchTranslationPlan,
}))

vi.mock('@/api/media', async (original) => ({
  ...(await original<typeof import('@/api/media')>()),
  fetchGenres: async () => [],
}))

// ⚠️ კონტექსტის ჰუკი ყოველ გამოძახებაზე ერთსა და იმავე ობიექტს აბრუნებს
const queue = { enqueueTranslate: mocks.enqueueTranslate, isBusy: false }
vi.mock('@/components/ui/queue', () => ({ useQueue: () => queue }))

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

const NO_STATUSES: never[] = []
vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useMergedStatuses: () => NO_STATUSES,
}))

// მოდულის ბარათები, ჩანაწერების ამრჩევი და ჟანრები თავის ტესტებშია — აქ მხოლოდ ჩანს თუ არა
vi.mock('@/components/MediaDomainCards', () => ({ MediaDomainCards: () => h('div', { 'data-testid': 'domain-cards' }) }))
vi.mock('@/components/MediaRecordPicker', () => ({ MediaRecordPicker: () => null }))
vi.mock('@/components/GenreSelect', () => ({ GenreSelect: () => null }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

const parts = (): TranslationParts => ({
  types: ['movie', 'series', 'anime'],
  parts: {
    title_ka: { count: 5 },
    title_en: { count: 0 },
    description_ka: { count: 7 },
    description_en: { count: 1 },
    review: { count: 40 },
    genres: { count: 2 },
    cast_names: { count: 3 },
    cast_bios: { count: 500 },
  },
  translator_configured: true,
  tmdb_configured: true,
})

const plan = (over: Partial<TranslationPlan> = {}): TranslationPlan => ({
  items: [{ type: 'movie', id: 1, title: 'The Matrix', year: 1999, missing: ['title_ka'], review: false }],
  count: 1,
  cast: [],
  cast_count: 0,
  genres: 0,
  genres_pending: 2,
  eta_seconds: 8,
  gemini: { requests: 1, limit: 250, remaining: 250, days: 1 },
  ...over,
})

beforeEach(() => {
  mocks.fetchTranslationParts.mockResolvedValue(parts())
  mocks.fetchTranslationPlan.mockResolvedValue(plan())
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

async function mount(picked: TranslationPart[], only?: MediaType) {
  const { TranslateDialog } = await import('@/components/TranslateDialog')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(MemoryRouter, null, h(TooltipProvider, null, h(FeedbackProvider, null, h(TranslateDialog, { open: true, onOpenChange: () => {}, only, parts: picked })))),
      ),
    ),
  )
  await flush()
  await flush()
}

const part = (key: string) => document.querySelector<HTMLButtonElement>(`[data-testid="translate-part-${key}"]`)!
const pressed = () => [...document.querySelectorAll<HTMLButtonElement>('[data-testid="translate-parts"] button[aria-pressed="true"]')].map((b) => b.dataset.testid!.replace('translate-part-', ''))
const click = async (el: Element | null | undefined) => {
  act(() => (el as HTMLElement).click())
  await flush()
  await flush()
}
const runButton = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === i18n.t('translate.run'))!

describe('TranslateDialog', () => {
  it('opens with the parts of the card, shows their numbers and plans only them', async () => {
    await mount(['title_ka'])

    expect(pressed()).toEqual(['title_ka'])
    // რიცხვი — იგივე, რაც გვერდის ბარათზეა
    expect(part('title_ka').querySelector('[data-testid="count-badge"]')!.textContent).toBe('5')
    expect(part('cast_bios').querySelector('[data-testid="count-badge"]')!.textContent).toBe('500')
    expect(mocks.fetchTranslationPlan).toHaveBeenLastCalledWith(expect.objectContaining({ parts: ['title_ka'], types: ['movie', 'series', 'anime'], hide_processed: true }))

    // მეორე ნაწილის მონიშვნა გეგმას ცვლის; რიგი ნაწილების საერთო რიგია და არა დაჭერისა
    await click(part('description_ka'))
    await click(part('genres'))
    expect(mocks.fetchTranslationPlan).toHaveBeenLastCalledWith(expect.objectContaining({ parts: ['title_ka', 'description_ka', 'genres'] }))

    // გაშვება: ჩანაწერები, ჟანრები და მხოლოდ არჩეული ველები — გადამოწმების გარეშე
    await click(runButton())
    expect(mocks.enqueueTranslate).toHaveBeenCalledWith(plan().items, true, ['tmdb', 'gemini'], false, { fields: ['title_ka', 'description_ka'], cast: [] })
  })

  it('hides the record controls for actor parts and tells how long the daily limit lasts', async () => {
    const cast = [
      { type: 'actor' as const, id: 7, title: 'Keanu Reeves', missing: ['name' as const, 'biography' as const] },
      { type: 'actor' as const, id: 8, title: 'Carrie-Anne Moss', missing: ['biography' as const] },
    ]
    mocks.fetchTranslationPlan.mockResolvedValue(plan({ items: [], count: 0, cast, cast_count: 2, gemini: { requests: 503, limit: 250, remaining: 100, days: 3 } }))
    await mount(['cast_names', 'cast_bios'])

    // მსახიობებს მოდული, სკოუპი და „დამუშავებულების დამალვა" არ ეხება
    expect(document.querySelector('[data-testid="hide-processed"]')).toBeNull()
    expect(document.querySelector('[data-testid="domain-cards"]')).toBeNull()

    const summary = document.querySelector('[data-testid="translate-summary"]')!.textContent!
    expect(summary).toContain(i18n.t('translate.castAffected', { count: 2 }))
    expect(summary).not.toContain(i18n.t('sync.affected', { count: 0 }))
    // ხარჯი გაშვებამდე: რამდენი მოთხოვნაა და რამდენ დღეს გაწვდება ლიმიტი
    expect(document.querySelector('[data-testid="gemini-cost"]')!.textContent).toBe(i18n.t('translate.geminiDays', { requests: 503, limit: 250, count: 3 }))

    await click(runButton())
    // ჩანაწერის ველი არცერთი — მსახიობები კი გეგმიდან, თავისი ნაწილებით
    expect(mocks.enqueueTranslate).toHaveBeenCalledWith([], false, ['tmdb', 'gemini'], false, { fields: [], cast })

    // ჩანაწერის ნაწილის მონიშვნაზე მათი კონტროლები ბრუნდება
    await click(part('title_en'))
    expect(document.querySelector('[data-testid="hide-processed"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="domain-cards"]')).not.toBeNull()
  })

  it('warns that review writes over existing text and passes it to the queue', async () => {
    await mount(['title_ka'])
    expect(document.querySelector('[data-testid="review-warn"]')).toBeNull()

    await click(part('review'))
    expect(document.querySelector('[data-testid="review-warn"]')!.textContent).toBe(i18n.t('translate.reviewWarn'))

    await click(runButton())
    expect(mocks.enqueueTranslate).toHaveBeenCalledWith(plan().items, false, ['tmdb', 'gemini'], true, { fields: ['title_ka'], cast: [] })
  })

  it('cannot run without a part, and plans one module when opened from its page', async () => {
    mocks.fetchTranslationPlan.mockResolvedValue(plan({ items: [], count: 0 }))
    await mount(['title_ka'], 'series')

    // მოდულის გვერდი: რიცხვებიც და გეგმაც მხოლოდ ამ მოდულზე; ერთ მოდულზე არჩევანი არ არსებობს
    expect(mocks.fetchTranslationParts).toHaveBeenCalledWith('series')
    expect(mocks.fetchTranslationPlan).toHaveBeenLastCalledWith(expect.objectContaining({ types: ['series'] }))
    expect(document.querySelector('[data-testid="domain-cards"]')).toBeNull()

    await click(part('title_ka'))
    expect(pressed()).toEqual([])
    expect(document.body.textContent).toContain(i18n.t('translate.partsRequired'))
    expect(runButton().disabled).toBe(true)
  })
})
