import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DutyShift, DutyWorkplace } from '@/api/duty'
import { DutyCalendar } from '@/components/duty/DutyCalendar'
import { dutyPay, eachDay, periodLabel, weekdayIndex } from '@/lib/duty'
import '@/i18n'

/* ============================================================
   **მორიგეობის კალენდარი (Tasks §34.9)** — ბადე პერიოდით, ჩიპები, და მონიშვნის
   რეჟიმი: დაჭერა რთავს/თიშავს, Shift შუალედს ავსებს, გადათრევა გზად ღებავს
   (მონიშნულზე დაწყებული — ხსნის). ჩვეულებრივ რეჟიმში დაჭერა დღეს ხსნის.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

function shift(id: number, date: string, over: Partial<DutyShift> = {}): DutyShift {
  return {
    id,
    date,
    start_time: null,
    hours: 24,
    pay: 220,
    note: null,
    is_favorite: false,
    workplace_id: 1,
    type_id: 3,
    workplace: { id: 1, name: 'კლინიკა', short: 'A', color: '#16a34a' },
    type: { id: 3, name_ka: '24 სთ', name_en: '24 h', hours: 24, icon: 'Moon' },
    created_at: null,
    ...over,
  }
}

/** მონიშვნა მშობელში ცოცხლობს — როგორც გვერდზე */
function Harness({ selecting, onOpenDay, shifts = [] }: { selecting: boolean; onOpenDay: (day: string) => void; shifts?: DutyShift[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  return h(
    'div',
    null,
    h('output', { 'data-testid': 'selected' }, [...selected].sort().join(',')),
    h(DutyCalendar, { from: '2026-10-01', to: '2026-10-31', shifts, selecting, selected, onSelectionChange: setSelected, onOpenDay }),
  )
}

async function render(props: { selecting: boolean; onOpenDay?: (day: string) => void; shifts?: DutyShift[] }) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(Harness, { onOpenDay: () => {}, ...props })))
}

const day = (iso: string) => container!.querySelector(`[data-day="${iso}"]`) as HTMLButtonElement
const selected = () => container!.querySelector('[data-testid="selected"]')!.textContent

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
  it('lays the period out from Monday and draws a chip per shift', async () => {
    await render({ selecting: false, shifts: [shift(1, '2026-10-02'), shift(2, '2026-10-02', { workplace: { id: 2, name: 'B', short: 'B', color: null }, hours: 12 })] })

    // 2026-10-01 ხუთშაბათია — წინ ოთხი ცარიელი უჯრა
    expect(weekdayIndex('2026-10-01')).toBe(3)
    expect(container!.querySelectorAll('[data-day]').length).toBe(31)

    const chips = [...day('2026-10-02').querySelectorAll('[data-testid="duty-chip"]')].map((c) => c.textContent)
    expect(chips).toEqual(['A · 24', 'B · 12'])
  })

  it('opens a day on a click outside the selection mode', async () => {
    const onOpenDay = vi.fn()
    await render({ selecting: false, onOpenDay })

    await act(async () => day('2026-10-07').click())
    expect(onOpenDay).toHaveBeenCalledWith('2026-10-07')
  })

  it('toggles, fills a Shift range and paints a drag', async () => {
    const onOpenDay = vi.fn()
    await render({ selecting: true, onOpenDay })

    await act(async () => pointer(day('2026-10-05'), 'pointerdown'))
    await act(async () => pointer(window as unknown as Element, 'pointerup'))
    expect(selected()).toBe('2026-10-05')

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

  it('walks the days and names a period across two months', () => {
    expect(eachDay('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
    expect(periodLabel('2026-09-15', '2026-10-14', 'en')).toBe('Sep 15 – Oct 14, 2026')
  })
})
