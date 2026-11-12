import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { Goal } from '@/api/goals'
import i18n from '@/i18n'

/* ============================================================
   **მიზნები** — გვერდი, ბარათი და მთავარი გვერდის ბლოკი.

   ⚠️ მოწმდება: ბარათი სერვერის ნათქვამ ტემპს ამბობს („უსწრებ / ჩამორჩები N-ით") და
   თვითონ არ ითვლის; გასული პერიოდი „ისტორიაშია" თავისი შედეგით; ფანჯარა წელზე, თვესა
   და კვირაზე პერიოდის ერთ დღეს აგზავნის (ზუსტ თარიღებს სერვერი ადგენს), საკუთარზე —
   ორივე თარიღს; მთავარი გვერდის ბლოკი მხოლოდ მიმდინარეს აჩვენებს და `/goals`-ზე უშვებს.
   ============================================================ */

const goal = (extra: Partial<Goal> = {}): Goal => ({
  id: 1,
  module: 'book',
  name: null,
  period: 'year',
  starts_on: '2026-01-01',
  ends_on: '2026-12-31',
  target: 20,
  classifier_id: null,
  classifier: null,
  done: 3,
  state: 'active',
  past: false,
  days_total: 365,
  days_left: 185,
  expected: 10,
  pace: -7,
  ...extra,
})

const mocks = vi.hoisted(() => ({
  fetchGoals: vi.fn(),
  fetchGoalClassifiers: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
  modules: {
    all: [{ key: 'book', name_ka: 'წიგნები', name_en: 'Books', icon: 'BookOpen', color: '#8a5a2b' }],
    enabled: [],
    mediaModules: [],
    pageModules: [],
    customModules: [],
    has: () => true,
    loading: false,
  },
}))

vi.mock('@/api/goals', async (original) => ({
  ...(await original<typeof import('@/api/goals')>()),
  fetchGoals: mocks.fetchGoals,
  fetchGoalClassifiers: mocks.fetchGoalClassifiers,
  createGoal: mocks.createGoal,
  updateGoal: mocks.updateGoal,
  deleteGoal: mocks.deleteGoal,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  // ⚠️ ყოველ გამოძახებაზე იგივე ობიექტი — სხვაგვარად ეფექტები უსასრულოდ ეშვება
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
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

beforeAll(async () => {
  await import('@/pages/GoalsPage')
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
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(node: ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(h(MemoryRouter, null, h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, node))))),
  )
  await flush()
  await flush()
  return container
}

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-testid="goal-card"]')]
const cuts = () => [...document.querySelectorAll<HTMLButtonElement>('[data-testid="goal-cuts"] button')]
const type = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const list = [
  goal(),
  goal({ id: 2, name: 'ივლისის კითხვა', period: 'month', starts_on: '2026-07-01', ends_on: '2026-07-31', target: 2, done: 0, state: 'upcoming', expected: null, pace: null }),
  goal({ id: 3, starts_on: '2025-01-01', ends_on: '2025-12-31', target: 10, done: 12, state: 'achieved', past: true, expected: null, pace: null }),
  goal({ id: 4, period: 'month', starts_on: '2026-05-01', ends_on: '2026-05-31', target: 3, done: 1, state: 'failed', past: true, expected: null, pace: null }),
]

