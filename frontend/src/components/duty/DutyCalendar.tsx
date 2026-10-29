import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, Plus, Repeat } from 'lucide-react'
import type { DutyShift } from '@/api/duty'
import { chipLabel, eachDay, formatMoney, hoursLabel, parseDay, shiftDay, shiftRange, todayIso, typeName, weekdayIndex, workplaceColor } from '@/lib/duty'
import { cn } from '@/lib/utils'
import { RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/* ============================================================
   **მორიგეობის კალენდარი — პერიოდის ბადე.**

   ⚠️ **ბადე პერიოდისაა და არა კალენდარული თვისა**: „15 სექ – 14 ოქტ“ ორ თვეს
   კვეთს, ე.ი. აქტიური უჯრები `from`-იდან `to`-მდეა; კვირები კი მთლიანია
   (ორშაბათი → კვირა) და გარეთ მყოფი დღე ბაცად ჩანს. თვის სახელი ჩნდება
   პირველ უჯრაზე და ყოველი თვის 1-ში; შაბათ-კვირა შეფერილია, დღევანდელი —
   ჩარჩოთი, წარსულის რიცხვი — ბაცად. ⚠️ ტელეფონზე ბადის ნაცვლად დღიური სიაა.

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

  // ⚠️ ბადე მთლიანი კვირებია (ორშაბათი → კვირა): პერიოდის გარეთ მყოფი დღე ბაცად
  // ჩანს და არ იჭერს — ცარიელი ხვრელები ბადეს „ჩამოჭრილს" ხდიდა
  const before = useMemo(() => {
    const lead = weekdayIndex(from)
    return lead ? eachDay(shiftDay(from, -lead), shiftDay(from, -1)) : []
  }, [from])
  const after = useMemo(() => {
    const tail = 6 - weekdayIndex(to)
    return tail ? eachDay(shiftDay(to, 1), shiftDay(to, tail)) : []
  }, [to])

  const chip = (shift: DutyShift, size: 'cell' | 'row') => (
    <span
      className={cn(
        'block truncate rounded-[4px] border-l-[3px] font-medium leading-tight text-foreground',
        size === 'cell' ? 'px-1.5 py-1 text-xs' : 'px-2 py-1.5 text-sm',
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
              background: `color-mix(in oklab, ${workplaceColor(shift.workplace)} 24%, transparent)`,
            }
      }
      data-testid={size === 'cell' ? 'duty-chip' : undefined}
      data-status={shift.status}
    >
      {shift.status === 'cancelled' && <Ban className="mr-0.5 inline size-3 align-[-2px]" aria-label={t('duty.status.cancelled')} />}
      {/* რიტმიდან დაბადებული — პატარა „გამეორების" ნიშანი */}
      {shift.pattern_id != null && (
        <Repeat
          className="mr-0.5 inline size-3 align-[-2px] opacity-70"
          aria-label={t('duty.pattern.fromPattern')}
          data-testid={size === 'cell' ? 'duty-chip-pattern' : undefined}
        />
      )}
      {chipLabel(shift)}
    </span>
  )

  return (
    <div className="select-none" data-testid="duty-calendar">
      {/* ---------- ბადე (ტაბლეტიდან ზემოთ) ---------- */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted-foreground">
          {names.map((name, i) => (
            <div key={name} className={cn('py-2', i >= 5 && 'text-foreground/70')}>
              {name}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {before.map((day) => (
            <OutsideCell key={day} day={day} />
          ))}

          {days.map((day) => {
            const date = parseDay(day)
            const items = byDay.get(day) ?? []
            const isSelected = selected.has(day)
            const isToday = day === today
            const weekend = weekdayIndex(day) >= 5
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
                  'group relative flex min-h-28 flex-col gap-1 border-b border-r border-border p-1.5 text-left transition-colors',
                  weekend && 'bg-muted/40',
                  isSelected ? 'bg-primary/15 shadow-[inset_0_0_0_2px_var(--primary)]' : 'hover:bg-muted/60',
                  isToday && !isSelected && 'shadow-[inset_0_0_0_2px_var(--primary)]',
                )}
              >
                <span className="flex items-center gap-1.5 text-xs">
                  <span
                    className={cn(
                      'grid size-6 place-items-center rounded-full font-semibold tabular-nums',
                      isToday ? 'bg-primary text-primary-foreground' : day < today ? 'text-muted-foreground' : 'text-foreground',
                    )}
                  >
                    {date.getDate()}
                  </span>
                  {showMonth && <span className="truncate font-medium uppercase text-muted-foreground">{monthFormat.format(date)}</span>}
                </span>

                {items.map((shift) => (
                  <RecordContextMenu key={shift.id} actions={shiftActions?.(shift) ?? []} disabled={selecting}>
                    {chip(shift, 'cell')}
                  </RecordContextMenu>
                ))}

                {/* ცარიელ დღეზე — „დამატების" მინიშნება ჰოვერზე */}
                {!items.length && !selecting && (
                  <Plus
                    className="absolute bottom-1.5 right-1.5 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                )}
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

          {after.map((day) => (
            <OutsideCell key={day} day={day} />
          ))}
        </div>
      </div>

      {/* ---------- დღიური სია (ტელეფონზე) ----------
          ⚠️ ვიწრო ეკრანზე შვიდსვეტიან ბადეში ჩიპი არ იკითხება — აქ მხოლოდ
          მორიგეობიანი დღეებია, სრული წარწერით; დაჭერა იგივეა, რაც უჯრაზე */}
      <ul className="divide-y divide-border sm:hidden" data-testid="duty-agenda">
        {days
          .filter((day) => byDay.has(day))
          .map((day) => {
            const isSelected = selected.has(day)

            return (
              <li key={day}>
                <button
                  type="button"
                  aria-pressed={selecting ? isSelected : undefined}
                  onClick={() => (selecting ? press(day, false) : onOpenDay(day))}
                  className={cn('flex w-full items-start gap-3 px-3 py-2.5 text-left', isSelected && 'bg-primary/15')}
                  data-testid="duty-agenda-day"
                >
                  <span className={cn('w-12 shrink-0 text-center', day === today && 'text-primary')}>
                    <span className="block text-lg font-semibold tabular-nums leading-none">{parseDay(day).getDate()}</span>
                    <span className="block text-[11px] uppercase text-muted-foreground">{names[weekdayIndex(day)]}</span>
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    {(byDay.get(day) ?? []).map((shift) => (
                      <span key={shift.id} className="block">
                        {chip(shift, 'row')}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            )
          })}
        {!shifts.length && <li className="px-3 py-8 text-center text-sm text-muted-foreground">{t('duty.calendar.emptyPeriod')}</li>}
      </ul>
    </div>
  )
}

/** პერიოდის გარეთ მყოფი დღე — ბადის კვირას ავსებს, არ იჭერს */
function OutsideCell({ day }: { day: string }) {
  return (
    <div className="min-h-28 border-b border-r border-border bg-muted/20 p-1.5" aria-hidden data-outside={day}>
      <span className="grid size-6 place-items-center text-xs tabular-nums text-muted-foreground/50">{parseDay(day).getDate()}</span>
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
