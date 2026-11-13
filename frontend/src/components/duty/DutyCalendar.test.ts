import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DutyShift, DutyWorkplace } from '@/api/duty'
import { DutyCalendar } from '@/components/duty/DutyCalendar'
import { dutyPay, eachDay, periodLabel, sumMoney, sumShifts, upcomingShift, weekdayIndex } from '@/lib/duty'
import i18n from '@/i18n'

/* ============================================================
   **მორიგეობის კალენდარი** — პერიოდი დღის ბარათებად: ბლოკზე სამსახური და
   საათები, ერთ მორიგეობიან დღეს დროც და თანხაც; და მონიშვნის რეჟიმი: დაჭერა
   რთავს/თიშავს, Shift შუალედს ავსებს, გადათრევა გზად ღებავს (მონიშნულზე
   დაწყებული — ხსნის). ჩვეულებრივ რეჟიმში დაჭერა დღეს ხსნის.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.useRealTimers()
})

function shift(id: number, date: string, over: Partial<DutyShift> = {}): DutyShift {
  return {
    id,
    date,
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
    pattern_id: null,
    workplace: { id: 1, name: 'კლინიკა', short: 'A', color: '#16a34a' },
    type: { id: 3, name_ka: '24 სთ', name_en: '24 h', hours: 24, icon: 'Moon' },
    created_at: null,
    ...over,
  }
}

/** მონიშვნა მშობელში ცოცხლობს — როგორც გვერდზე */
function Harness({
  selecting,
  onOpenDay,
  shifts = [],
  dimmed,
  picked,
}: {
  selecting: boolean
  onOpenDay: (day: string) => void
  shifts?: DutyShift[]
  dimmed?: ReadonlySet<number>
  picked?: string
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  return h(
    'div',
    null,
    h('output', { 'data-testid': 'selected' }, [...selected].sort().join(',')),
    h(DutyCalendar, { from: '2026-10-01', to: '2026-10-31', shifts, selecting, selected, onSelectionChange: setSelected, onOpenDay, picked, dimmed, currency: '₾' }),
  )
}

async function render(props: { selecting: boolean; onOpenDay?: (day: string) => void; shifts?: DutyShift[]; dimmed?: ReadonlySet<number>; picked?: string }) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(Harness, { onOpenDay: () => {}, ...props })))
}

const day = (iso: string) => container!.querySelector(`[data-day="${iso}"]`) as HTMLButtonElement
const selected = () => container!.querySelector('[data-testid="selected"]')!.textContent
const chipsOf = (iso: string) => [...day(iso).querySelectorAll<HTMLElement>('[data-testid="duty-chip"]')]
const hours = (value: string) => i18n.t('duty.hoursValue', { hours: value })

function pointer(el: Element, type: string, init: MouseEventInit = {}) {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }))
}

/**
 * მაჩვენებლის გადასვლა ერთი დღიდან მეორეზე. ⚠️ React-ის `onPointerEnter`
 * `pointerout`-იდან იბადება (ძველი ელემენტი, `relatedTarget` — ახალი), და არა
 * `pointerover`-იდან — სწორედ ასე ხდება ბრაუზერშიც.
 */
function move(from: Element, to: Element) {
  pointer(from, 'pointerout', { relatedTarget: to })
}

