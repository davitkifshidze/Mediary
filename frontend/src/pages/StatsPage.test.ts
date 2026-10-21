import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { StatModule, StatsPayload } from '@/api/stats'
import i18n from '@/i18n'

/* ============================================================
   **სტატისტიკის გვერდი — ჩანართებად**.

   ⚠️ მოწმდება ის, რასაც ტიპი ვერ ხედავს: კალენდარი და საერთო „მედია"
   აღარ არის — ფილმი, სერიალი და ანიმე ცალკე ჩანართებია, პირველი
   ნაგულისხმევია; მედია-ჩანართი სამ კითხვას ამ რიგით პასუხობს (ჟანრები · მსახიობები · თვეები);
   ცარიელ მოდულს ჩანართი არ აქვს, უცნობი `?tab=` პირველზე ბრუნდება;
   სტატუსი და მსახიობი ბმულებია.
   ⚠️ recharts-ის ზოლები jsdom-ში არ იხატება (ზომა არ აქვს) — მათი ბმულები
   `lib/statsLinks.test.ts`-შია.
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
  actors: [],
  ...over,
})

const payload: StatsPayload = {
  year: 2026,
  years: [2026, 2025],
  data: [
    empty('movie', {
      name_ka: 'ფილმები',
      total: 3,
      this_year: 4,
      last_year: 1,
      status: [{ key: 'watched', name_ka: 'ნანახი', name_en: 'Watched', role: 'done', color: null, count: 3 }],
      genres: [{ id: 5, name_ka: 'დრამა', name_en: 'Drama', slug: 'drama', count: 3 }],
      actors: [{ id: 42, name: 'Nino Kasradze', name_ka: 'ნინო ქასრაძე', photo_path: null, count: 2 }],
    }),
    empty('series', { name_ka: 'სერიალები', total: 2 }),
    empty('book', {
      name_ka: 'წიგნები',
      icon: 'BookOpen',
      color: '#f59e0b',
      total: 1,
      status: [{ key: 'read', name_ka: null, name_en: null, role: null, color: null, count: 1 }],
    }),
    // ⚠️ ჩართული, მაგრამ ცარიელი — ჩანართი არ ეკუთვნის
    empty('game', { name_ka: 'თამაშები', total: 0 }),
  ],
}

vi.mock('@/api/stats', async (original) => ({
  ...(await original<typeof import('@/api/stats')>()),
  fetchStats: vi.fn(async () => payload),
}))

vi.mock('@/lib/settings', async (original) => ({
  ...(await original<typeof import('@/lib/settings')>()),
  useContentLang: () => 'ka',
}))

const modules = vi.hoisted(() => ({
  all: [
    { key: 'movie', route_base: '/movies' },
    { key: 'series', route_base: '/series' },
    { key: 'book', route_base: '/books' },
  ] as unknown[],
  enabled: [] as unknown[],
}))
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
  it('opens on the first module, with a year picker — the calendar is gone', async () => {
    await mount()

    const list = tabs()
    expect(list[0].text).toContain('ფილმები')
    expect(list[0].active).toBe(true)
    expect(document.querySelector('[role="combobox"]')).toBeTruthy()
    expect(document.body.textContent).not.toContain('კალენდარი')
  })

  it('gives movies and series their own tabs and skips an empty module', async () => {
    await mount()

    const labels = tabs().map((t) => t.text)
    expect(labels.some((l) => l.includes('ფილმები'))).toBe(true)
    expect(labels.some((l) => l.includes('სერიალები'))).toBe(true)
    expect(labels.some((l) => l.includes('წიგნები'))).toBe(true)
    // ⚠️ საერთო „მედია" აღარ არის, ცარიელ თამაშს ჩანართი არ აქვს
    expect(labels.some((l) => l.trim() === 'მედია')).toBe(false)
    expect(labels.some((l) => l.includes('თამაშები'))).toBe(false)
  })

  it('answers the three media questions in the movie tab, in order', async () => {
    await mount('/stats?tab=movie')

    const text = document.body.textContent ?? ''
    const genres = text.indexOf(i18n.t('stats.mediaGenres'))
    const actors = text.indexOf(i18n.t('stats.mediaActors'))
    const months = text.indexOf(i18n.t('stats.mediaMonths', { year: 2026 }))

    expect(genres).toBeGreaterThanOrEqual(0)
    expect(genres).toBeLessThan(actors)
    expect(actors).toBeLessThan(months)

    // მსახიობი ქართული სახელით და მისი გვერდის ბმულით
    const link = document.querySelector<HTMLAnchorElement>('a[href="/actors/42"]')
    expect(link?.textContent).toContain('ნინო ქასრაძე')
  })

  it('a status opens its list with the matching filter', async () => {
    await mount('/stats?tab=movie')
    const movies = document.querySelector<HTMLAnchorElement>('ul a[href="/movies?view=watched"]')
    expect(movies?.textContent).toContain('ნანახი')

    act(() => root?.unmount())
    container?.remove()
    root = null

    await mount('/stats?tab=book')
    expect(document.querySelector('a[href="/books?view=read"]')).toBeTruthy()
    // წიგნს მსახიობები არ აქვს
    expect(document.body.textContent).not.toContain(i18n.t('stats.mediaActors'))
  })

  /**
   * ⚠️ „წელს/შარშან" მხოლოდ მიმდინარე წელზე ითქმის — არჩეულ წარსულ
   * წელზე იგივე სიტყვა ტყუილი იქნებოდა, ამიტომ იქ წლები პირდაპირ იწერება.
   */
  it('says this year only about the current year', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 8, 28))
      await mount('/stats?tab=movie')
      expect(document.body.textContent).toContain(
        `4 ${i18n.t('stats.thisYearNow')} · ${i18n.t('stats.lastYearNow', { count: 1 })}`,
      )
      act(() => root?.unmount())
      container?.remove()
      root = null

      vi.setSystemTime(new Date(2027, 1, 1))
      await mount('/stats?tab=movie')
      expect(document.body.textContent).toContain(
        `4 ${i18n.t('stats.thisYear', { year: 2026 })} · ${i18n.t('stats.lastYear', { count: 1, year: 2025 })}`,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('draws an error card, not the empty state, when the request fails', async () => {
    const { fetchStats } = await import('@/api/stats')
    vi.mocked(fetchStats).mockRejectedValueOnce(new Error('boom'))
    await mount()
    await flush()

    expect(document.body.textContent).toContain(i18n.t('errors.loadFailed'))
    expect(document.body.textContent).not.toContain(i18n.t('stats.empty'))
  })

  it('an unknown or empty tab falls back to the first module', async () => {
    for (const url of ['/stats?tab=nope', '/stats?tab=game', '/stats?tab=calendar', '/stats?tab=media']) {
      await mount(url)
      expect(tabs()[0].active, url).toBe(true)
      act(() => root?.unmount())
      container?.remove()
      root = null
    }
  })
})
