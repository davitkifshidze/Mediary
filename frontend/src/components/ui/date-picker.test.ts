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

describe('DatePicker month and year views', () => {
  const caption = () => document.querySelector<HTMLButtonElement>('[data-testid="calendar-caption"]')!
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!

  it('opens on the chosen month, not today', async () => {
    const { DatePicker } = await import('@/components/ui/date-picker')
    await mount(h(DatePicker, { id: 'when', value: '2020-05-10', onChange: vi.fn() }))

    expect(caption().textContent).toContain('2020')
    expect(document.querySelector('.rdp-selected')?.textContent).toBe('10')
  })

  it('caption → months of the year → years → a year → its months → a month → its days', async () => {
    const { DatePicker } = await import('@/components/ui/date-picker')
    const onChange = vi.fn()
    await mount(h(DatePicker, { id: 'when', value: null, onChange }))

    // თავი → მიმდინარე წლის თვეები, ზემოთ წელი; მიმდინარე თვე მონიშნულია
    await act(async () => caption().click())
    const months = document.querySelector('[data-testid="calendar-months"]')!
    expect(document.querySelector('[data-testid="calendar-year"]')?.textContent).toBe('2026')
    expect(months.querySelectorAll('.grid button')).toHaveLength(12)
    expect(months.querySelector('.fb-cal-today')?.textContent).toBe(
      new Intl.DateTimeFormat(i18n.language === 'ka' ? 'ka-GE' : 'en-US', { month: 'long' }).format(NOW),
    )

    // წელი → წლების სია (12-12), ისრით უკან
    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="calendar-year"]')!.click())
    const years = () => document.querySelector('[data-testid="calendar-years"]')!
    expect(years().textContent).toContain('2016 – 2027')
    await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('dates.prevYears')}"]`)!.click())
    expect(years().textContent).toContain('2004 – 2015')

    // წელი → იმ წლის თვეები → თვე → იმ თვის რიცხვები
    await act(async () => button('2010').click())
    expect(document.querySelector('[data-testid="calendar-year"]')?.textContent).toBe('2010')
    const march = new Intl.DateTimeFormat(i18n.language === 'ka' ? 'ka-GE' : 'en-US', { month: 'long' }).format(new Date(2010, 2, 1))
    await act(async () => button(march).click())
    expect(caption().textContent).toContain('2010')

    const day = [...document.querySelectorAll<HTMLButtonElement>('.rdp-day_button')].find(
      (b) => b.textContent === '15' && !b.closest('.rdp-outside'),
    )!
    await act(async () => day.click())
    expect(onChange).toHaveBeenCalledWith('2010-03-15')
  })
})
