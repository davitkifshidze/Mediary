import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DateLib } from 'react-day-picker'
import { enUS, ka } from 'react-day-picker/locale'
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

  /* ფანჯრის ბოლო: დღე დღის ბოლომდე მოქმედებს, „ახლა" კი აქ უაზროა — „დღეს" */
  it('a field with a default time fills it on a picked day and offers "today" at that time', async () => {
    const { DatePicker } = await import('@/components/ui/date-picker')
    const onChange = vi.fn()
    await mount(h(DatePicker, { id: 'when', value: null, onChange, withTime: true, defaultTime: '23:59' }))

    const day = [...document.querySelectorAll<HTMLButtonElement>('.rdp-day_button')].find((b) => b.textContent === '15')!
    await act(async () => day.click())
    expect(onChange).toHaveBeenLastCalledWith('2026-10-15T23:59')

    expect(todayButton().textContent).toBe(i18n.t('dates.today'))
    await act(async () => todayButton().click())
    expect(onChange).toHaveBeenLastCalledWith('2026-10-22T23:59')
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
  /** თვის სახელი კალენდრის ლოკალიდან — იგივე წყარო, რაც დღეების თავს წერს */
  const monthName = (date: Date) => new DateLib({ locale: i18n.language === 'ka' ? ka : enUS }).format(date, 'LLLL')
  const caption = () => document.querySelector<HTMLButtonElement>('[data-testid="calendar-caption"]')!
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!

  it('opens on the chosen month, not today', async () => {
    const { DatePicker } = await import('@/components/ui/date-picker')
    await mount(h(DatePicker, { id: 'when', value: '2020-05-10', onChange: vi.fn() }))

    expect(caption().textContent).toContain('2020')
    expect(document.querySelector('.rdp-selected')?.textContent).toBe('10')
  })

  it('marks only the chosen month — not the current one', async () => {
    const { DatePicker } = await import('@/components/ui/date-picker')
    // დღეს 22 ოქტომბერია, ველში — 1 ნოემბერი
    await mount(h(DatePicker, { id: 'when', value: '2026-11-01T09:00', withTime: true, onChange: vi.fn() }))

    await act(async () => caption().click())
    const cells = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="calendar-months"] .fb-cal-cell')]
    const pressed = cells.filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.textContent)
    expect(pressed).toEqual([monthName(new Date(2026, 10, 1))])
    expect(cells[9].className).toBe('fb-cal-cell')
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
    // მიმდინარე თვე ცალკე არ ინიშნება — ცარიელ ველზე არცერთი თვე არაა მონიშნული
    expect(months.querySelector('.fb-cal-today')).toBeNull()
    expect(months.querySelector('[aria-pressed="true"]')).toBeNull()
    // დღეების ხედის ჩარჩო: იგივე ფესვი, მსხვილი თავი და ბიბლიოთეკის ისრები
    expect(months.className).toContain('rdp-root')
    expect(months.className).toContain('fb-rdp')
    expect(months.querySelector('.rdp-month_caption')).not.toBeNull()
    expect(months.querySelectorAll('.rdp-nav .rdp-chevron')).toHaveLength(2)
    // სახელები სრულად — ბადე შიგთავსის სიგანისაა, უჯრა არ იკვეცება
    const grid = months.querySelector('[data-testid="calendar-grid"]')!
    expect(grid.className).toContain('w-max')
    expect([...grid.children].every((c) => !c.className.includes('truncate'))).toBe(true)

    // წელი → წლების სია (12-12), ისრით უკან
    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="calendar-year"]')!.click())
    const years = () => document.querySelector('[data-testid="calendar-years"]')!
    expect(years().textContent).toContain('2016 – 2027')
    await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('dates.prevYears')}"]`)!.click())
    expect(years().textContent).toContain('2004 – 2015')

    // წელი → იმ წლის თვეები → თვე → იმ თვის რიცხვები
    await act(async () => button('2010').click())
    expect(document.querySelector('[data-testid="calendar-year"]')?.textContent).toBe('2010')
    const march = monthName(new Date(2010, 2, 1))
    await act(async () => button(march).click())
    expect(caption().textContent).toContain('2010')

    const day = [...document.querySelectorAll<HTMLButtonElement>('.rdp-day_button')].find(
      (b) => b.textContent === '15' && !b.closest('.rdp-outside'),
    )!
    await act(async () => day.click())
    expect(onChange).toHaveBeenCalledWith('2010-03-15')
  })
})

describe('month names follow the calendar language', () => {
  it('Georgian UI → Georgian month names in the grid, the same words as the caption', async () => {
    const { DatePicker } = await import('@/components/ui/date-picker')
    const previous = i18n.language
    await act(async () => void (await i18n.changeLanguage('ka')))
    try {
      await mount(h(DatePicker, { id: 'when', value: '2026-10-05', onChange: vi.fn() }))
      const caption = document.querySelector('[data-testid="calendar-caption"]')!.textContent!
      expect(caption).toContain('ოქტომბერი')

      await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="calendar-caption"]')!.click())
      const names = [...document.querySelectorAll('[data-testid="calendar-months"] .fb-cal-cell')].map((b) => b.textContent)
      expect(names[0]).toBe('იანვარი')
      expect(names[9]).toBe('ოქტომბერი')
      expect(names.every((name) => /^[ა-ჿ]+$/.test(name ?? ''))).toBe(true)
    } finally {
      await act(async () => void (await i18n.changeLanguage(previous)))
    }
  })
})
