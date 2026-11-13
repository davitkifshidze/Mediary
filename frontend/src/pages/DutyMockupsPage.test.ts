import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { DutyPeriodInfo, DutyShift, DutyWorkplace } from '@/api/duty'
import i18n from '@/i18n'

/* ============================================================
   **მორიგეობის მაკეტები** — დროებითი გვერდი (`/duty/mockups`).

   ⚠️ მოწმდება მხოლოდ ის, რომ სამივე ვარიანტი ნამდვილი ფორმის მონაცემს უძლებს: ორი
   მორიგეობა ერთ დღეს, თანხისა და დაწყების დროის გარეშე მორიგეობა, ნაწილობრივი და
   გაუქმებული, ასოს გარეშე სამსახური, პერიოდი, რომელიც კვირის შუაში იწყება. ჯამში
   გაუქმებული არ ითვლება; თანხის არქონაზე ტირე იწერება და არა „0". გვერდი არჩევანის
   შემდეგ ამ ტესტთან ერთად იშლება.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchDutySettings: vi.fn(),
  fetchDutyPeriod: vi.fn(),
  fetchDutyWorkplaces: vi.fn(),
  fetchDutyShifts: vi.fn(),
}))

vi.mock('@/api/duty', async (original) => ({
  ...(await original<typeof import('@/api/duty')>()),
  ...mocks,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

// ნოემბერი 2026 კვირა დღეს იწყება — პირველი კვირა თითქმის მთლიანად პერიოდის გარეთაა
const PERIOD: DutyPeriodInfo = {
  from: '2026-11-01',
  to: '2026-11-30',
  previous: { from: '2026-10-01', to: '2026-10-31' },
  next: { from: '2026-12-01', to: '2026-12-31' },
}

const workplace = (id: number, name: string, short: string | null, color: string): DutyWorkplace => ({
  id,
  name,
  short,
  color,
  hourly_rate: null,
  default_type_id: null,
  default_start_time: null,
  period_day: 1,
  period_pending: null,
  is_active: true,
  sort_order: id,
  rates: [],
  shifts_count: 0,
})

const WORKPLACES = [workplace(1, 'სამსახური', 'ს', '#2a78d6'), workplace(2, 'რესპუბლიკური', null, '#eb6834')]

let nextId = 1
const shift = (date: string, over: Partial<DutyShift> = {}): DutyShift => ({
  id: nextId++,
  date,
  start_time: '10:00',
  end_time: '22:00',
  end_day: 0,
  status: 'scheduled',
  hours: 12,
  pay: null,
  note: null,
  is_favorite: false,
  workplace_id: 1,
  type_id: 1,
  pattern_id: null,
  workplace: { id: 1, name: 'სამსახური', short: 'ს', color: '#2a78d6' },
  type: { id: 1, name_ka: '12 სთ', name_en: '12 h', hours: 12, icon: null },
  created_at: null,
  ...over,
})

const SHIFTS = [
  shift('2026-11-02'),
  shift('2026-11-04', { pattern_id: 1, pay: 150 }),
  // ერთ დღეს ორი: დროის გარეშე და ნაწილობრივი მეორე სამსახურში
  shift('2026-11-05', { start_time: null, end_time: null, end_day: null, hours: 8 }),
  shift('2026-11-05', { status: 'partial', hours: 10, pay: 0, workplace_id: 2, workplace: { id: 2, name: 'რესპუბლიკური', short: null, color: '#eb6834' }, type: { id: 2, name_ka: '24 სთ', name_en: '24 h', hours: 24, icon: null } }),
  shift('2026-11-11', { status: 'cancelled', hours: 24, pay: 300, note: 'გაუქმდა' }),
  shift('2026-11-30', { hours: 24, end_time: '10:00', end_day: 1 }),
]

beforeEach(() => {
  mocks.fetchDutySettings.mockResolvedValue({ currency: '₾', current: PERIOD })
  mocks.fetchDutyPeriod.mockResolvedValue(PERIOD)
  mocks.fetchDutyWorkplaces.mockResolvedValue(WORKPLACES)
  mocks.fetchDutyShifts.mockResolvedValue({ items: SHIFTS, total: SHIFTS.length, lastPage: 1 })
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

async function mount(url: string) {
  const { DutyMockupsPage } = await import('@/pages/DutyMockupsPage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(QueryClientProvider, { client: qc }, h(MemoryRouter, { initialEntries: [url] }, h(TooltipProvider, null, h(FeedbackProvider, null, h(DutyMockupsPage))))),
    ),
  )
  await flush()
  await flush()

  return container
}

// გაუქმებული არ ითვლება: 5 მორიგეობა · 12 + 12 + 8 + 10 + 24 = 66 სთ · 150 ₾
const TOTALS = () => i18n.t('duty.period.totals', { count: 5, hours: '66', pay: '150 ₾' })

describe('DutyMockupsPage', () => {
  it('draws the day cards with the summary on top and the picked day beside', async () => {
    const box = await mount('/duty/mockups')

    expect(box.querySelector('[data-testid="duty-mockup-cards"]')).not.toBeNull()
    // პერიოდის 30 დღე ბარათებად; გარეთ მყოფი დღე ბარათი არ არის
    expect(box.querySelectorAll('[data-testid="mock-day"]')).toHaveLength(30)
    // ექვსივე მორიგეობა ჩანს (ბადეშიც და ტელეფონის სიაშიც)
    expect(box.querySelectorAll('.hidden [data-testid="mock-shift"]')).toHaveLength(6)
    // ჯამები: გაუქმებულის გარეშე
    expect(box.textContent).toContain('66')
    expect(box.textContent).toContain('150 ₾')

    // დღის არჩევა გვერდით პანელს ცვლის: ორი მორიგეობა, ნაწილობრივი ნიშნით
    const fifth = [...box.querySelectorAll<HTMLButtonElement>('[data-testid="mock-day"]')][4]
    await act(async () => fifth.click())
    const detail = box.querySelector('[data-testid="mock-day-detail"]')!
    expect(detail.querySelectorAll('li')).toHaveLength(2)
    expect(detail.textContent).toContain('რესპუბლიკური')
    expect(detail.textContent).toContain(i18n.t('duty.status.partial'))
    // მაკეტი მხოლოდ კითხულობს — დღე ნამდვილ გვერდზე იხსნება
    expect(detail.querySelector('a')!.getAttribute('href')).toBe('/duty?date=2026-11-05')
  })

  it('draws the week feed with a total per week', async () => {
    const box = await mount('/duty/mockups?v=feed')

    expect(box.querySelector('[data-testid="duty-mockup-feed"]')).not.toBeNull()
    const rows = [...box.querySelectorAll<HTMLAnchorElement>('[data-testid="mock-feed-row"]')]
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      '/duty?date=2026-11-02',
      '/duty?date=2026-11-04',
      '/duty?date=2026-11-05',
      '/duty?date=2026-11-05',
      '/duty?date=2026-11-11',
      '/duty?date=2026-11-30',
    ])
    // თანხის გარეშე მორიგეობაზე ტირე; პატარა კალენდარი მთელ კვირებს ხატავს
    expect(rows[0].textContent).toContain('—')
    expect(box.querySelectorAll('[data-testid="mock-mini-day"]').length % 7).toBe(0)
    // 2–8 ნოემბრის კვირა: ოთხი მორიგეობა, 42 სთ, 150 ₾
    expect(box.querySelector('[data-testid="mock-feed"]')!.textContent).toContain(i18n.t('duty.period.totals', { count: 4, hours: '42', pay: '150 ₾' }))
    expect(box.textContent).toContain('თავისუფალი კვირა')
  })

  it('draws the dense grid with a weekly total column and the workplace shares', async () => {
    const box = await mount('/duty/mockups?v=dense')

    expect(box.querySelector('[data-testid="duty-mockup-dense"]')).not.toBeNull()
    expect(box.querySelectorAll('[data-testid="mock-dense-day"]')).toHaveLength(30)
    expect(box.querySelector('[data-testid="mock-dense-totals"]')!.textContent).toBe(TOTALS())

    // ყოველ კვირას თავისი ჯამი აქვს; თანხა მხოლოდ იქ, სადაც არის
    const sums = [...box.querySelectorAll('[data-testid="mock-week-sum"]')].map((cell) => cell.textContent)
    expect(sums).toHaveLength(6)
    expect(sums[1]).toContain(i18n.t('duty.hoursValue', { hours: '42' }))
    expect(sums[1]).toContain('150 ₾')
    expect(sums[0]).toBe('—')

    // ასოს გარეშე სამსახური სახელის პირველ ასოს იღებს; ლეგენდა ორივე სამსახურს ითვლის
    expect(box.textContent).toContain('რ 10 / 24')
    expect(box.querySelector('[data-testid="mock-legend"]')!.querySelectorAll('li')).toHaveLength(2)

    // დაჭერა დღეს ბადის ქვემოთ შლის, მეორე დაჭერა კეცავს
    const day = [...box.querySelectorAll<HTMLButtonElement>('[data-testid="mock-dense-day"]')][10]
    await act(async () => day.click())
    expect(box.querySelector('[data-testid="mock-day-detail"]')!.textContent).toContain('გაუქმდა')
    await act(async () => day.click())
    expect(box.querySelector('[data-testid="mock-day-detail"]')).toBeNull()
  })
})
