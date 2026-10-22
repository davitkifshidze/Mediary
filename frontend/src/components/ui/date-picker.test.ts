import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'

/* ============================================================
   **თარიღის ამრჩევი — „დღეს" / „ახლა"**.

   ⚠️ მოწმდება: თარიღზე ღილაკი „დღეს"-ია და დღევანდელს წერს, დროიანზე „ახლა"
   — დღეს + მიმდინარე სთ:წთ; დროიან ველზე დღის არჩევა ცარიელ დროს მიმდინარით
   ავსებს და არა 09:00-ით; პერიოდზე „დღეს" დასაწყისია და მომავალ დასასრულს
   ინარჩუნებს, წარსულს — აგდებს. „ახლა" ლოკალური საათებია (არა UTC).
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

beforeAll(async () => {
  await import('@/components/ui/date-picker')
}, 60_000)
vi.setConfig({ testTimeout: 15_000 })

/** 2026-10-22, 23:47 ლოკალურად — ღამის საათი, სადაც UTC-ზე გადაყვანა დღეს გადაწევდა */
const NOW = new Date(2026, 9, 22, 23, 47, 30)

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.useRealTimers()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(node: ReturnType<typeof h>) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(TooltipProvider, null, node)))
  await flush()
  await act(async () => document.querySelector<HTMLButtonElement>('#when')!.click())
  await flush()
}

const todayButton = () => document.querySelector<HTMLButtonElement>('[data-testid="date-today"]')!

describe('lib/dates now helpers', () => {
  it('write local wall-clock time, not UTC', async () => {
    const { nowLocal, todayLocal, nowClock } = await import('@/lib/dates')

    expect(nowLocal(NOW)).toBe('2026-10-22T23:47')
    expect(todayLocal(NOW)).toBe('2026-10-22')
    expect(nowClock(NOW)).toBe('23:47')
  })
})

describe('DatePicker', () => {
  it('a date field offers "today" and writes today', async () => {
    const { DatePicker } = await import('@/components/ui/date-picker')
    const onChange = vi.fn()
    await mount(h(DatePicker, { id: 'when', value: null, onChange }))

    expect(todayButton().textContent).toBe(i18n.t('dates.today'))
    await act(async () => todayButton().click())
    expect(onChange).toHaveBeenCalledWith('2026-10-22')
  })

  it('a date-time field offers "now" and writes today with the current time', async () => {
    const { DatePicker } = await import('@/components/ui/date-picker')
    const onChange = vi.fn()
    await mount(h(DatePicker, { id: 'when', value: null, onChange, withTime: true }))

    expect(todayButton().textContent).toBe(i18n.t('dates.now'))
    await act(async () => todayButton().click())
    expect(onChange).toHaveBeenCalledWith('2026-10-22T23:47')
  })

  it('picking a day on an empty date-time field fills the current time, not 09:00', async () => {
    const { DatePicker } = await import('@/components/ui/date-picker')
    const onChange = vi.fn()
    await mount(h(DatePicker, { id: 'when', value: null, onChange, withTime: true }))

    const day = [...document.querySelectorAll<HTMLButtonElement>('.rdp-day_button')].find((b) => b.textContent === '15')!
    await act(async () => day.click())
    expect(onChange).toHaveBeenCalledWith('2026-10-15T23:47')
  })

  it('marks today in the calendar', async () => {
    const { DatePicker } = await import('@/components/ui/date-picker')
    await mount(h(DatePicker, { id: 'when', value: null, onChange: vi.fn() }))

    expect(document.querySelector('.rdp-today')?.textContent).toBe('22')
  })
})

describe('DateRangePicker', () => {
  it('"today" starts the range, keeps a later end and drops an earlier one', async () => {
    const { DateRangePicker } = await import('@/components/ui/date-picker')
    const onChange = vi.fn()
    await mount(h(DateRangePicker, { id: 'when', value: { from: '2026-10-01', to: '2026-10-30' }, onChange }))

    await act(async () => todayButton().click())
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-10-22', to: '2026-10-30' })
    act(() => root?.unmount())
    container?.remove()

    const onPast = vi.fn()
    await mount(h(DateRangePicker, { id: 'when', value: { from: '2026-10-01', to: '2026-10-10' }, onChange: onPast }))
    await act(async () => todayButton().click())
    expect(onPast).toHaveBeenLastCalledWith({ from: '2026-10-22', to: null })
  })
})
