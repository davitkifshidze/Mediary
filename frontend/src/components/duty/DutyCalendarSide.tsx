import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock } from 'lucide-react'
import type { DutyShift, DutyWorkplace } from '@/api/duty'
import { formatHours, formatMoney, parseDay, shiftRange, todayIso, typeName, workplaceColor } from '@/lib/duty'
import { Chip } from '@/components/ui/chip'
import { InfoHint } from '@/components/ui/info-hint'
import { cn } from '@/lib/utils'

/* ============================================================
   **კალენდრის გვერდითი პანელი** — პერიოდი ერთი შეხედვით.

   სამი ბლოკი: პერიოდის ჯამი (მორიგეობა · საათი · თანხა), სამსახურები თავისი
   ფერით და ჯამით (+ „მუქი / ღია" — `useDutyDim`) და უახლოესი მორიგეობა.
   ⚠️ ჯამები **ჩატვირთული პერიოდიდან** ითვლება (კალენდრის იგივე მორიგეობები,
   სამსახურის ფილტრით) და გაუქმებული არსად ითვლება — სერვერის წესი.
   ============================================================ */

interface Sum {
  count: number
  hours: number
  pay: number
}

const add = (sum: Sum, shift: DutyShift): Sum =>
  shift.status === 'cancelled' ? sum : { count: sum.count + 1, hours: sum.hours + shift.hours, pay: sum.pay + (shift.pay ?? 0) }

export function DutyCalendarSide({
  shifts,
  workplaces,
  dimmed,
  onToggleDim,
  onOpenShift,
  currency,
}: {
  shifts: DutyShift[]
  workplaces: DutyWorkplace[]
  dimmed: ReadonlySet<number>
  onToggleDim: (workplaceId: number) => void
  onOpenShift: (shift: DutyShift) => void
  currency: string
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const today = todayIso()

  const total = useMemo(() => shifts.reduce(add, { count: 0, hours: 0, pay: 0 }), [shifts])

  const byWorkplace = useMemo(
    () =>
      workplaces
        .map((w) => ({ workplace: w, sum: shifts.filter((s) => s.workplace_id === w.id).reduce(add, { count: 0, hours: 0, pay: 0 }) }))
        .filter((row) => row.sum.count > 0 || row.workplace.is_active),
    [shifts, workplaces],
  )

  // უახლოესი — დღეს ან მერე, გაუქმებულის გარეშე
  const next = useMemo(
    () =>
      shifts
        .filter((s) => s.status !== 'cancelled' && s.date >= today)
        .sort((a, b) => (a.date + (a.start_time ?? '')).localeCompare(b.date + (b.start_time ?? '')))[0] ?? null,
    [shifts, today],
  )

  const dayFormat = useMemo(() => new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }), [lang])

  return (
    <aside className="space-y-4" data-testid="duty-side">
      <section className="grid grid-cols-3 gap-2 xl:grid-cols-1">
        <Tile label={t('duty.side.shifts')} value={String(total.count)} />
        <Tile label={t('duty.side.hours')} value={formatHours(total.hours)} />
        <Tile label={t('duty.side.pay')} value={formatMoney(total.pay, currency, lang)} strong />
      </section>

      {next && (
        <section className="rounded-lg border border-border bg-card p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
            <CalendarClock className="size-3.5" />
            {t(next.date === today ? 'duty.side.today' : 'duty.side.next')}
          </h3>
          <button type="button" onClick={() => onOpenShift(next)} className="w-full cursor-pointer text-left" data-testid="duty-side-next">
            <p className="font-semibold first-letter:uppercase">{dayFormat.format(parseDay(next.date))}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: workplaceColor(next.workplace) }} />
              <span className="truncate">{next.workplace?.name ?? t('duty.noWorkplace')}</span>
            </p>
            <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
              {[next.type ? typeName(next.type, lang) : null, shiftRange(next), t('duty.hoursValue', { hours: formatHours(next.hours) })]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </button>
        </section>
      )}

      {byWorkplace.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-3" data-testid="duty-side-workplaces">
          <h3 className="mb-2 flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground">
            {t('duty.side.byWorkplace')}
            {workplaces.length > 1 && <InfoHint info={t('duty.dim.hint')} />}
          </h3>
          <ul className="space-y-2.5">
            {byWorkplace.map(({ workplace, sum }) => (
              <li key={workplace.id} className={cn('text-sm', dimmed.has(workplace.id) && 'opacity-60')}>
                <div className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-sm" style={{ background: workplaceColor(workplace) }} />
                  <span className="min-w-0 flex-1 truncate font-medium">{workplace.name}</span>
                  {workplaces.length > 1 && (
                    <Chip active={!dimmed.has(workplace.id)} onClick={() => onToggleDim(workplace.id)}>
                      {t(dimmed.has(workplace.id) ? 'duty.dim.light' : 'duty.dim.dark')}
                    </Chip>
                  )}
                </div>
                <p className="mt-0.5 pl-5 text-xs tabular-nums text-muted-foreground">
                  {t('duty.period.totals', {
                    count: sum.count,
                    hours: formatHours(sum.hours),
                    pay: formatMoney(sum.pay, currency, lang),
                  })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 truncate font-semibold tabular-nums', strong ? 'text-xl' : 'text-lg')}>{value}</p>
    </div>
  )
}
