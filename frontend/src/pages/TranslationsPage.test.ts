import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { TranslationSummary, TranslationUsage } from '@/api/translations'
import i18n from '@/i18n'

/* ============================================================
   **თარგმანის გვერდები** — ინსტრუმენტების `/translations` და მოდულის `/…/translations`.

   ⚠️ მოწმდება: საერთო გვერდი ნაწილების ბარათებს მთელ ბიბლიოთეკაზე ხატავს და მათ ქვემოთ
   ცალკე ბარათებად — წყაროებს (რომელი გასაღები აკლია), ხარჯს (რამდენი დარჩა დღეს) და
   პაუზას; მოდულის გვერდი იმავე ბარათებს თავის მოდულზე ხატავს, ხარჯი და პაუზა მასზე არ
   არის და ზედა ბმული საერთო გვერდზე მიდის.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchTranslationSummary: vi.fn(),
  fetchTranslationUsage: vi.fn(),
}))

vi.mock('@/api/translations', async (original) => ({
  ...(await original<typeof import('@/api/translations')>()),
  fetchTranslationSummary: mocks.fetchTranslationSummary,
  fetchTranslationUsage: mocks.fetchTranslationUsage,
}))

// ნაწილების ბარათები თავის ტესტშია — აქ მხოლოდ ის მოწმდება, რომელ მოდულზე იხატება
vi.mock('@/components/TranslationCards', () => ({
  TranslationCards: ({ type }: { type?: string }) => h('div', { 'data-testid': 'translation-cards', 'data-type': type ?? '' }),
}))

vi.mock('@/components/SettingsSaveBar', () => ({ SettingsSaveBar: () => null }))
vi.mock('@/components/CredentialMissingNotice', () => ({
  CredentialMissingNotice: ({ provider }: { provider: string; children?: ReactNode }) => h('div', { 'data-testid': `missing-${provider}` }),
}))

// ⚠️ კონტექსტის ჰუკი ყოველ გამოძახებაზე ერთსა და იმავე ობიექტს აბრუნებს
const settings = { settings: { translateDelayMs: 4000, dateFormat: 'dmy', contentLang: 'auto' }, set: vi.fn(), isDirty: () => false }
vi.mock('@/lib/settings', async (original) => ({
  ...(await original<typeof import('@/lib/settings')>()),
  useSettings: () => settings,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

const summary = (over: Partial<TranslationSummary> = {}): TranslationSummary => ({
  movie: 0,
  series: 0,
  anime: 0,
  genres: 0,
  total: 0,
  reviewable: 0,
  translator_configured: true,
  tmdb_configured: true,
  ...over,
})

const usage = (over: Partial<TranslationUsage['gemini']> = {}): TranslationUsage => ({
  gemini: { provider: 'gemini', model: 'gemini-3.5-flash', configured: true, used: 60, limit: 250, remaining: 190, rpm_used: 2, rpm_limit: 15, exhausted: false, ...over },
  recent: [],
  unfilled: [],
})

beforeEach(() => {
  mocks.fetchTranslationSummary.mockResolvedValue(summary())
  mocks.fetchTranslationUsage.mockResolvedValue(usage())
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

async function mount(node: ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(h(QueryClientProvider, { client: qc }, h(MemoryRouter, null, h(TooltipProvider, null, h(FeedbackProvider, null, node))))),
  )
  await flush()
  await flush()

  return container
}

describe('TranslationsPage', () => {
  it('draws the parts over the whole library and the cost, sources and pause as cards of their own', async () => {
    const { TranslationsPage } = await import('@/pages/TranslationsPage')
    const box = await mount(h(TranslationsPage))

    expect(box.querySelector('[data-testid="translation-cards"]')!.getAttribute('data-type')).toBe('')

    // ხარჯი: რამდენი დარჩა დღეს — რიცხვად, და რამდენია დახარჯული
    const quota = box.querySelector<HTMLElement>('[data-testid="quota-block"]')!
    expect(quota.querySelector('[data-testid="task-card-count"]')!.textContent).toBe('190')
    expect(quota.textContent).toContain(i18n.t('translate.quotaUsed', { used: 60, limit: 250 }))
    expect(quota.textContent).toContain('gemini-3.5-flash')

    // წყაროები: ორივე გასაღები არის — შეტყობინება არ ჩანს
    const sources = box.querySelector<HTMLElement>('[data-testid="sources-block"]')!
    expect(sources.textContent).toContain(i18n.t('translate.sourcesText'))
    expect(sources.querySelector('[data-testid^="missing-"]')).toBeNull()

    // პაუზა ცალკე ბარათია, რიცხვის გარეშე
    const pause = box.querySelector<HTMLElement>('[data-testid="pause-block"]')!
    expect(pause.textContent).toContain(i18n.t('settings.translateDelay'))
    expect(pause.querySelector('[data-testid="task-card-count"]')).toBeNull()
    expect(pause.querySelector('[role="combobox"]')).not.toBeNull()
  })

  it('names the missing key on the sources card and hides the cost without a Gemini key', async () => {
    mocks.fetchTranslationSummary.mockResolvedValue(summary({ translator_configured: false }))
    mocks.fetchTranslationUsage.mockResolvedValue(usage({ configured: false }))
    const { TranslationsPage } = await import('@/pages/TranslationsPage')
    const box = await mount(h(TranslationsPage))

    expect(box.querySelector('[data-testid="sources-block"] [data-testid="missing-gemini"]')).not.toBeNull()
    expect(box.querySelector('[data-testid="quota-block"]')).toBeNull()
  })
})

describe('MediaTranslationsPage', () => {
  it('draws the same cards for its module and links to the shared page', async () => {
    const { MediaTranslationsPage } = await import('@/pages/MediaTranslationsPage')
    const box = await mount(h(MediaTranslationsPage, { type: 'anime' }))

    expect(box.querySelector('[data-testid="translation-cards"]')!.getAttribute('data-type')).toBe('anime')
    expect(box.querySelector('[data-testid="translations-all-link"]')!.getAttribute('href')).toBe('/translations')
    expect(box.textContent).toContain(i18n.t('translate.section'))
    // ხარჯი, წყაროები და პაუზა მთელ თარგმანს ეხება — მოდულის გვერდზე არ არის
    expect(box.querySelector('[data-testid="quota-block"]')).toBeNull()
    expect(box.querySelector('[data-testid="pause-block"]')).toBeNull()
    expect(mocks.fetchTranslationUsage).not.toHaveBeenCalled()
  })
})
