import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { StatModule, StatsPayload } from '@/api/stats'
import i18n from '@/i18n'

/* ============================================================
   **სტატისტიკის გვერდი — ჩანართებად** (Tasks §28.1/§28.2).

   ⚠️ მოწმდება ის, რასაც ტიპი ვერ ხედავს: კალენდარი პირველი და
   ნაგულისხმევია (წლის ამრჩევის გარეშე), ფილმი/სერიალი **ერთ** „მედიის"
   ჩანართშია და არა სამ ცალკე ბლოკში, ცარიელ მოდულს ჩანართი არ აქვს,
   ხოლო უცნობი `?tab=` კალენდარზე ბრუნდება (და არა ცარიელ გვერდზე).
   ============================================================ */

const empty = (key: string, over: Partial<StatModule> = {}): StatModule => ({
  key,
  module: key,
  name_ka: key,
  name_en: key,
  icon: 'Film',
  color: '#6366f1',
  total: 0,
  favorites: 0,
  status: [],
  years: [],
  genres: [],
  ratings: [],
  months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: 0 })),
  has_months: true,
  this_year: 0,
  last_year: 0,
  ...over,
})

const payload: StatsPayload = {
  year: 2026,
  years: [2026, 2025],
  media: {
    domains: ['movie', 'series'],
    genres: [{ id: 5, name_ka: 'დრამა', name_en: 'Drama', count: 3, by: { movie: 2, series: 1 } }],
    actors: [{ id: 42, name: 'Nino Kasradze', name_ka: 'ნინო ქასრაძე', photo_path: null, count: 2, by: { movie: 1, series: 1 } }],
    this_year: 4,
    last_year: 1,
  },
  data: [
    empty('movie', { name_ka: 'ფილმები', total: 3, status: [{ key: 'watched', name_ka: 'ნანახი', name_en: 'Watched', role: 'done', color: null, count: 3 }] }),
    empty('series', { name_ka: 'სერიალები', total: 2 }),
    empty('book', { name_ka: 'წიგნები', icon: 'BookOpen', color: '#f59e0b', total: 1, has_months: true }),
    // ⚠️ ჩართული, მაგრამ ცარიელი — ჩანართი არ ეკუთვნის
    empty('game', { name_ka: 'თამაშები', total: 0 }),
  ],
}

vi.mock('@/api/stats', async (original) => ({
  ...(await original<typeof import('@/api/stats')>()),
  fetchStats: vi.fn(async () => payload),
}))

// კალენდარს თავისი მოთხოვნები აქვს — აქ მხოლოდ ის მოწმდება, ჩანს თუ არა
vi.mock('@/components/UpcomingCard', () => ({ UpcomingCard: () => h('div', { 'data-testid': 'upcoming' }) }))

vi.mock('@/lib/settings', async (original) => ({
  ...(await original<typeof import('@/lib/settings')>()),
  useContentLang: () => 'ka',
}))

const modules = vi.hoisted(() => ({ all: [] as unknown[], enabled: [] as unknown[] }))
vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => modules,
}))

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

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(url = '/stats') {
  const { StatsPage } = await import('@/pages/StatsPage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: [url] },
        h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(StatsPage))),
      ),
    ),
  )
  await flush()
}

/** ჩანართის ღილაკები (`ScopeCard`-ის `aria-pressed`) — თანმიმდევრობით */
const tabs = () =>
  [...document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].map((b) => ({
    text: b.textContent ?? '',
    active: b.getAttribute('aria-pressed') === 'true',
  }))

describe('StatsPage', () => {
  it('opens on the calendar, without a year picker', async () => {
    await mount()

    const list = tabs()
    expect(list[0].text).toContain(i18n.t('stats.tabs.calendar'))
    expect(list[0].active).toBe(true)
    expect(document.querySelector('[data-testid="upcoming"]')).toBeTruthy()
    // ⚠️ წელი კალენდარზე არაფერს ცვლის
    expect(document.querySelector('[role="combobox"]')).toBeNull()
  })

  it('puts movies and series in one media tab and skips an empty module', async () => {
    await mount()

    const labels = tabs().map((t) => t.text)
    expect(labels.some((l) => l.includes(i18n.t('stats.tabs.media')))).toBe(true)
    expect(labels.some((l) => l.includes('წიგნები'))).toBe(true)
    // ⚠️ ფილმს და სერიალს ცალკე ჩანართი არ აქვს, ცარიელ თამაშს — საერთოდ
    expect(labels.some((l) => l.includes('ფილმები') || l.includes('სერიალები'))).toBe(false)
    expect(labels.some((l) => l.includes('თამაშები'))).toBe(false)
  })

  it('answers the three media questions in order', async () => {
    await mount('/stats?tab=media')

    const text = document.body.textContent ?? ''
    const genres = text.indexOf(i18n.t('stats.mediaGenres'))
    const actors = text.indexOf(i18n.t('stats.mediaActors'))
    const months = text.indexOf(i18n.t('stats.mediaMonths', { year: 2026 }))

    expect(genres).toBeGreaterThanOrEqual(0)
    expect(genres).toBeLessThan(actors)
    expect(actors).toBeLessThan(months)

    // მსახიობი — ქართული სახელით და მისი გვერდის ბმულით
    const link = document.querySelector<HTMLAnchorElement>('a[href="/actors/42"]')
    expect(link?.textContent).toContain('ნინო ქასრაძე')

    // წლის ამრჩევი აქ ჩანს
    expect(document.querySelector('[role="combobox"]')).toBeTruthy()
  })

  /**
   * ⚠️ „წელს/შარშან" მხოლოდ მიმდინარე წელზე ითქმის (§28.3) — არჩეულ წარსულ
   * წელზე იგივე სიტყვა ტყუილი იქნებოდა, ამიტომ იქ წლები პირდაპირ იწერება.
   */
  it('says this year only about the current year', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 8, 28))
      await mount('/stats?tab=media')
      expect(document.body.textContent).toContain(
        `4 ${i18n.t('stats.thisYearNow')} · ${i18n.t('stats.lastYearNow', { count: 1 })}`,
      )
      act(() => root?.unmount())
      container?.remove()
      root = null

      vi.setSystemTime(new Date(2027, 1, 1))
      await mount('/stats?tab=media')
      expect(document.body.textContent).toContain(
        `4 ${i18n.t('stats.thisYear', { year: 2026 })} · ${i18n.t('stats.lastYear', { count: 1, year: 2025 })}`,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('an unknown or empty tab falls back to the calendar', async () => {
    for (const url of ['/stats?tab=nope', '/stats?tab=game']) {
      await mount(url)
      expect(tabs()[0].active, url).toBe(true)
      expect(document.querySelector('[data-testid="upcoming"]'), url).toBeTruthy()
      act(() => root?.unmount())
      container?.remove()
      root = null
    }
  })
})
