import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import { api } from '@/lib/api'
import { defaultLayout, normalizeLayout, sameLayout, type DashboardItem } from '@/lib/dashboardLayout'
import i18n from '@/i18n'

/* ============================================================
   **მთავარი გვერდის მორგება.**

   ⚠️ მოწმდება: განლაგების ნორმალიზება (ახალი მოდული და ბლოკი ბოლოში ემატება, გამორთული
   მოდულის ბარათი ქრება, უცნობი და გამეორებული რიგი იშლება); ნაგულისხმევი რიგი დღევანდელ
   გვერდს იმეორებს; გამორთული ბლოკი **არ მონტირდება** — ე.ი. მოთხოვნასაც არ აგზავნის;
   რედაქტირების რეჟიმი ცვლილებას ცხადი „შენახვით" წერს, „გაუქმება" ძველს აბრუნებს,
   „ნაგულისხმევზე დაბრუნება" — `null`-ს.
   ============================================================ */

const cards = [
  { key: 'movie', name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', route_base: '/movies', count: 12 },
  { key: 'book', name_ka: 'წიგნები', name_en: 'Books', icon: 'BookOpen', route_base: '/books', count: 3 },
]

const mocks = vi.hoisted(() => ({
  fetchDashboard: vi.fn(),
  fetchContinuing: vi.fn(),
  fetchRecent: vi.fn(),
  fetchGoals: vi.fn(),
  fetchSoon: vi.fn(),
  saveSettings: vi.fn(),
  auth: { user: { id: 1, first_name: 'გიო', display_name: 'gio', settings: {} as Record<string, unknown> } },
  modules: {
    all: [
      { key: 'movie', name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: '#b45309', route_base: '/movies', api_base: '/movies' },
      { key: 'book', name_ka: 'წიგნები', name_en: 'Books', icon: 'BookOpen', color: '#8a5a2b', route_base: '/books', api_base: '/books' },
    ],
    enabled: [],
    mediaModules: [],
    pageModules: [],
    customModules: [],
    // მორიგეობა და ჩანაწერები გამორთულია — მათი ბლოკები სიაში საერთოდ არ უნდა იყოს
    has: (key: string) => ['movie', 'book'].includes(key),
    loading: false,
  },
}))

vi.mock('@/api/dashboard', async (original) => ({
  ...(await original<typeof import('@/api/dashboard')>()),
  fetchDashboard: mocks.fetchDashboard,
  fetchContinuing: mocks.fetchContinuing,
  fetchRecent: mocks.fetchRecent,
}))
vi.mock('@/api/goals', async (original) => ({ ...(await original<typeof import('@/api/goals')>()), fetchGoals: mocks.fetchGoals }))
vi.mock('@/api/soon', async (original) => ({ ...(await original<typeof import('@/api/soon')>()), fetchSoon: mocks.fetchSoon }))
/* ⚠️ ნამდვილი მოდულის გარეშე (`original()` არ იძახება): `lib/auth` → … → `lib/settings` წრეა, და
   ნახევრად აწყობილი მოკის დროს შეფასებული `settings` ნამდვილ `useAuth`-ს იჭერდა — პროვაიდერი
   მომხმარებელს ვერ ხედავდა. */
vi.mock('@/lib/auth', () => ({ useAuth: () => mocks.auth }))
vi.mock('@/lib/modules', async (original) => ({ ...(await original<typeof import('@/lib/modules')>()), useModules: () => mocks.modules }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom-ს `matchMedia` არ აქვს — მოდულის ბარათის მთვლელი (`CountUp`) მას ეკითხება
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

beforeAll(async () => {
  await import('@/pages/DashboardPage')
  await import('@/components/dashboard/DashboardBlocks')
  await import('@/components/goals/GoalsBlock')
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
  vi.restoreAllMocks()
  localStorage.clear()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(saved: DashboardItem[] | null = null) {
  // ⚠️ ახალი ობიექტი და ახალი id — პროვაიდერი პარამეტრებს მომხმარებლის შეცვლაზე კითხულობს
  mocks.auth.user = { ...mocks.auth.user, id: mocks.auth.user.id + 1, settings: { theme: 'dark', dashboard: saved } }
  mocks.fetchDashboard.mockResolvedValue(cards)
  mocks.fetchContinuing.mockResolvedValue([{ module: 'movie', id: 7, title: 'Dune', title_ka: 'დიუნა', photo: 'movies/posters/dune.jpg', at: null }])
  mocks.fetchRecent.mockResolvedValue([])
  mocks.fetchGoals.mockResolvedValue({ data: [], modules: ['book'] })
  mocks.fetchSoon.mockResolvedValue([])
  /* შენახვა ნამდვილი გზით მიდის (`saveSettings` → `PUT /auth/settings`); მოკი ქსელის კიდეზეა —
     `@/api/account`-ის მოდულური მოკი იმავე წრიულ იმპორტს წააწყდებოდა, რასაც `lib/auth`-ისა. */
  vi.spyOn(api, 'put').mockImplementation(async (url: string, body?: unknown) => {
    if (url === '/auth/settings') mocks.saveSettings((body as { settings: unknown }).settings)
    return { data: {} }
  })

  const { DashboardPage } = await import('@/pages/DashboardPage')
  const { SettingsProvider } = await import('@/lib/settings')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(MemoryRouter, null, h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(SettingsProvider, null, h(DashboardPage)))))),
    ),
  )
  await flush()
  await flush()
  await flush()
}

