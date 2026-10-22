import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, Repeat } from 'lucide-react'
import type { DutyShift } from '@/api/duty'
import { chipLabel, eachDay, formatMoney, hoursLabel, parseDay, shiftRange, todayIso, typeName, weekdayIndex, workplaceColor } from '@/lib/duty'
import { cn } from '@/lib/utils'
import { RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/* ============================================================
   **მორიგეობის კალენდარი — პერიოდის ბადე.**

   ⚠️ **ბადე პერიოდისაა და არა კალენდარული თვისა**: „15 სექ – 14 ოქტ“ ორ თვეს
   კვეთს, ე.ი. უჯრები `from`-იდან `to`-მდეა, ორშაბათიდან დალაგებული; თვის
   სახელი ჩნდება პირველ უჯრაზე და ყოველი თვის 1-ში.

   ⚠️ **ორი რეჟიმი, ერთი უჯრა.** ჩვეულებრივ დაჭერა დღეს ხსნის (სწრაფი დამატება /
   რედაქტირება); მონიშვნის რეჟიმში (`PhotoGrid`-ის მონიშვნის ჩვევა) —
   დაჭერა რთავს/თიშავს, **Shift + დაჭერა** შუალედს ავსებს ბოლო დაჭერილიდან,
   **გადათრევა** კი გზად ყველა დღეს ერთნაირად ღებავს (რომ ერთი მოძრაობით მთელი
   კვირა მოინიშნოს). ⚠️ გადათრევის რეჟიმი პირველი დღიდან წყდება: მონიშნულზე
   დაწყებული გადათრევა **ხსნის**, მოუნიშნავზე — **ნიშნავს**.

   ⚠️ ჩიპის ფერი სამსახურისაა (ზოლი და ღია ფონი), **ტექსტი კი ტექსტის ფერით**
   („A · 24“) — ყვითელ ან ვარდისფერ ფონზე თეთრი ასო არ იკითხებოდა; ერთ დღეს
   რამდენიმე ჩიპი ეტევა (ორი სამსახური ან ორი მორიგეობა).

   ჩიპზე მარჯვენა ღილაკი სიის იგივე მენიუა (`shiftActions`); მონიშვნის
   რეჟიმში გამორთულია — იქ უჯრა მონიშვნისთვისაა.
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
  shiftActions,
  dimmed,
  currency,
}: {
  from: string
  to: string
  shifts: DutyShift[]
  selecting: boolean
  selected: ReadonlySet<string>
  onSelectionChange: (next: Set<string>) => void
  onOpenDay: (day: string) => void
  /** ჩიპის მარჯვენა ღილაკის მენიუ (`useDutyShiftActions`) */
  shiftActions?: (shift: DutyShift) => MenuAction[]
  /** „ღია" სამსახურები — ჩიპი ბაცად (`useDutyDim`) */
  dimmed?: ReadonlySet<number>
  /** ჰოვერის თანხისთვის */
  currency?: string
}) {
  const { t, i18n } = useTranslation()
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

          const cell = (
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
                'flex min-h-24 flex-col gap-1 rounded-md border p-1.5 text-left transition-colors',
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
                <RecordContextMenu key={shift.id} actions={shiftActions?.(shift) ?? []} disabled={selecting}>
                <span
                  className={cn(
                    'truncate rounded-sm border-l-[3px] px-1.5 py-0.5 text-[11px] font-medium leading-tight text-foreground',
                    // გაუქმებული — დღე რჩება, მაგრამ წითლად და გადახაზული
                    shift.status === 'cancelled' && 'text-destructive line-through',
                    // „ღია" სამსახური — ბაცად, ფერი უცვლელი
                    shift.workplace_id != null && dimmed?.has(shift.workplace_id) && 'opacity-45',
                  )}
                  style={
                    shift.status === 'cancelled'
                      ? { borderLeftColor: 'var(--destructive)', background: 'color-mix(in oklab, var(--destructive) 14%, transparent)' }
                      : {
                          borderLeftColor: workplaceColor(shift.workplace),
                          background: `color-mix(in oklab, ${workplaceColor(shift.workplace)} 22%, transparent)`,
                        }
                  }
                  data-testid="duty-chip"
                  data-status={shift.status}
                >
                  {shift.status === 'cancelled' && <Ban className="mr-0.5 inline size-3 align-[-2px]" aria-label={t('duty.status.cancelled')} />}
                  {/* რიტმიდან დაბადებული — პატარა „გამეორების" ნიშანი */}
                  {shift.pattern_id != null && (
                    <Repeat className="mr-0.5 inline size-3 align-[-2px] opacity-70" aria-label={t('duty.pattern.fromPattern')} data-testid="duty-chip-pattern" />
                  )}
                  {chipLabel(shift)}
                </span>
                </RecordContextMenu>
              ))}
            </button>
          )

          /* ⚠️ ჰოვერი — დღის ყველა მორიგეობა (ბრაუზერის `title`-ის ნაცვლად);
             მონიშვნის რეჟიმში და ცარიელ დღეზე არ ჩნდება */
          if (!items.length || selecting) return cell

          return (
            <Tooltip key={day}>
              <TooltipTrigger asChild>{cell}</TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm p-0">
                <DaySummary shifts={items} currency={currency} />
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

/** **ჰოვერის შიგთავსი** — სამსახური · ტიპი · დიაპაზონი · საათები · თანხა · სტატუსი · შენიშვნა */
function DaySummary({ shifts, currency = '₾' }: { shifts: DutyShift[]; currency?: string }) {
  const { t, i18n } = useTranslation()

  return (
    <ul className="divide-y divide-border" data-testid="duty-day-summary">
      {shifts.map((shift) => (
        <li key={shift.id} className="space-y-0.5 px-3 py-2">
          <p className={cn('flex items-center gap-1.5 font-medium', shift.status === 'cancelled' && 'text-destructive line-through')}>
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: workplaceColor(shift.workplace) }} />
            {shift.workplace?.name ?? t('duty.noWorkplace')}
            <span className="font-normal text-muted-foreground">· {shift.type ? typeName(shift.type, i18n.language) : t('duty.shift.custom')}</span>
          </p>
          <p className="tabular-nums text-muted-foreground">
            {[
              shiftRange(shift),
              t('duty.hoursValue', { hours: hoursLabel(shift) }),
              shift.pay != null ? formatMoney(shift.pay, currency, i18n.language) : null,
              shift.status !== 'scheduled' ? t(`duty.status.${shift.status}`) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {shift.note && <p className="text-muted-foreground">{shift.note}</p>}
        </li>
      ))}
    </ul>
  )
}
