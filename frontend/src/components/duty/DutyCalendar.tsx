import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { DutyShift } from '@/api/duty'
import { chipLabel, eachDay, formatHours, parseDay, todayIso, weekdayIndex, workplaceColor } from '@/lib/duty'
import { cn } from '@/lib/utils'

/* ============================================================
   **მორიგეობის კალენდარი — პერიოდის ბადე (Tasks §34.4–34.5).**

   ⚠️ **ბადე პერიოდისაა და არა კალენდარული თვისა**: „15 სექ – 14 ოქტ“ ორ თვეს
   კვეთს, ე.ი. უჯრები `from`-იდან `to`-მდეა, ორშაბათიდან დალაგებული; თვის
   სახელი ჩნდება პირველ უჯრაზე და ყოველი თვის 1-ში.

   ⚠️ **ორი რეჟიმი, ერთი უჯრა.** ჩვეულებრივ დაჭერა დღეს ხსნის (სწრაფი დამატება /
   რედაქტირება); მონიშვნის რეჟიმში (§34.5, `PhotoGrid`-ის მონიშვნის ჩვევა) —
   დაჭერა რთავს/თიშავს, **Shift + დაჭერა** შუალედს ავსებს ბოლო დაჭერილიდან,
   **გადათრევა** კი გზად ყველა დღეს ერთნაირად ღებავს (რომ ერთი მოძრაობით მთელი
   კვირა მოინიშნოს). ⚠️ გადათრევის რეჟიმი პირველი დღიდან წყდება: მონიშნულზე
   დაწყებული გადათრევა **ხსნის**, მოუნიშნავზე — **ნიშნავს**.

   ⚠️ ჩიპის ფერი სამსახურისაა (მომხმარებლის მონაცემი — inline სტილი), ტექსტი —
   „A · 24“; ერთ დღეს რამდენიმე ჩიპი ეტევა (ორი სამსახური ან ორი მორიგეობა).
   ============================================================ */

/** კვირის დღეების სახელები ორშაბათიდან — 2024-01-01 ორშაბათია */
function weekdayNames(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(2024, 0, 1 + i, 12)))
}

export function DutyCalendar({
  from,
  to,
  shifts,
  selecting,
  selected,
  onSelectionChange,
  onOpenDay,
}: {
  from: string
  to: string
  shifts: DutyShift[]
  selecting: boolean
  selected: ReadonlySet<string>
  onSelectionChange: (next: Set<string>) => void
  onOpenDay: (day: string) => void
}) {
  const { i18n } = useTranslation()
  const locale = i18n.language
  const today = todayIso()

  const days = useMemo(() => eachDay(from, to), [from, to])
  const byDay = useMemo(() => {
    const map = new Map<string, DutyShift[]>()
    for (const shift of shifts) map.set(shift.date, [...(map.get(shift.date) ?? []), shift])
    return map
  }, [shifts])

  const monthFormat = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'short' }), [locale])
  const names = useMemo(() => weekdayNames(locale), [locale])

  /* გადათრევის მდგომარეობა რეფშია: მისი ცვლილება ხელახალ ხატვას არ საჭიროებს,
     ხოლო `selected` ყოველ ნაბიჯზე უახლესი უნდა იყოს (`latest`) */
  const drag = useRef<{ mode: 'add' | 'remove' } | null>(null)
  const anchor = useRef<string | null>(null)
  const latest = useRef(selected)
  latest.current = selected

  useEffect(() => {
    const stop = () => {
      drag.current = null
    }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [])

  const apply = (list: string[], mode: 'add' | 'remove') => {
    const next = new Set(latest.current)
    for (const day of list) {
      if (mode === 'add') next.add(day)
      else next.delete(day)
    }
    onSelectionChange(next)
  }

  const press = (day: string, shift: boolean) => {
    if (shift && anchor.current) {
      const [a, b] = anchor.current <= day ? [anchor.current, day] : [day, anchor.current]
      apply(eachDay(a, b), 'add')
      anchor.current = day
      return
    }

    const mode = latest.current.has(day) ? 'remove' : 'add'
    drag.current = { mode }
    anchor.current = day
    apply([day], mode)
  }

  return (
    <div className="select-none" data-testid="duty-calendar">
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {names.map((name) => (
          <div key={name} className="py-1">
            {name}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: weekdayIndex(from) }, (_, i) => (
          <div key={`pad-${i}`} aria-hidden />
        ))}

        {days.map((day) => {
          const date = parseDay(day)
          const items = byDay.get(day) ?? []
          const isSelected = selected.has(day)
          const showMonth = day === from || date.getDate() === 1

          return (
            <button
              key={day}
              type="button"
              data-day={day}
              aria-pressed={selecting ? isSelected : undefined}
              onPointerDown={(e) => {
                if (!selecting || e.button !== 0) return
                e.preventDefault()
                press(day, e.shiftKey)
              }}
              onPointerEnter={() => {
                if (selecting && drag.current) apply([day], drag.current.mode)
              }}
              onClick={(e) => {
                if (selecting) {
                  // კლავიატურით (Enter/Space) — pointer-ის მოვლენა არ მოსულა
                  if (e.detail === 0) press(day, e.shiftKey)
                  return
                }
                onOpenDay(day)
              }}
              className={cn(
                'flex min-h-20 flex-col gap-1 rounded-md border p-1.5 text-left transition-colors',
                isSelected ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/50',
              )}
            >
              <span className="flex items-center gap-1 text-xs">
                <span
                  className={cn(
                    'grid min-w-5 place-items-center rounded-sm px-1 font-semibold tabular-nums',
                    day === today ? 'bg-primary text-primary-foreground' : 'text-foreground',
                  )}
                >
                  {date.getDate()}
                </span>
                {showMonth && <span className="truncate text-muted-foreground">{monthFormat.format(date)}</span>}
              </span>

              {items.map((shift) => (
                <span
                  key={shift.id}
                  className="truncate rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-tight text-white"
                  style={{ background: workplaceColor(shift.workplace) }}
                  title={[shift.workplace?.name, `${formatHours(shift.hours)}`, shift.note].filter(Boolean).join(' · ')}
                  data-testid="duty-chip"
                >
                  {chipLabel(shift)}
                </span>
              ))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