describe('DutyCalendar', () => {
  it('lays the period out from Monday and draws a block per shift', async () => {
    await render({ selecting: false, shifts: [shift(1, '2026-10-02'), shift(2, '2026-10-02', { workplace: { id: 2, name: 'B', short: 'B', color: null }, hours: 12 })] })

    // 2026-10-01 ხუთშაბათია — წინ სამი გარე დღე
    expect(weekdayIndex('2026-10-01')).toBe(3)
    expect(container!.querySelectorAll('[data-day]').length).toBe(31)

    // ბლოკზე — სამსახურის ასო და საათები
    expect(chipsOf('2026-10-02').map((c) => c.textContent)).toEqual([`A${hours('24')}`, `B${hours('12')}`])
  })

  it('crosses out a cancelled shift and shows a partial one as worked / planned hours', async () => {
    await render({
      selecting: false,
      shifts: [shift(1, '2026-10-03', { status: 'cancelled', pay: 0 }), shift(2, '2026-10-04', { status: 'partial', hours: 10, pay: 100 })],
    })

    // გაუქმებული — დღე რჩება: წითლად, გადახაზული, ნიშნით
    const cancelled = chipsOf('2026-10-03')[0]
    expect(cancelled.dataset.status).toBe('cancelled')
    expect(cancelled.className).toContain('line-through')
    expect(cancelled.querySelector('svg')).not.toBeNull()
    expect(cancelled.style.getPropertyValue('--wp')).toBe('var(--destructive)')

    expect(chipsOf('2026-10-04')[0].textContent).toContain(hours('10 / 24'))
  })

  it('writes the time and the pay on a day with one shift and keeps two shifts to a line each', async () => {
    await render({
      selecting: false,
      dimmed: new Set([2]),
      shifts: [
        shift(1, '2026-10-05', { start_time: '09:00', end_time: '09:00', end_day: 1 }),
        shift(2, '2026-10-06', { start_time: '09:00', end_time: '09:00', end_day: 1 }),
        shift(3, '2026-10-06', { workplace_id: 2, workplace: { id: 2, name: 'საავადმყოფო', short: null, color: '#eb6834' }, hours: 12, pay: null }),
        // არც დრო, არც თანხა — მეორე ხაზი საერთოდ არ იხატება
        shift(4, '2026-10-07', { pay: null }),
      ],
    })

    // ერთი მორიგეობა — ყველაფერი ბარათზეა, ჰოვერის გარეშე
    const single = chipsOf('2026-10-05')[0]
    expect(single.textContent).toContain('09:00 → 09:00 (+1)')
    expect(single.textContent).toContain('220 ₾')
    expect(single.title).toBe('')
    expect(single.style.getPropertyValue('--wp')).toBe('#16a34a')

    // ორი მორიგეობა — თითო ერთ ხაზად; ასოს გარეშე სამსახური სახელით, „ღია" — ბაცად
    const pair = chipsOf('2026-10-06')
    expect(pair.map((c) => c.textContent)).toEqual([`A${hours('24')}`, `საავადმყოფო${hours('12')}`])
    expect(pair[0].className).not.toContain('opacity-45')
    expect(pair[1].className).toContain('opacity-45')

    expect(chipsOf('2026-10-07')[0].textContent).toBe(`A${hours('24')}`)
  })

  it('fills whole weeks with dashed outside days and lists only shift days on the phone agenda', async () => {
    await render({ selecting: false, shifts: [shift(1, '2026-10-02', { start_time: '09:00', end_time: '21:00', end_day: 0, hours: 12 }), shift(2, '2026-10-02', { hours: 12 })] })

    // 2026-10-01 ხუთშაბათია (სამი დღე წინ), 31 — შაბათი (ერთი მერე); გარეთ მყოფი დღე არ იჭერს
    const outside = [...container!.querySelectorAll<HTMLElement>('[data-outside]')].map((c) => c.dataset.outside)
    expect(outside).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-11-01'])
    expect(container!.querySelector('[data-outside]')!.tagName).toBe('DIV')
    expect(container!.querySelectorAll('[data-day]').length).toBe(31)

    // ტელეფონის სია: სრული სახელი და დრო — ორ მორიგეობიან დღესაც
    const agenda = container!.querySelectorAll('[data-testid="duty-agenda-day"]')
    expect(agenda).toHaveLength(1)
    expect(agenda[0].textContent).toContain('კლინიკა')
    expect(agenda[0].textContent).toContain('09:00 → 21:00')
  })

  it('marks today and the first day of a month', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 12))
    await render({ selecting: false })

    const marks = container!.querySelectorAll('[data-testid="duty-today"]')
    expect(marks).toHaveLength(1)
    expect(day('2026-10-14').contains(marks[0])).toBe(true)
    expect(marks[0].textContent).toBe(i18n.t('duty.day.today'))

    // თვის სახელი — პერიოდის პირველ დღეზე
    expect(day('2026-10-01').textContent).toContain(new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(new Date(2026, 9, 1, 12)))
    expect(day('2026-10-02').textContent).toBe('2')
  })

  it('frames the day that is open beside the calendar', async () => {
    await render({ selecting: false, picked: '2026-10-09' })

    expect(day('2026-10-09').getAttribute('aria-pressed')).toBe('true')
    expect(day('2026-10-09').className).toContain('border-[var(--mod)]')
    expect(day('2026-10-10').getAttribute('aria-pressed')).toBe('false')
    // არჩეული დღე მხოლოდ ჩარჩოა — შევსება მონიშვნისაა
    expect(day('2026-10-09').className).not.toContain('bg-[var(--mod-fill)]')
  })

  it('opens a day on a click outside the selection mode', async () => {
    const onOpenDay = vi.fn()
    await render({ selecting: false, onOpenDay })

    await act(async () => day('2026-10-07').click())
    expect(onOpenDay).toHaveBeenCalledWith('2026-10-07')
    // პანელის გარეშე (ვიწრო ეკრანი) „არჩეული დღე" არ არსებობს
    expect(day('2026-10-07').hasAttribute('aria-pressed')).toBe(false)
  })

  it('toggles, fills a Shift range and paints a drag', async () => {
    const onOpenDay = vi.fn()
    await render({ selecting: true, onOpenDay })

    await act(async () => pointer(day('2026-10-05'), 'pointerdown'))
    await act(async () => pointer(window as unknown as Element, 'pointerup'))
    expect(selected()).toBe('2026-10-05')
    expect(day('2026-10-05').getAttribute('aria-pressed')).toBe('true')
    expect(day('2026-10-05').className).toContain('bg-[var(--mod-fill)]')

    // Shift — შუალედი ბოლო დაჭერილიდან
    await act(async () => pointer(day('2026-10-08'), 'pointerdown', { shiftKey: true }))
    await act(async () => pointer(window as unknown as Element, 'pointerup'))
    expect(selected()).toBe('2026-10-05,2026-10-06,2026-10-07,2026-10-08')

    // გადათრევა მოუნიშნავიდან — გზად ყველა ინიშნება
    await act(async () => pointer(day('2026-10-12'), 'pointerdown'))
    await act(async () => move(day('2026-10-12'), day('2026-10-13')))
    await act(async () => move(day('2026-10-13'), day('2026-10-14')))
    await act(async () => pointer(window as unknown as Element, 'pointerup'))
    expect(selected()).toContain('2026-10-14')
    expect(selected()).toContain('2026-10-13')

    // მონიშნულზე დაწყებული გადათრევა — ხსნის
    await act(async () => pointer(day('2026-10-06'), 'pointerdown'))
    await act(async () => move(day('2026-10-06'), day('2026-10-07')))
    await act(async () => pointer(window as unknown as Element, 'pointerup'))
    expect(selected()).not.toContain('2026-10-06')
    expect(selected()).not.toContain('2026-10-07')
    expect(selected()).toContain('2026-10-08')

    // მონიშვნის რეჟიმში დღე არ იხსნება
    expect(onOpenDay).not.toHaveBeenCalled()
  })
})

