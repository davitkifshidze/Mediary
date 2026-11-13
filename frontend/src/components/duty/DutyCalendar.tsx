import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, Plus, Repeat } from 'lucide-react'
import type { DutyShift } from '@/api/duty'
import { eachDay, formatMoney, hoursLabel, parseDay, SHIFT_BLOCK, shiftDay, shiftRange, shiftTint, todayIso, weekdayIndex } from '@/lib/duty'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { EmptyState } from '@/components/ui/empty-state'

/* ============================================================
   **მორიგეობის კალენდარი — პერიოდი დღის ბარათებად.**

   ყოველი დღე ცალკე ბარათია და მორიგეობა მასზე **პირდაპირ იკითხება**: სამსახური
   და საათები, ხოლო როცა დღეს ერთი მორიგეობაა — დროც და თანხაც. ჰოვერი არაფერს
   მალავს; დღის სრული აღწერა გვერდით პანელშია (ფართო ეკრანი) ან დღის ფანჯარაში.

   ⚠️ **ბადე პერიოდისაა და არა კალენდარული თვისა**: „15 სექ – 14 ოქტ“ ორ თვეს
   კვეთს, ე.ი. აქტიური ბარათები `from`-იდან `to`-მდეა; კვირები კი მთლიანია
   (ორშაბათი → კვირა) და გარეთ მყოფი დღე წყვეტილი ჩარჩოთი ჩანს, არ იჭერს. თვის
   სახელი ჩნდება პირველ ბარათზე და ყოველი თვის 1-ში; შაბათ-კვირა შეფერილია,
   წარსულის რიცხვი — ბაცი. ⚠️ ტელეფონზე ბადის ნაცვლად მხოლოდ მორიგეობიანი
   დღეების სიაა, იმავე ბლოკებით — შვიდსვეტიან ბადეში იქ არაფერი იკითხება.

   ⚠️ **ორი რეჟიმი, ერთი ბარათი.** ჩვეულებრივ დაჭერა დღეს ხსნის (`onOpenDay`) და
   `picked` დღე ჩარჩოთია გამოკვეთილი; მონიშვნის რეჟიმში (`PhotoGrid`-ის ჩვევა) —
   დაჭერა რთავს/თიშავს, **Shift + დაჭერა** შუალედს ავსებს ბოლო დაჭერილიდან,
   **გადათრევა** კი გზად ყველა დღეს ერთნაირად ღებავს. ⚠️ გადათრევის რეჟიმი
   პირველი დღიდან წყდება: მონიშნულზე დაწყებული **ხსნის**, მოუნიშნავზე — **ნიშნავს**.
   ⚠️ არჩეული დღე მხოლოდ ჩარჩოა, მონიშნული — ჩარჩო და შევსება: ორი სხვადასხვა რამ
   ერთნაირად არ უნდა გამოიყურებოდეს.

   ბლოკზე მარჯვენა ღილაკი სიის იგივე მენიუა (`shiftActions`); მონიშვნის რეჟიმში
   გამორთულია — იქ ბარათი მონიშვნისთვისაა.
   ============================================================ */

/** კვირის დღეების სახელები ორშაბათიდან — 2024-01-01 ორშაბათია */
function weekdayNames(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(2024, 0, 1 + i, 12)))
}

const MARKED = 'border-[var(--mod)] shadow-[inset_0_0_0_1px_var(--mod)]'
const IDLE = 'border-border hover:border-[var(--mod)]'