const shown = () => [...document.querySelectorAll<HTMLElement>('[data-testid="dashboard-grid"] > [data-item]')].map((el) => el.dataset.item)
const rows = () => [...document.querySelectorAll<HTMLElement>('[data-testid="dashboard-item"]')]
const click = async (testId: string) => {
  await act(async () => document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!.click())
  await flush()
}

describe('dashboardLayout', () => {
  it('the default order is goals, the module cards, then the other blocks', () => {
    expect(defaultLayout(['movie', 'book'], ['goals', 'continue', 'recent', 'soon'])).toEqual([
      { id: 'goals', on: true, width: 'full' },
      { id: 'module:movie', on: true, width: 'third' },
      { id: 'module:book', on: true, width: 'third' },
      { id: 'continue', on: true, width: 'full' },
      { id: 'recent', on: true, width: 'full' },
      { id: 'soon', on: true, width: 'full' },
    ])
  })

  it('keeps the saved order and choices, drops what is gone and appends what is new at the end', () => {
    const saved = [
      { id: 'module:book', on: true, width: 'half' },
      { id: 'duty', on: true, width: 'full' }, // მორიგეობის მოდული გამოირთო
      { id: 'goals', on: false, width: 'third' },
      { id: 'module:game', on: true, width: 'third' }, // მოდული გამოირთო
      { id: 'goals', on: true, width: 'full' }, // გამეორება
      { id: 'nonsense', on: true, width: 'full' },
      { id: 'recent', width: 'huge' }, // უცნობი სიგანე — ნაგულისხმევი
      null,
    ]

    expect(normalizeLayout(saved, ['movie', 'book'], ['goals', 'continue', 'recent'])).toEqual([
      { id: 'module:book', on: true, width: 'half' },
      { id: 'goals', on: false, width: 'third' },
      { id: 'recent', on: true, width: 'full' },
      // ახალი ბლოკი და ახალი მოდული — ბოლოში, ჩართული
      { id: 'continue', on: true, width: 'full' },
      { id: 'module:movie', on: true, width: 'third' },
    ])
    // არაფერი შენახულა — ნაგულისხმევი
    expect(sameLayout(normalizeLayout(null, ['movie'], ['goals']), defaultLayout(['movie'], ['goals']))).toBe(true)
  })
})