describe('duty helpers', () => {
  const workplace: DutyWorkplace = {
    id: 1,
    name: 'A',
    short: 'A',
    color: null,
    hourly_rate: 15,
    default_type_id: null,
    default_start_time: null,
    period_day: 1,
    period_pending: null,
    is_active: true,
    sort_order: 1,
    rates: [{ type_id: 3, pay: 220 }],
    shifts_count: 0,
  }

  it('prices a shift like the server does', () => {
    expect(dutyPay(workplace, 3, 24)).toBe(220)
    // ტარიფის გარეშე ტიპი და ქასთომ საათები — საათობრივით
    expect(dutyPay(workplace, 9, 8)).toBe(120)
    expect(dutyPay(workplace, null, 10)).toBe(150)
    expect(dutyPay({ ...workplace, hourly_rate: null }, null, 10)).toBeNull()
    expect(dutyPay(null, 3, 24)).toBeNull()
  })

  it('sums the loaded shifts without the cancelled ones and writes a dash when nothing is priced', () => {
    const shifts = [shift(1, '2026-10-02'), shift(2, '2026-10-03', { status: 'cancelled', pay: 0 }), shift(3, '2026-10-04', { hours: 12, pay: null })]

    expect(sumShifts(shifts)).toEqual({ count: 2, hours: 36, pay: 220, paid: 1 })
    expect(sumMoney(sumShifts(shifts), '₾', 'ka')).toBe('220 ₾')
    // თანხა არცერთს არ აქვს — „0 ₾" ტყუილი იქნებოდა
    expect(sumMoney(sumShifts([shifts[2]]), '₾', 'ka')).toBe('—')
    // ნაწილობრივის ნული ნამდვილი თანხაა
    expect(sumMoney(sumShifts([shift(4, '2026-10-05', { status: 'partial', pay: 0 })]), '₾', 'ka')).toBe('0 ₾')
  })

  it('finds the nearest shift from today on, skipping the cancelled and the past ones', () => {
    const shifts = [
      shift(1, '2026-10-02'),
      shift(2, '2026-10-10', { status: 'cancelled' }),
      shift(3, '2026-10-12', { start_time: '20:00' }),
      shift(4, '2026-10-12', { start_time: '08:00' }),
    ]

    expect(upcomingShift(shifts, '2026-10-05')?.id).toBe(4)
    expect(upcomingShift(shifts, '2026-10-02')?.id).toBe(1)
    expect(upcomingShift(shifts, '2026-10-13')).toBeNull()
  })

  it('walks the days and names a period across two months', () => {
    expect(eachDay('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
    expect(periodLabel('2026-09-15', '2026-10-14', 'en')).toBe('Sep 15 – Oct 14, 2026')
  })
})