export function DutyCalendar({
  from,
  to,
  shifts,
  selecting,
  selected,
  onSelectionChange,
  onOpenDay,
  picked,
  shiftActions,
  dimmed,
  currency = '₾',
}: {
  from: string
  to: string
  shifts: DutyShift[]
  selecting: boolean
  selected: ReadonlySet<string>
  onSelectionChange: (next: Set<string>) => void
  onOpenDay: (day: string) => void
  /** გვერდით პანელში გახსნილი დღე — ჩარჩოთი; მონიშვნის რეჟიმში არ ჩანს */
  picked?: string | null
  /** ბლოკის მარჯვენა ღილაკის მენიუ (`useDutyShiftActions`) */
  shiftActions?: (shift: DutyShift) => MenuAction[]
  /** „ღია" სამსახურები — ბლოკი ბაცად (`useDutyDim`) */
  dimmed?: ReadonlySet<number>
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

  // ⚠️ ბადე მთლიანი კვირებია (ორშაბათი → კვირა): ცარიელი ხვრელები ბადეს „ჩამოჭრილს" ხდიდა
  const before = useMemo(() => {
    const lead = weekdayIndex(from)
    return lead ? eachDay(shiftDay(from, -lead), shiftDay(from, -1)) : []
  }, [from])
  const after = useMemo(() => {
    const tail = 6 - weekdayIndex(to)
    return tail ? eachDay(shiftDay(to, 1), shiftDay(to, tail)) : []
  }, [to])

  /** მონიშვნის რეჟიმში — მონიშნული დღე; ისე — გვერდით პანელში გახსნილი */
  const frame = (day: string) => {
    if (selecting) return selected.has(day) ? cn(MARKED, 'bg-[var(--mod-fill)]') : IDLE
    return day === picked ? MARKED : IDLE
  }

  /**
   * მორიგეობის ბლოკი. `full` — დროც და თანხაც (დღეს ერთი მორიგეობაა, ან ტელეფონის
   * სია); ორ მორიგეობიან დღეს თითო ერთ ხაზად რჩება, დანარჩენი დღის აღწერაშია.
   * ⚠️ ბადის ვიწრო ბარათში სამსახური ასოთი იწერება (თუ აქვს), სიაში — სრული სახელით.
   */
  const block = (shift: DutyShift, full: boolean, cell: boolean) => {
    const range = shiftRange(shift)

    return (
      <span
        style={shiftTint(shift)}
        className={cn(
          SHIFT_BLOCK,
          'block px-1.5 py-1 text-left leading-tight',
          // გაუქმებული — დღე რჩება, მაგრამ წითლად და გადახაზული
          shift.status === 'cancelled' && 'text-destructive line-through',
          // „ღია" სამსახური — ბაცად, ფერი უცვლელი
          shift.workplace_id != null && dimmed?.has(shift.workplace_id) && 'opacity-45',
        )}
        data-testid={cell ? 'duty-chip' : undefined}
        data-status={shift.status}
      >
        <span className={cn('flex items-center gap-1 font-semibold', cell ? 'text-xs' : 'text-sm')}>
          {shift.status === 'cancelled' && <Ban className="size-3 shrink-0" aria-label={t('duty.status.cancelled')} />}
          {/* რიტმიდან დაბადებული — პატარა „გამეორების" ნიშანი */}
          {shift.pattern_id != null && (
            <Repeat className="size-3 shrink-0 opacity-70" aria-label={t('duty.pattern.fromPattern')} data-testid={cell ? 'duty-chip-pattern' : undefined} />
          )}
          <span className="min-w-0 flex-1 truncate">
            {(cell ? shift.workplace?.short || shift.workplace?.name : shift.workplace?.name) ?? t('duty.noWorkplace')}
          </span>
          <span className="shrink-0 tabular-nums">{t('duty.hoursValue', { hours: hoursLabel(shift) })}</span>
        </span>
        {full && (range || shift.pay != null) && (
          <span className={cn('mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 tabular-nums', cell ? 'text-[11px]' : 'text-xs')}>
            {/* ⚠️ ვიწრო ბარათში დიაპაზონი ჰარებზე გადადის ხაზზე — ჩამოჭრილი დრო უარესია */}
            {range && <span className="text-muted-foreground">{range}</span>}
            {shift.pay != null && <span className="ml-auto font-medium">{formatMoney(shift.pay, currency, locale)}</span>}
          </span>
        )}
      </span>
    )
  }

  return (
    <div className="select-none" data-testid="duty-calendar">
      {/* ---------- ბადე (ტაბლეტიდან ზემოთ): თითო დღე ცალკე ბარათია ---------- */}
      <div className="hidden sm:block">
        <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-muted-foreground">
          {names.map((name, i) => (
            <span key={name} className={cn(i >= 5 && 'text-[var(--mod)]')}>
              {name}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {before.map((day) => (
            <OutsideDay key={day} day={day} />
          ))}

          {days.map((day) => {
            const date = parseDay(day)
            const items = byDay.get(day) ?? []
            const isToday = day === today

            return (
              <button
                data-kind="calendar"
                key={day}
                type="button"
                data-day={day}
                aria-pressed={selecting ? selected.has(day) : picked != null ? day === picked : undefined}
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
                  'group relative flex min-h-24 min-w-0 cursor-pointer flex-col gap-1 rounded-md border bg-background p-1.5 text-left transition-colors',
                  weekdayIndex(day) >= 5 && 'bg-muted/50',
                  frame(day),
                )}
              >
                <span className="flex min-w-0 items-center gap-1 text-xs">
                  <span className={cn('text-sm font-semibold tabular-nums', isToday ? 'text-[var(--mod)]' : day < today && 'text-muted-foreground')}>
                    {date.getDate()}
                  </span>
                  {(day === from || date.getDate() === 1) && <span className="min-w-0 truncate uppercase text-muted-foreground">{monthFormat.format(date)}</span>}
                  {isToday && (
                    <Badge className="ml-auto bg-[var(--mod-soft)] px-1.5 py-0.5 text-[10px] text-[var(--mod)]" data-testid="duty-today">
                      {t('duty.day.today')}
                    </Badge>
                  )}
                </span>

                {items.map((shift) => (
                  <RecordContextMenu key={shift.id} actions={shiftActions?.(shift) ?? []} disabled={selecting}>
                    {block(shift, items.length === 1, true)}
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
          })}

          {after.map((day) => (
            <OutsideDay key={day} day={day} />
          ))}
        </div>
      </div>

      {/* ---------- ტელეფონი: მხოლოდ მორიგეობიანი დღეები, სრული ბლოკებით; დაჭერა იგივეა, რაც ბარათზე ---------- */}
      <ul className="space-y-2 sm:hidden" data-testid="duty-agenda">
        {days
          .filter((day) => byDay.has(day))
          .map((day) => (
            <li key={day}>
              <button
                data-kind="calendar"
                type="button"
                aria-pressed={selecting ? selected.has(day) : undefined}
                onClick={() => (selecting ? press(day, false) : onOpenDay(day))}
                className={cn(
                  'flex w-full cursor-pointer items-start gap-3 rounded-md border bg-background p-2 text-left',
                  selecting && selected.has(day) ? cn(MARKED, 'bg-[var(--mod-fill)]') : 'border-border',
                )}
                data-testid="duty-agenda-day"
              >
                <span className="w-10 shrink-0 text-center">
                  <span className={cn('block text-lg font-semibold leading-none tabular-nums', day === today && 'text-[var(--mod)]')}>
                    {parseDay(day).getDate()}
                  </span>
                  <span className="block text-[11px] uppercase text-muted-foreground">{names[weekdayIndex(day)]}</span>
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  {(byDay.get(day) ?? []).map((shift) => (
                    <span key={shift.id} className="block">
                      {block(shift, true, false)}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        {!shifts.length && (
          <li>
            <EmptyState size="compact" title={t('duty.calendar.emptyPeriod')} />
          </li>
        )}
      </ul>
    </div>
  )
}

/** პერიოდის გარეთ მყოფი დღე — ბადის კვირას ავსებს, არ იჭერს */
function OutsideDay({ day }: { day: string }) {
  return (
    <div className="min-h-24 rounded-md border border-dashed border-border p-1.5 text-sm tabular-nums text-muted-foreground/50" aria-hidden data-outside={day}>
      {parseDay(day).getDate()}
    </div>
  )
}
