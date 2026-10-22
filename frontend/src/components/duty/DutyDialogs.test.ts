import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { DutySettingsData, DutyShiftType, DutyWorkplace } from '@/api/duty'
import { payMode, shiftEnd, timeRange } from '@/lib/duty'
import i18n from '@/i18n'

/* ============================================================
   **მორიგეობა — სამსახურის რეჟიმი, ნაგულისხმევები, დასრულება.**

   ⚠️ მოწმდება: სამსახურის ანაზღაურება ან „მორიგეობაზეა“ (ტარიფები), ან
   „საათზე“ (საათობრივი) — შენახვისას მეორე სუფთავდება, რომ ტიპის ტარიფმა
   საათობრივს უჩუმრად არ აჯობოს; სამსახურის არჩევისას მორიგეობის ფორმა მის
   ტიპსა და დაწყებას ავსებს და დასრულებას აჩვენებს („09:00 → 09:00 (+1)“);
   დასრულება წუთების არითმეტიკითაა (შუაღამის გადაკვეთით).
   ============================================================ */

const mocks = vi.hoisted(() => ({
  updateDutyWorkplace: vi.fn(async () => ({})),
  createDutyShift: vi.fn(async () => ({})),
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
  await import('@/components/duty/DutyWorkplaceDialog')
  await import('@/components/duty/DutyShiftDialog')
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
  await act(async () => root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, node)))))
  await flush()
}

const types: DutyShiftType[] = [
  { id: 1, key: 'h8', name_ka: '8 სთ', name_en: '8 h', hours: 8, icon: 'Sun', sort_order: 1, shifts_count: 0 },
  { id: 3, key: 'h24', name_ka: '24 სთ', name_en: '24 h', hours: 24, icon: 'Moon', sort_order: 3, shifts_count: 0 },
]

const workplace = (over: Partial<DutyWorkplace>): DutyWorkplace => ({
  id: 1,
  name: '112',
  short: '112',
  color: '#2a78d6',
  hourly_rate: null,
  default_type_id: null,
  default_start_time: null,
  is_active: true,
  sort_order: 1,
  rates: [],
  shifts_count: 0,
  ...over,
})

const card = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[data-testid="duty-pay-mode"] button[aria-pressed]')].find(
    (b) => b.textContent?.includes(label),
  )!

function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('duty helpers — end and pay mode', () => {
  it('ends hours after the start, across midnight', () => {
    expect(shiftEnd('09:00', 24)).toEqual({ time: '09:00', day: 1 })
    expect(shiftEnd('20:30', 4.5)).toEqual({ time: '01:00', day: 1 })
    expect(shiftEnd('08:00', 5)).toEqual({ time: '13:00', day: 0 })
    expect(shiftEnd(null, 24)).toBeNull()
    expect(timeRange('09:00', shiftEnd('09:00', 24))).toBe('09:00 → 09:00 (+1)')
    expect(timeRange('08:00', shiftEnd('08:00', 5))).toBe('08:00 → 13:00')
  })

  it('reads the pay mode from the rates', () => {
    expect(payMode(workplace({ rates: [{ type_id: 3, pay: 250 }] }))).toBe('shift')
    expect(payMode(workplace({ hourly_rate: 15 }))).toBe('hour')
    expect(payMode(workplace({}))).toBeNull()
  })
})

describe('DutyWorkplaceDialog — per shift or per hour', () => {
  it('shows only the rates or only the hourly rate, and clears the other one on save', async () => {
    const { DutyWorkplaceDialog } = await import('@/components/duty/DutyWorkplaceDialog')
    // ⚠️ ძველი მონაცემი ორივეთი — ტარიფი იმარჯვებს, ფანჯარა „მორიგეობაზე“ იხსნება
    await mount(
      h(DutyWorkplaceDialog, {
        workplace: workplace({ rates: [{ type_id: 3, pay: 250 }], hourly_rate: 10 }),
        types,
        nextColor: '#2a78d6',
        currency: '₾',
        onClose: () => {},
      }),
    )

    const hourly = () => document.getElementById('duty-wp-hourly')!.closest('.min-w-0')!
    expect(card(i18n.t('duty.workplace.perShift')).getAttribute('aria-pressed')).toBe('true')
    expect(hourly().className).toContain('hidden')

    await act(async () => card(i18n.t('duty.workplace.perHourMode')).click())
    expect(hourly().className).not.toContain('hidden')
    await act(async () => type(document.getElementById('duty-wp-hourly') as HTMLInputElement, '15'))

    await act(async () => (document.getElementById('duty-workplace-form') as HTMLFormElement).requestSubmit())
    await flush()
    expect(mocks.updateDutyWorkplace).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ hourly_rate: 15, rates: [], default_type_id: null, default_start_time: null }),
    )
  })

  it('sends no hourly rate per shift', async () => {
    const { DutyWorkplaceDialog } = await import('@/components/duty/DutyWorkplaceDialog')
    await mount(
      h(DutyWorkplaceDialog, {
        workplace: workplace({ rates: [{ type_id: 3, pay: 250 }], hourly_rate: 10, default_type_id: 3, default_start_time: '09:00' }),
        types,
        nextColor: '#2a78d6',
        currency: '₾',
        onClose: () => {},
      }),
    )

    await act(async () => (document.getElementById('duty-workplace-form') as HTMLFormElement).requestSubmit())
    await flush()
    const input = (mocks.updateDutyWorkplace.mock.calls[0] as unknown[])[1] as Record<string, unknown>
    expect(input).toMatchObject({ hourly_rate: null, default_type_id: 3, default_start_time: '09:00' })
    expect(input.rates).toEqual([
      { type_id: 1, pay: null },
      { type_id: 3, pay: 250 },
    ])
  })
})

describe('DutyShiftDialog — workplace defaults', () => {
  it('fills the type and start of the picked workplace and shows where the shift ends', async () => {
    const settings = { currency: '₾', default_workplace_id: 2, default_type_id: 1 } as unknown as DutySettingsData
    const workplaces = [
      workplace({ id: 1, name: '112', rates: [{ type_id: 3, pay: 250 }], default_type_id: 3, default_start_time: '09:00' }),
      workplace({ id: 2, name: 'კლინიკა', short: 'კ', hourly_rate: 15 }),
    ]
    const { DutyShiftDialog } = await import('@/components/duty/DutyShiftDialog')
    await mount(h(DutyShiftDialog, { shift: null, date: '2026-10-05', workplaces, types, settings, onClose: () => {} }))

    // კლინიკა: ნაგულისხმევი არ აქვს — მოდულის ტიპი (8 სთ), დაწყების გარეშე, თანხა 8 × 15
    expect(document.querySelector('[data-testid="duty-shift-range"]')).toBeNull()
    expect((document.getElementById('duty-pay') as HTMLInputElement).value).toBe('120')

    const chip = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === '112')!
    await act(async () => chip.click())

    expect(document.querySelector('[data-testid="duty-shift-range"]')?.textContent).toBe('09:00 → 09:00 (+1)')
    expect((document.getElementById('duty-pay') as HTMLInputElement).value).toBe('250')

    await act(async () => (document.getElementById('duty-shift-form') as HTMLFormElement).requestSubmit())
    await flush()
    expect(mocks.createDutyShift).toHaveBeenCalledWith(
      expect.objectContaining({ workplace_id: 1, type_id: 3, hours: 24, start_time: '09:00', pay: 250 }),
    )
  })
})
