import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { DutySettingsData, DutyShift, DutyShiftType, DutySummary, DutyWorkplace } from '@/api/duty'
import i18n from '@/i18n'

/* ============================================================
   **მორიგეობის გვერდი** — პერიოდის სათაური და ჯამი, მონიშვნა →
   „დამატება“ თითო დღეზე ტარიფით და ჯამით, ჯამების ხედი, სიის მარჯვენა ღილაკის
   მენიუ.
   ============================================================ */

const workplaces: DutyWorkplace[] = [
  { id: 1, name: 'კლინიკა', short: 'A', color: '#2a78d6', hourly_rate: 10, default_type_id: null, default_start_time: null, is_active: true, sort_order: 1, rates: [{ type_id: 3, pay: 220 }], shifts_count: 1 },
  { id: 2, name: 'საავადმყოფო', short: 'B', color: '#eb6834', hourly_rate: null, default_type_id: null, default_start_time: null, is_active: true, sort_order: 2, rates: [{ type_id: 3, pay: 300 }], shifts_count: 0 },
]

const types: DutyShiftType[] = [
  { id: 1, key: 'h8', name_ka: '8 სთ', name_en: '8 h', hours: 8, icon: 'Sun', sort_order: 1, shifts_count: 0 },
  { id: 3, key: 'h24', name_ka: '24 სთ', name_en: '24 h', hours: 24, icon: 'Moon', sort_order: 3, shifts_count: 1 },
]

const settings: DutySettingsData = {
  period: [{ since: null, day: 1 }],
  currency: '₾',
  default_workplace_id: 1,
  default_type_id: 3,
  period_start_day: 1,
  pending: null,
  current: { from: '2026-10-01', to: '2026-10-31', previous: { from: '2026-09-01', to: '2026-09-30' }, next: { from: '2026-11-01', to: '2026-11-30' } },
  remind_at: null,
  remind_telegram: false,
}

const shift: DutyShift = {
  id: 7,
  date: '2026-10-02',
  start_time: null,
  end_time: null,
  end_day: null,
  status: 'scheduled',
  hours: 24,
  pay: 220,
  note: null,
  is_favorite: false,
  workplace_id: 1,
  type_id: 3,
  workplace: { id: 1, name: 'კლინიკა', short: 'A', color: '#2a78d6' },
  type: { id: 3, name_ka: '24 სთ', name_en: '24 h', hours: 24, icon: 'Moon' },
  created_at: null,
}

const summary: DutySummary = {
  from: '2026-10-01',
  to: '2026-10-31',
  is_period: true,
  totals: { shifts: 1, hours: 24, pay: 220, unpaid: 0, cancelled: 0 },
  workplaces: [{ workplace_id: 1, shifts: 1, hours: 24, pay: 220, unpaid: 0, cancelled: 0 }],
  types: [{ type_id: 3, shifts: 1, hours: 24, pay: 220, unpaid: 0, cancelled: 0 }],
  previous: { from: '2026-09-01', to: '2026-09-30', shifts: 0, hours: 0, pay: 0, unpaid: 0, cancelled: 0 },
}

const mocks = vi.hoisted(() => ({
  fetchDutySettings: vi.fn(),
  fetchDutyPeriod: vi.fn(),
  fetchDutyWorkplaces: vi.fn(),
  fetchDutyTypes: vi.fn(),
  fetchDutyShifts: vi.fn(),
  fetchDutySummary: vi.fn(),
  fetchDutyPeriods: vi.fn(),
  batchDutyShifts: vi.fn(),
  deleteDutyShift: vi.fn(),
  updateDutyShift: vi.fn(),
}))