describe('GoalsPage', () => {
  it('shows current goals with the pace the server reported and keeps past periods in the history', async () => {
    mocks.fetchGoals.mockResolvedValue({ data: list, modules: ['book'] })
    const { GoalsPage } = await import('@/pages/GoalsPage')
    await mount(h(GoalsPage))

    expect(cuts().map((b) => b.textContent)).toEqual([expect.stringContaining('2'), expect.stringContaining('2')])
    expect(cards()).toHaveLength(2)

    const active = cards()[0]
    // სახელის გარეშე — მოდული და რიცხვი
    expect(active.textContent).toContain(i18n.t('goals.defaultName', { module: 'წიგნები', count: 20 }))
    expect(active.querySelector('[data-testid="goal-progress"]')?.textContent).toBe('3 / 20')
    expect(active.querySelector('[data-testid="goal-pace"]')?.textContent).toContain(i18n.t('goals.behind', { count: 7 }))
    expect(active.querySelector('[data-testid="goal-pace"]')?.textContent).toContain(i18n.t('goals.daysLeft', { count: 185 }))
    // ჯერ არდაწყებულს ტემპი არ აქვს
    expect(cards()[1].textContent).toContain('ივლისის კითხვა')
    expect(cards()[1].textContent).toContain(i18n.t('goals.state.upcoming'))
    expect(cards()[1].textContent).not.toContain(i18n.t('goals.onTrack'))

    await act(async () => cuts()[1].click())

    // ისტორია ახლიდან ძველისკენ, ორივე შედეგით
    expect(cards().map((c) => c.dataset.state)).toEqual(['failed', 'achieved'])
    expect(cards()[0].textContent).toContain(i18n.t('goals.state.failed'))
    expect(cards()[1].textContent).toContain(i18n.t('goals.state.achieved'))
  })

  it('a goal ahead of schedule says so, and one exactly on it too', async () => {
    mocks.fetchGoals.mockResolvedValue({ data: [goal({ done: 14, pace: 4 }), goal({ id: 2, done: 10, pace: 0 })], modules: ['book'] })
    const { GoalsPage } = await import('@/pages/GoalsPage')
    await mount(h(GoalsPage))

    expect(cards()[0].querySelector('[data-testid="goal-pace"]')?.textContent).toContain(i18n.t('goals.ahead', { count: 4 }))
    expect(cards()[1].querySelector('[data-testid="goal-pace"]')?.textContent).toContain(i18n.t('goals.onTrack'))
  })

  it('adding a yearly goal sends one day of the period, the number and no condition', async () => {
    mocks.fetchGoals.mockResolvedValue({ data: [], modules: ['book'] })
    mocks.fetchGoalClassifiers.mockResolvedValue([{ id: 7, name_ka: 'ფენტეზი', name_en: 'Fantasy' }])
    mocks.createGoal.mockResolvedValue(goal())
    const { GoalsPage } = await import('@/pages/GoalsPage')
    await mount(h(GoalsPage))

    // ცარიელზე — ცარიელი მდგომარეობა ღილაკით
    expect(document.body.textContent).toContain(i18n.t('goals.emptyCurrent'))
    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="goal-add"]')!.click())
    await flush()

    expect(mocks.fetchGoalClassifiers).toHaveBeenCalledWith('book')
    await type(document.getElementById('goal-year') as HTMLInputElement, '2027')
    await type(document.getElementById('goal-target') as HTMLInputElement, '24')
    await type(document.getElementById('goal-name') as HTMLInputElement, ' წელს 24 ')

    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="goal-form"] button[type="submit"]')!.click())
    await flush()

    expect(mocks.createGoal).toHaveBeenCalledWith({
      module: 'book', name: 'წელს 24', period: 'year', starts_on: '2027-01-01', target: 24, classifier_id: null,
    })
    expect(document.querySelector('[data-testid="goal-form"]')).toBeNull()
  })

  it('editing a custom-period goal sends both dates and keeps its condition; delete asks first', async () => {
    const custom = goal({ id: 9, period: 'custom', starts_on: '2026-07-10', ends_on: '2026-08-20', classifier_id: 7, classifier: { name_ka: 'ფენტეზი', name_en: 'Fantasy' } })
    mocks.fetchGoals.mockResolvedValue({ data: [custom], modules: ['book'] })
    mocks.fetchGoalClassifiers.mockResolvedValue([{ id: 7, name_ka: 'ფენტეზი', name_en: 'Fantasy' }])
    mocks.updateGoal.mockResolvedValue(custom)
    mocks.deleteGoal.mockResolvedValue(undefined)
    const { GoalsPage } = await import('@/pages/GoalsPage')
    await mount(h(GoalsPage))

    // პირობა ბარათზე ჩანს
    expect(cards()[0].textContent).toContain('ფენტეზი')

    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="goal-edit"]')!.click())
    await flush()
    await type(document.getElementById('goal-target') as HTMLInputElement, '6')
    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="goal-form"] button[type="submit"]')!.click())
    await flush()

    expect(mocks.updateGoal).toHaveBeenCalledWith(9, {
      module: 'book', name: null, period: 'custom', starts_on: '2026-07-10', ends_on: '2026-08-20', target: 6, classifier_id: 7,
    })

    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="goal-delete"]')!.click())
    await flush()
    expect(mocks.deleteGoal).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain(i18n.t('goals.deleteTitle'))
  })
})

describe('GoalsBlock', () => {
  it('shows the running goals compactly and links to the page', async () => {
    mocks.fetchGoals.mockResolvedValue({ data: list.slice(0, 2), modules: ['book'] })
    const { GoalsBlock } = await import('@/components/goals/GoalsBlock')
    await mount(h(GoalsBlock))

    expect(mocks.fetchGoals).toHaveBeenCalledWith('active')
    // ჯერ არდაწყებული მთავარზე არ ჩანს; მოქმედებები მხოლოდ გვერდზეა
    expect(cards()).toHaveLength(1)
    expect(document.querySelector('[data-testid="goal-edit"]')).toBeNull()
    expect(document.querySelector<HTMLAnchorElement>('[data-testid="goals-all"]')?.getAttribute('href')).toBe('/goals')
  })

  it('says so on one line when there is no running goal', async () => {
    mocks.fetchGoals.mockResolvedValue({ data: [], modules: ['book'] })
    const { GoalsBlock } = await import('@/components/goals/GoalsBlock')
    await mount(h(GoalsBlock))

    expect(document.querySelector('[data-testid="goals-block"]')?.textContent).toContain(i18n.t('goals.blockEmpty'))
    expect(document.querySelector('[data-empty-state="line"]')).not.toBeNull()
  })
})
