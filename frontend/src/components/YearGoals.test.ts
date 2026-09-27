import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'

/* ============================================================
   **მიზნები — ზოლი ბარათების ზემოთ და ახალი მოდალი** (Tasks §27.2/§27.3).

   ⚠️ მოწმდება: ზოლი მიზნის გარეშეც ჩანს („მიზანი ჯერ არ დაგისახავს"),
   მოდულის ჩართვა საწყის 12-ს სვამს, სწრაფი ვარიანტი რიცხვს ცვლის,
   „შენახვა" ინახავს, ხოლო დახურვა ცვლილებას აბრუნებს (§4.5).
   ============================================================ */

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  settings: { goals: {} as Record<string, Record<string, number>> },
  modules: {
    enabled: [
      { key: 'book', name_ka: 'წიგნები', name_en: 'Books', icon: 'BookOpen', color: '#8a5a2b' },
      { key: 'movie', name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: '#7073ff' },
    ],
  },
}))

vi.mock('@/api/stats', async (original) => ({
  ...(await original<typeof import('@/api/stats')>()),
  fetchStatsSummary: vi.fn().mockResolvedValue({
    year: 2026,
    month: 9,
    totals: { records: 0, favorites: 0, done_year: 0, done_month: 0 },
    months: [],
    done_by_module: { book: 10, movie: 30 },
    goal_modules: ['book', 'movie'],
    no_goal_modules: [],
  }),
}))

vi.mock('@/lib/settings', async (original) => ({
  ...(await original<typeof import('@/lib/settings')>()),
  useSettings: () => ({ settings: mocks.settings, set: mocks.set, save: mocks.save }),
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
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
  mocks.settings.goals = {}
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount() {
  const { YearGoals } = await import('@/components/YearGoals')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(YearGoals)))),
  )
  await flush()
}

const buttonWith = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(text))

describe('goal pace', () => {
  it('reads the elapsed part of the year and projects to its end', async () => {
    const { paceOf, yearFraction } = await import('@/components/YearGoals')
    const midYear = new Date(2026, 6, 2, 12)

    expect(yearFraction(2026, midYear)).toBeCloseTo(0.5, 1)
    expect(paceOf(10, 2026, midYear)).toBe(20)
    // ⚠️ 1 იანვარს ნულზე არ ვყოფთ
    expect(Number.isFinite(paceOf(3, 2026, new Date(2026, 0, 1)))).toBe(true)
  })
})

describe('YearGoals', () => {
  it('the bar shows even without a goal and opens the editor', async () => {
    await mount()

    const bar = buttonWith(i18n.t('goals.barEmpty'))
    expect(bar).toBeTruthy()

    await act(async () => bar!.click())
    await flush()

    expect(document.body.textContent).toContain('წიგნები')
    expect(document.body.textContent).toContain('ფილმები')
  })

  it('switching a module on starts it at 12', async () => {
    await mount()
    await act(async () => buttonWith(i18n.t('goals.barEmpty'))!.click())
    await flush()

    const toggle = document.querySelector<HTMLButtonElement>(
      `[aria-label="${i18n.t('goals.toggle', { module: 'წიგნები' })}"]`,
    )!
    await act(async () => toggle.click())

    expect(mocks.set).toHaveBeenLastCalledWith('goals', { book: { 2026: 12 } })
  })

  it('a quick option changes the target and save stores it', async () => {
    mocks.settings.goals = { book: { 2026: 12 } }
    await mount()
    await act(async () => buttonWith(i18n.t('goals.edit'))!.click())
    await flush()

    const preset = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === '24')!
    await act(async () => preset.click())
    expect(mocks.set).toHaveBeenLastCalledWith('goals', { book: { 2026: 24 } })

    await act(async () => buttonWith(i18n.t('actions.save'))!.click())
    await flush()
    expect(mocks.save).toHaveBeenCalled()
  })

  it('closing without saving puts the old goals back (§4.5)', async () => {
    mocks.settings.goals = { movie: { 2026: 52 } }
    await mount()

    // ზოლი ახლა შედეგს აჩვენებს: 30 წიგნი → ტემპით წლის ბოლოს მიზანს მიაღწევს თუ არა
    expect(document.body.textContent).toContain('30/52')

    await act(async () => buttonWith(i18n.t('goals.edit'))!.click())
    await flush()
    await act(async () => buttonWith(i18n.t('actions.cancel'))!.click())

    expect(mocks.set).toHaveBeenLastCalledWith('goals', { movie: { 2026: 52 } })
  })
})