vi.mock('@/api/duty', async (original) => ({
  ...(await original<typeof import('@/api/duty')>()),
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

beforeAll(async () => {
  await import('@/pages/DutyPage')
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

async function flush(times = 4) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

function defaults() {
  mocks.fetchDutySettings.mockResolvedValue(settings)
  mocks.fetchDutyPeriod.mockResolvedValue(settings.current)
  mocks.fetchDutyWorkplaces.mockResolvedValue(workplaces)
  mocks.fetchDutyTypes.mockResolvedValue(types)
  mocks.fetchDutyShifts.mockResolvedValue({ items: [shift], range: { from: '2026-10-01', to: '2026-10-31' } })
  mocks.fetchDutySummary.mockResolvedValue(summary)
  mocks.fetchDutyPeriods.mockResolvedValue([])
  mocks.batchDutyShifts.mockResolvedValue([])
  mocks.deleteDutyShift.mockResolvedValue(undefined)
  mocks.updateDutyShift.mockResolvedValue(shift)
}

async function render(path = '/duty') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const { DutyPage } = await import('@/pages/DutyPage')
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () =>
    root!.render(
      h(MemoryRouter, { initialEntries: [path] }, h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(DutyPage))))),
    ),
  )
  await flush()
}

const button = (text: string, scope: ParentNode = document) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement

describe('DutyPage', () => {
  it('shows the period and its totals with the shift chip', async () => {
    defaults()
    await render()

    expect(container!.querySelector('[data-testid="duty-period-label"]')!.textContent).toContain('2026')
    expect(container!.querySelector('[data-testid="duty-period-totals"]')!.textContent).toContain('220')
    expect(container!.querySelector('[data-day="2026-10-02"] [data-testid="duty-chip"]')!.textContent).toBe('A · 24')
  })

  it('selects days and prices each one in the batch dialog', async () => {
    defaults()
    await render()

    await act(async () => button(i18n.t('duty.select.start')).click())
    expect(container!.querySelector('[data-testid="duty-selection-bar"]')).toBeTruthy()

    for (const day of ['2026-10-05', '2026-10-06']) {
      await act(async () => {
        container!.querySelector(`[data-day="${day}"]`)!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
        window.dispatchEvent(new MouseEvent('pointerup'))
      })
    }

    expect(container!.querySelector('[data-testid="duty-selection-bar"]')!.textContent).toContain(i18n.t('duty.select.count', { days: 2, shifts: 0 }))

    // ⚠️ ზოლის „დამატება“ — სათაურის „მორიგეობის დამატებაც“ ამ სიტყვას შეიცავს
    await act(async () => button(i18n.t('duty.select.add'), container!.querySelector('[data-testid="duty-selection-bar"]')!).click())
    await flush()

    // ნაგულისხმევი: კლინიკა × 24 სთ = 220 თითოზე
    expect(document.querySelectorAll('[data-testid="duty-batch-rows"] li').length).toBe(2)
    expect(document.querySelector('[data-testid="duty-batch-total"]')!.textContent).toContain('48')
    expect(document.querySelector('[data-testid="duty-batch-total"]')!.textContent).toContain('440')

    await act(async () => button(i18n.t('duty.batch.save', { count: 2 })).click())
    await flush()

    expect(mocks.batchDutyShifts).toHaveBeenCalledWith({
      workplace_id: 1,
      type_id: 3,
      items: [
        { date: '2026-10-05', type_id: 3, pay: 220 },
        { date: '2026-10-06', type_id: 3, pay: 220 },
      ],
    })
  })

  it('draws the totals view from the server summary', async () => {
    defaults()
    await render('/duty?view=totals')

    expect(mocks.fetchDutySummary).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-31', workplaceIds: undefined })
    const totals = container!.querySelector('[data-testid="duty-totals"]')!
    expect(totals.textContent).toContain(i18n.t('duty.totals.more', { value: '1' }))
    expect(container!.querySelector('[data-testid="duty-totals-workplaces"]')!.textContent).toContain('კლინიკა')
  })

  /* სიის სტრიქონზე მარჯვენა ღილაკი: რჩეული · რედაქტირება · წაშლა (დადასტურებით, ურნაში) */
  it('warns about a workplace without a rate and shows where a shift ends', async () => {
    defaults()
    mocks.fetchDutyWorkplaces.mockResolvedValue([
      ...workplaces,
      { ...workplaces[1], id: 3, name: 'სამსახური', rates: [], hourly_rate: null, shifts_count: 14 },
    ])
    mocks.fetchDutyShifts.mockResolvedValue({
      items: [{ ...shift, start_time: '09:00', end_time: '09:00', end_day: 1 }],
      range: { from: '2026-10-01', to: '2026-10-31' },
    })
    await render('/duty?view=list')

    // ტარიფის გარეშე სამსახური — გვერდი ამბობს და პარამეტრებს ხსნის
    const notice = container!.querySelector('[data-testid="duty-no-rate"]')!
    expect(notice.textContent).toContain('„სამსახური“')
    expect(notice.textContent).not.toContain('კლინიკა')
    expect(notice.querySelector('button')?.textContent).toBe(i18n.t('duty.settings.open'))

    expect(container!.querySelector('[data-testid="duty-list"]')?.textContent).toContain('09:00 → 09:00 (+1)')
  })

  it('cancels a shift from the menu, keeps the day and leaves it out of the totals', async () => {
    defaults()
    mocks.fetchDutyShifts.mockResolvedValue({
      items: [shift, { ...shift, id: 8, date: '2026-10-03', status: 'cancelled', pay: 0 }],
      range: { from: '2026-10-01', to: '2026-10-31' },
    })
    await render('/duty?view=list')

    // გაუქმებული სიაში რჩება, ჯამში — არა
    expect(container!.querySelectorAll('[data-testid="duty-list"] li')).toHaveLength(2)
    expect(container!.querySelector('[data-testid="duty-period-totals"]')!.textContent).toBe(
      i18n.t('duty.period.totals', { count: 1, hours: '24', pay: '220 ₾' }),
    )
    const crossed = container!.querySelector<HTMLElement>('[data-testid="duty-list"] [data-status="cancelled"]')!
    expect(crossed.className).toContain('line-through')

    const row = container!.querySelector('[data-testid="duty-list"] li')!
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
    })
    await flush()

    const cancel = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((m) => m.textContent?.trim() === i18n.t('duty.status.cancel'))!
    await act(async () => cancel.click())
    await flush()
    expect(mocks.updateDutyShift).toHaveBeenCalledWith(7, { status: 'cancelled' })
  })

  it('opens the row context menu in the list view and moves the shift to the trash after confirming', async () => {
    defaults()
    await render('/duty?view=list')

    const row = container!.querySelector('[data-testid="duty-list"] li')!
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
    })
    await flush()

    const item = (label: string) =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((m) => m.textContent?.trim() === label)

    for (const label of [i18n.t('actions.favorite'), i18n.t('actions.edit'), i18n.t('actions.delete')]) {
      expect(item(label), label).toBeTruthy()
    }

    await act(async () => item(i18n.t('actions.delete'))!.click())
    await flush()
    expect(mocks.deleteDutyShift).not.toHaveBeenCalled()

    await act(async () => button(i18n.t('confirm.confirm')).click())
    await flush()

    expect(mocks.deleteDutyShift).toHaveBeenCalledWith(7, expect.anything())
  })

  /* იგივე მენიუ კალენდრის ჩიპზე — „რედაქტირება“ მორიგეობის ფანჯარას ხსნის, დღისას კი არა */
  it('opens the same menu on a calendar chip and edits the shift from it', async () => {
    defaults()
    await render()

    const chip = container!.querySelector('[data-day="2026-10-02"] [data-testid="duty-chip"]')!
    await act(async () => {
      chip.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
    })
    await flush()

    const edit = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (m) => m.textContent?.trim() === i18n.t('actions.edit'),
    )
    expect(edit).toBeTruthy()

    await act(async () => edit!.click())
    await flush()

    expect(document.body.textContent).toContain(i18n.t('duty.shift.edit'))
  })
})
