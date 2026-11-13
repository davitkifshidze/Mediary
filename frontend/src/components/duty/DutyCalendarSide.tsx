import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import type { DutyShift, DutyWorkplace } from '@/api/duty'
import { formatHours, parseDay, sumMoney, sumShifts, todayIso } from '@/lib/duty'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { InfoHint } from '@/components/ui/info-hint'
import type { MenuAction } from '@/components/ui/record-menu'
import { cn } from '@/lib/utils'
import { DutyDayShifts, WorkplaceDot } from '@/components/duty/DutyBits'

/* ============================================================
   **კალენდრის გვერდითი პანელი** — არჩეული დღე სრულად და სამსახურები.

   ორი ბარათი: (1) **დღე** — მისი მორიგეობები (დრო, საათები, თანხა, შენიშვნა,
   რედაქტირება) და „დამატება"; (2) **სამსახურები** — ფერი, პერიოდის ჯამი და
   „მუქი / ღია" (`useDutyDim`). პერიოდის საერთო ჯამი და უახლოესი მორიგეობა
   გვერდის შემაჯამებელ ბარათებშია და აქ არ მეორდება.

   ⚠️ **`day = null` — დღის ბარათი არ იხატება**: ვიწრო ეკრანზე პანელი კალენდრის
   ქვეშ ჩადის (დაჭერილი დღიდან შორს), ამიტომ იქ დღე ფანჯარაში იხსნება;
   მონიშვნის რეჟიმში კი ბარათი მონიშვნისაა და „არჩეული დღე" არ არსებობს.
   ⚠️ ჯამები **ჩატვირთული პერიოდიდან** ითვლება (კალენდრის იგივე მორიგეობები,
   სამსახურის ფილტრით) და გაუქმებული არსად ითვლება — სერვერის წესი.
   ============================================================ */

export function DutyCalendarSide({
  day,
  shifts,
  workplaces,
  dimmed,
  onToggleDim,
  onEditShift,
  onAddShift,
  shiftActions,
  currency,
}: {
  day: string | null
  shifts: DutyShift[]
  workplaces: DutyWorkplace[]
  dimmed: ReadonlySet<number>
  onToggleDim: (workplaceId: number) => void
  onEditShift: (shift: DutyShift) => void
  onAddShift: (day: string) => void
  shiftActions?: (shift: DutyShift) => MenuAction[]
  currency: string
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language

  const byWorkplace = useMemo(
    () =>
      workplaces
        .map((workplace) => ({ workplace, sum: sumShifts(shifts.filter((shift) => shift.workplace_id === workplace.id)) }))
        .filter((row) => row.sum.count > 0 || row.workplace.is_active),
    [shifts, workplaces],
  )

  const dayShifts = useMemo(() => (day ? shifts.filter((shift) => shift.date === day) : []), [shifts, day])
  const daySum = sumShifts(dayShifts)
  const dayFormat = useMemo(() => new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }), [lang])

  if (!day && !byWorkplace.length) return null

  return (
    <aside className="space-y-4 xl:sticky xl:top-18" data-testid="duty-side">
      {day && (
        <section className="rounded-lg border border-border bg-card p-4" data-testid="duty-side-day" data-day-open={day}>
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 font-display text-lg font-semibold first-letter:uppercase">{dayFormat.format(parseDay(day))}</h3>
            {day === todayIso() && <Badge className="shrink-0 bg-[var(--mod-soft)] text-[var(--mod)]">{t('duty.day.today')}</Badge>}
          </div>

          {dayShifts.length ? (
            <>
              {/* ერთ მორიგეობაზე ჯამი მის ბლოკს გაიმეორებდა */}
              {dayShifts.length > 1 && (
                <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                  {t('duty.period.totals', { count: daySum.count, hours: formatHours(daySum.hours), pay: sumMoney(daySum, currency, lang) })}
                </p>
              )}
              <div className="mt-3">
                <DutyDayShifts shifts={dayShifts} currency={currency} onEdit={onEditShift} shiftActions={shiftActions} dimmed={dimmed} />
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{t('duty.day.free')}</p>
          )}

          <Button size="sm" className="mt-3" onClick={() => onAddShift(day)}>
            <Plus className="size-4" />
            {t('duty.shift.add')}
          </Button>
        </section>
      )}

      {byWorkplace.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4" data-testid="duty-side-workplaces">
          <h3 className="mb-3 flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground">
            {t('duty.side.byWorkplace')}
            {workplaces.length > 1 && <InfoHint info={t('duty.dim.hint')} />}
          </h3>
          <ul className="space-y-3">
            {byWorkplace.map(({ workplace, sum }) => (
              <li key={workplace.id} className={cn('text-sm', dimmed.has(workplace.id) && 'opacity-60')}>
                <div className="flex items-center gap-2">
                  <WorkplaceDot workplace={workplace} />
                  <span className="min-w-0 flex-1 truncate font-medium">{workplace.name}</span>
                  {workplaces.length > 1 && (
                    <Chip active={!dimmed.has(workplace.id)} onClick={() => onToggleDim(workplace.id)}>
                      {t(dimmed.has(workplace.id) ? 'duty.dim.light' : 'duty.dim.dark')}
                    </Chip>
                  )}
                </div>
                <p className="mt-0.5 pl-5 text-xs tabular-nums text-muted-foreground">
                  {t('duty.period.totals', { count: sum.count, hours: formatHours(sum.hours), pay: sumMoney(sum, currency, lang) })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}