describe('DashboardPage', () => {
  it('draws the default layout and gives every block its own request', async () => {
    await mount()

    // მორიგეობისა და შეხსენებების ბლოკები არ არსებობს — მათი მოდული ჩართული არ არის
    expect(shown()).toEqual(['goals', 'module:movie', 'module:book', 'continue', 'recent', 'soon'])
    expect(document.querySelectorAll('[data-testid="module-card"]')).toHaveLength(2)
    expect(document.querySelector('[data-item="module:movie"]')?.getAttribute('data-width')).toBe('third')

    expect(mocks.fetchContinuing).toHaveBeenCalledTimes(1)
    expect(mocks.fetchRecent).toHaveBeenCalledTimes(1)
    expect(mocks.fetchGoals).toHaveBeenCalledWith('active')
    // „ვაგრძელებ" ჩანაწერს შინაარსის ენაზე აჩვენებს და მის გვერდზე უშვებს
    const card = document.querySelector<HTMLAnchorElement>('[data-testid="block-continue"] [data-testid="feed-card"]')!
    expect(card.textContent).toContain('დიუნა')
    expect(card.getAttribute('href')).toBe('/movies/7')
    // ცარიელი ბლოკი თვითონ იმალება
    expect(document.querySelector('[data-testid="block-recent"]')).toBeNull()
  })

  it('a block that is switched off is not mounted, so it sends no request', async () => {
    await mount([
      { id: 'module:book', on: true, width: 'half' },
      { id: 'continue', on: false, width: 'full' },
      { id: 'goals', on: false, width: 'full' },
      { id: 'module:movie', on: true, width: 'half' },
    ])

    // შენახული რიგი და სიგანე; სიაში არმყოფი ბლოკები ბოლოში დაემატა
    expect(shown()).toEqual(['module:book', 'module:movie', 'recent', 'soon'])
    expect(document.querySelector('[data-item="module:book"]')?.getAttribute('data-width')).toBe('half')
    expect(mocks.fetchContinuing).not.toHaveBeenCalled()
    expect(mocks.fetchGoals).not.toHaveBeenCalled()
    expect(mocks.fetchRecent).toHaveBeenCalledTimes(1)
  })

  it('customizing saves only on "save", and "cancel" brings the old layout back', async () => {
    await mount()

    await click('dashboard-customize')
    expect(document.querySelector('[data-testid="dashboard-grid"]')).toBeNull()
    expect(rows().map((row) => row.dataset.item)).toEqual(['goals', 'module:movie', 'module:book', 'continue', 'recent', 'soon'])
    expect(rows()[0].textContent).toContain(i18n.t('dashboard.blocks.goals'))
    expect(rows()[1].textContent).toContain('ფილმები')
    // ჯერ არაფერი შეცვლილა — „ნაგულისხმევზე დაბრუნება" გამორთულია
    expect(document.querySelector<HTMLButtonElement>('[data-testid="dashboard-reset"]')!.disabled).toBe(true)

    // „ვაგრძელებ" ითიშება — და „გაუქმება" მას აბრუნებს
    await act(async () => rows()[3].querySelector<HTMLButtonElement>('[role="switch"]')!.click())
    expect(rows()[3].querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false')
    await click('dashboard-cancel')
    expect(mocks.saveSettings).not.toHaveBeenCalled()
    expect(shown()).toContain('continue')

    // ისევ ითიშება და ინახება
    await click('dashboard-customize')
    await act(async () => rows()[3].querySelector<HTMLButtonElement>('[role="switch"]')!.click())
    await click('dashboard-save')

    expect(mocks.saveSettings).toHaveBeenCalledTimes(1)
    const sent = mocks.saveSettings.mock.calls[0][0] as { theme: string; dashboard: DashboardItem[] }
    expect(sent.theme).toBe('dark')
    expect(sent.dashboard.find((item) => item.id === 'continue')).toEqual({ id: 'continue', on: false, width: 'full' })
    expect(sent.dashboard.map((item) => item.id)).toEqual(['goals', 'module:movie', 'module:book', 'continue', 'recent', 'soon'])
    // რეჟიმი დაიხურა და ბლოკი გვერდიდან გაქრა
    expect(shown()).toEqual(['goals', 'module:movie', 'module:book', 'recent', 'soon'])
    expect(document.body.textContent).toContain(i18n.t('dashboard.saved'))
  })

  it('"back to default" clears the saved layout', async () => {
    await mount([
      { id: 'module:book', on: true, width: 'full' },
      { id: 'goals', on: false, width: 'full' },
    ])

    await click('dashboard-customize')
    expect(document.querySelector<HTMLButtonElement>('[data-testid="dashboard-reset"]')!.disabled).toBe(false)
    await click('dashboard-reset')
    expect(rows().map((row) => row.dataset.item)).toEqual(['goals', 'module:movie', 'module:book', 'continue', 'recent', 'soon'])
    await click('dashboard-save')

    expect((mocks.saveSettings.mock.calls[0][0] as { dashboard: unknown }).dashboard).toBeNull()
  })
})
