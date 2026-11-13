import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowUpRight, Ban, CalendarCheck, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Clock, Grid3x3, Loader2, Plus, Repeat, Rows3, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DUTY_KEY, fetchDutyPeriod, fetchDutySettings, fetchDutyShifts, fetchDutyWorkplaces, type DutyPeriodInfo, type DutyShift, type DutyWorkplace } from '@/api/duty'
import { eachDay, formatHours, formatMoney, hoursLabel, parseDay, periodLabel, shiftDay, shiftRange, todayIso, typeName, weekdayIndex, workplaceColor } from '@/lib/duty'
import { MODULE_ACCENT_FALLBACK, modAccent, useModules } from '@/lib/modules'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'

/* ============================================================
   **მორიგეობის მაკეტები — `/duty/mockups`. ⚠️ დროებითი გვერდი.**

   მორიგეობის მოდული გადასაწყობია, ბოლო გადაკეთება კი არ მოეწონა მომხმარებელს —
   ამიტომ ჯერ არჩევანი და მერე აწყობა: აქ ერთი და იგივე ნამდვილი მონაცემი (პერიოდი,
   მორიგეობები, სამსახურები) სამ სხვადასხვა ვიზუალურ ენაზეა დახატული. ვარიანტები
   ერთმანეთისგან სწორედ იმით განსხვავდება, რაც შეიძლება აწუხებდეს: უჯრის ზომა და
   სიმჭიდროვე, ფერის რაოდენობა, ნიშნის წაკითხვადობა, ღილაკების რაოდენობა.

   1. **დღის ბარათები** — ზემოთ ოთხი შემაჯამებელი ბარათი, კალენდარი დიდი დღის
      ბარათებით (სამსახურის ფერადი ზოლი, საათები, დრო, თანხა), არჩეული დღე — გვერდით.
   2. **კვირების ლენტა** — მთავარი მორიგეობების სიაა, კვირებად და კვირის ჯამით;
      კალენდარი პატარა ნავიგაციაა გვერდით.
   3. **მჭიდრო ბადე** — მთელი პერიოდი ერთ ეკრანზე: უჯრა სამსახურის ფერით ივსება,
      მარჯვნივ კვირის ჯამი, ქვემოთ სამსახურების წილი; ღილაკი თითქმის არ არის.

   ⚠️ მაკეტი მხოლოდ კითხულობს: დღის გახსნა და დამატება ნამდვილ გვერდზე (`/duty`) მიდის.
   ⚠️ გვერდის საკუთარი წარწერები i18n-ში არ იწერება — არჩევანის შემდეგ გვერდი იშლება;
   მორიგეობის ტერმინები მოდულის არსებული გასაღებებიდანაა.
   ============================================================ */

const VARIANTS = ['cards', 'feed', 'dense'] as const
type Variant = (typeof VARIANTS)[number]

interface Sum {
  count: number
  hours: number
  pay: number
  /** რამდენ მორიგეობას აქვს თანხა — ნულზე თანხა „—"-ით იწერება და არა „0 ₾"-ით */
  paid: number
}

const ZERO: Sum = { count: 0, hours: 0, pay: 0, paid: 0 }

/** გაუქმებული არც მორიგეობებში ითვლება, არც საათებში, არც თანხაში — სერვერის წესი */
const add = (sum: Sum, shift: DutyShift): Sum =>
  shift.status === 'cancelled'
    ? sum
    : { count: sum.count + 1, hours: sum.hours + shift.hours, pay: sum.pay + (shift.pay ?? 0), paid: sum.paid + (shift.pay != null ? 1 : 0) }

const sumOf = (shifts: DutyShift[]) => shifts.reduce(add, ZERO)

/** სამსახურის ფერი ბლოკზე — ზოლი და ღია ფონი; ტექსტი ყოველთვის ტექსტის ფერია */
const tint = (shift: DutyShift): CSSProperties =>
  ({ '--wp': shift.status === 'cancelled' ? 'var(--destructive)' : workplaceColor(shift.workplace) }) as CSSProperties

/** პერიოდის კვირები, ორშაბათიდან კვირამდე — გარეთ მყოფი დღეებითაც */
function weeksOf(from: string, to: string): string[][] {
  const start = shiftDay(from, -weekdayIndex(from))
  const end = shiftDay(to, 6 - weekdayIndex(to))
  const days = eachDay(start, end)

  return Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7))
}

interface Shared {
  period: DutyPeriodInfo
  shifts: DutyShift[]
  byDay: Map<string, DutyShift[]>
  workplaces: DutyWorkplace[]
  total: Sum
  currency: string
  /** დღევანდელი პერიოდი ღიაა — „დღევანდელზე დაბრუნება" არ სჭირდება */
  current: boolean
  goTo: (date: string | null) => void
}

export function DutyMockupsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { all } = useModules()
  const [params, setParams] = useSearchParams()

  const variant: Variant = VARIANTS.find((v) => v === params.get('v')) ?? 'cards'
  const anchor = params.get('date') ?? undefined

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const settingsQ = useQuery({ queryKey: [DUTY_KEY, 'settings'], queryFn: fetchDutySettings })
  const periodQ = useQuery({ queryKey: [DUTY_KEY, 'period', anchor ?? 'today', null], queryFn: () => fetchDutyPeriod(anchor, null) })
  const workplacesQ = useQuery({ queryKey: [DUTY_KEY, 'workplaces'], queryFn: () => fetchDutyWorkplaces(lang === 'en' ? 'en' : 'ka') })
  const period = periodQ.data
  const shiftsQ = useQuery({
    queryKey: [DUTY_KEY, 'shifts', period?.from, period?.to],
    queryFn: () => fetchDutyShifts({ from: period!.from, to: period!.to }),
    enabled: !!period,
  })

  const shifts = useMemo(() => shiftsQ.data?.items ?? [], [shiftsQ.data])
  const byDay = useMemo(() => {
    const map = new Map<string, DutyShift[]>()
    for (const shift of shifts) map.set(shift.date, [...(map.get(shift.date) ?? []), shift])
    return map
  }, [shifts])

  const shared: Shared | null = period
    ? {
        period,
        shifts,
        byDay,
        workplaces: workplacesQ.data ?? [],
        total: sumOf(shifts),
        currency: settingsQ.data?.currency ?? '₾',
        current: !anchor,
        goTo: (date) => setParam('date', date),
      }
    : null

  const color = all.find((m) => m.key === 'duty')?.color

  return (
    <PageContainer>
      <Link to="/duty" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t('duty.title')}
      </Link>

      <PageHeader
        module="duty"
        title="მაკეტები"
        hint="დროებითი გვერდი: სამი ვარიანტი შენი ნამდვილი მონაცემებით. აირჩიე ერთი (ან თქვი, რა შევურიო ერთმანეთს) — მოდული ამის მიხედვით გადაეწყობა და ეს გვერდი წაიშლება."
      />

      <div className="mb-5">
        <CutTabs
          options={[
            { key: 'cards', label: '1 · დღის ბარათები', hint: 'შემაჯამებელი ბარათები, დიდი დღეები', icon: CalendarDays },
            { key: 'feed', label: '2 · კვირების ლენტა', hint: 'სია კვირებად, კალენდარი პატარა', icon: Rows3 },
            { key: 'dense', label: '3 · მჭიდრო ბადე', hint: 'ყველაფერი ერთ ეკრანზე, კვირის ჯამით', icon: Grid3x3 },
          ]}
          value={variant}
          onChange={(key) => setParam('v', key === 'cards' ? null : key)}
        />
      </div>

      <div style={modAccent(color) ?? MODULE_ACCENT_FALLBACK} data-testid={`duty-mockup-${variant}`}>
        {!shared || shiftsQ.isLoading ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : variant === 'cards' ? (
          <DayCards {...shared} />
        ) : variant === 'feed' ? (
          <WeekFeed {...shared} />
        ) : (
          <DenseGrid {...shared} />
        )}
      </div>
    </PageContainer>
  )
}

/* ---------- საერთო ნაწილები ---------- */

function useNames() {
  const { i18n } = useTranslation()
  const locale = i18n.language

  return useMemo(() => {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    const long = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', weekday: 'long' })
    const short = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
    const month = new Intl.DateTimeFormat(locale, { month: 'short' })

    return {
      // 2024-01-01 ორშაბათია
      weekdays: Array.from({ length: 7 }, (_, i) => weekday.format(new Date(2024, 0, 1 + i, 12))),
      weekday: (day: string) => weekday.format(parseDay(day)),
      long: (day: string) => long.format(parseDay(day)),
      short: (day: string) => short.format(parseDay(day)),
      month: (day: string) => month.format(parseDay(day)),
    }
  }, [locale])
}

/** თანხა; როცა არცერთ მორიგეობას არ აქვს — ტირე და არა „0 ₾" */
function useMoney(currency: string) {
  const { i18n } = useTranslation()

  return (sum: Pick<Sum, 'pay' | 'paid'>) => (sum.paid > 0 ? formatMoney(sum.pay, currency, i18n.language) : '—')
}

/** უახლოესი მორიგეობა — დღეს ან მერე, გაუქმებულის გარეშე */
const nextShift = (shifts: DutyShift[]) => {
  const today = todayIso()

  return shifts.find((shift) => shift.date >= today && shift.status !== 'cancelled') ?? null
}

/** სამსახურის სახელი და ფერი — ლეგენდაში და დეტალებში */
function WorkplaceDot({ shift, className }: { shift: Pick<DutyShift, 'workplace'>; className?: string }) {
  return <span className={cn('inline-block size-2.5 shrink-0 rounded-sm', className)} style={{ background: workplaceColor(shift.workplace) }} />
}

/** მორიგეობის ნიშნები: გაუქმებული · ნაწილობრივი · რიტმიდან */
function ShiftMarks({ shift }: { shift: DutyShift }) {
  const { t } = useTranslation()

  return (
    <>
      {shift.status === 'cancelled' && <Ban className="size-3.5 shrink-0 text-destructive" aria-label={t('duty.status.cancelled')} />}
      {shift.pattern_id != null && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('duty.pattern.fromPattern')} />}
    </>
  )
}

/** დღის სრული აღწერა — ვარიანტი 1-ის გვერდითი პანელი და ვარიანტი 3-ის ქვედა ზოლი */
function DayDetail({ day, shifts, currency, compact = false }: { day: string; shifts: DutyShift[]; currency: string; compact?: boolean }) {
  const { t, i18n } = useTranslation()
  const names = useNames()

  return (
    <div data-testid="mock-day-detail">
      <p className={cn('font-display font-semibold first-letter:uppercase', compact ? 'text-base' : 'text-lg')}>{names.long(day)}</p>

      {shifts.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">თავისუფალი დღე</p>
      ) : (
        <ul className={cn('mt-3', compact ? 'grid gap-2 sm:grid-cols-2' : 'space-y-2')}>
          {shifts.map((shift) => (
            <li
              key={shift.id}
              style={tint(shift)}
              className="rounded-md border-l-4 border-[var(--wp)] bg-[color-mix(in_oklab,var(--wp)_12%,transparent)] p-2.5"
            >
              <p className={cn('flex flex-wrap items-center gap-1.5 text-sm font-semibold', shift.status === 'cancelled' && 'text-destructive line-through')}>
                {shift.workplace?.name ?? t('duty.noWorkplace')}
                <span className="font-normal text-muted-foreground">· {shift.type ? typeName(shift.type, i18n.language) : t('duty.shift.custom')}</span>
                <ShiftMarks shift={shift} />
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums text-muted-foreground">
                {shiftRange(shift) && <span>{shiftRange(shift)}</span>}
                <span>{t('duty.hoursValue', { hours: hoursLabel(shift) })}</span>
                {shift.pay != null && <span className="font-medium text-foreground">{formatMoney(shift.pay, currency, i18n.language)}</span>}
                {shift.status !== 'scheduled' && <Badge className="bg-secondary">{t(`duty.status.${shift.status}`)}</Badge>}
              </p>
              {shift.note && <p className="mt-1 text-sm text-muted-foreground">{shift.note}</p>}
            </li>
          ))}
        </ul>
      )}

      {/* მაკეტი მხოლოდ კითხულობს — დამატება და შეცვლა ნამდვილ გვერდზეა */}
      <Link to={`/duty?date=${day}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3')}>
        {shifts.length ? <ArrowUpRight className="size-4" /> : <Plus className="size-4" />}
        {shifts.length ? 'გახსნა მორიგეობის გვერდზე' : t('duty.shift.add')}
      </Link>
    </div>
  )
}

/** სამსახურების ლეგენდა ჯამებით */
function Legend({ shifts, workplaces, currency }: { shifts: DutyShift[]; workplaces: DutyWorkplace[]; currency: string }) {
  const { t } = useTranslation()
  const money = useMoney(currency)

  return (
    <ul className="space-y-1.5 text-sm" data-testid="mock-legend">
      {workplaces.map((workplace) => {
        const sum = sumOf(shifts.filter((shift) => shift.workplace_id === workplace.id))

        return (
          <li key={workplace.id} className={cn('flex items-center gap-2', sum.count === 0 && 'opacity-50')}>
            <WorkplaceDot shift={{ workplace }} />
            <span className="min-w-0 flex-1 truncate font-medium">{workplace.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {sum.count} · {t('duty.hoursValue', { hours: formatHours(sum.hours) })} · {money(sum)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/* ============================================================
   ვარიანტი 1 — დღის ბარათები
   ============================================================ */

function StatCard({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)] text-[var(--mod)]">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-semibold leading-tight tabular-nums">{value}</p>
        {note && <p className="truncate text-xs text-muted-foreground">{note}</p>}
      </div>
    </div>
  )
}

function DayCards({ period, shifts, byDay, workplaces, total, currency, current, goTo }: Shared) {
  const { t, i18n } = useTranslation()
  const names = useNames()
  const money = useMoney(currency)
  const today = todayIso()
  const weeks = useMemo(() => weeksOf(period.from, period.to), [period.from, period.to])
  const inPeriod = (day: string) => day >= period.from && day <= period.to
  const next = nextShift(shifts)

  // ნაგულისხმევად — დღევანდელი დღე, თორემ პირველი მორიგეობა, თორემ პერიოდის დასაწყისი
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked && inPeriod(picked) ? picked : inPeriod(today) ? today : (shifts[0]?.date ?? period.from)

  const block = (shift: DutyShift, roomy: boolean) => (
    <span
      key={shift.id}
      style={tint(shift)}
      className={cn(
        'block rounded-md border-l-4 border-[var(--wp)] bg-[color-mix(in_oklab,var(--wp)_16%,transparent)] px-1.5 py-1 text-left',
        shift.status === 'cancelled' && 'text-destructive line-through',
      )}
      data-testid="mock-shift"
    >
      <span className="flex items-center justify-between gap-1 text-xs font-semibold">
        <span className="truncate">{shift.workplace?.short || shift.workplace?.name || t('duty.noWorkplace')}</span>
        <span className="shrink-0 tabular-nums">{t('duty.hoursValue', { hours: hoursLabel(shift) })}</span>
      </span>
      {roomy && shift.start_time && <span className="block truncate text-[11px] tabular-nums text-muted-foreground">{shiftRange(shift)}</span>}
      {roomy && shift.pay != null && (
        <span className="block text-right text-[11px] font-medium tabular-nums">{formatMoney(shift.pay, currency, i18n.language)}</span>
      )}
    </span>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CalendarDays} label={t('duty.side.shifts')} value={total.count} />
        <StatCard icon={Clock} label={t('duty.side.hours')} value={formatHours(total.hours)} />
        <StatCard icon={Wallet} label={t('duty.side.pay')} value={money(total)} />
        <StatCard
          icon={CalendarClock}
          label={t('duty.side.next')}
          value={next ? names.short(next.date) : '—'}
          note={next ? [next.workplace?.name, shiftRange(next)].filter(Boolean).join(' · ') : undefined}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-lg border border-border bg-card p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => goTo(period.previous.from)}>
              <ChevronLeft className="size-4" />
              {t('duty.period.previous')}
            </Button>
            <h2 className="px-1 font-display text-lg font-semibold first-letter:uppercase">{periodLabel(period.from, period.to, i18n.language)}</h2>
            <Button variant="outline" size="sm" onClick={() => goTo(period.next.from)}>
              {t('duty.period.next')}
              <ChevronRight className="size-4" />
            </Button>
            {!current && (
              <Button variant="outline" size="sm" onClick={() => goTo(null)}>
                <CalendarCheck className="size-4" />
                {t('duty.period.today')}
              </Button>
            )}
          </div>

          {/* ---------- ბადე: თითო დღე ცალკე ბარათია ---------- */}
          <div className="hidden sm:block">
            <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-muted-foreground">
              {names.weekdays.map((name, i) => (
                <span key={name} className={cn(i >= 5 && 'text-[var(--mod)]')}>
                  {name}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {weeks.flat().map((day) => {
                const items = byDay.get(day) ?? []
                const date = parseDay(day)

                if (!inPeriod(day)) {
                  return (
                    <div key={day} className="min-h-24 rounded-md border border-dashed border-border p-1.5 text-xs text-muted-foreground/50" aria-hidden>
                      {date.getDate()}
                    </div>
                  )
                }

                return (
                  <button
                    data-kind="calendar"
                    key={day}
                    type="button"
                    aria-pressed={day === selected}
                    onClick={() => setPicked(day)}
                    className={cn(
                      'flex min-h-24 flex-col gap-1 rounded-md border bg-background p-1.5 text-left transition-colors',
                      weekdayIndex(day) >= 5 && 'bg-muted/50',
                      day === selected ? 'border-[var(--mod)] shadow-[inset_0_0_0_1px_var(--mod)]' : 'border-border hover:border-[var(--mod)]',
                    )}
                    data-testid="mock-day"
                  >
                    <span className="flex items-center gap-1 text-xs">
                      <span className={cn('text-sm font-semibold tabular-nums', day < today && 'text-muted-foreground')}>{date.getDate()}</span>
                      {(day === period.from || date.getDate() === 1) && <span className="uppercase text-muted-foreground">{names.month(day)}</span>}
                      {day === today && <Badge className="ml-auto bg-[var(--mod-soft)] px-1.5 py-0.5 text-[10px] text-[var(--mod)]">დღეს</Badge>}
                    </span>
                    {items.map((shift) => block(shift, items.length === 1))}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ---------- ტელეფონი: მხოლოდ მორიგეობიანი დღეები, იმავე ბარათებით ---------- */}
          <ul className="space-y-2 sm:hidden">
            {[...byDay.keys()].sort().map((day) => (
              <li key={day}>
                <button
                  data-kind="calendar"
                  type="button"
                  onClick={() => setPicked(day)}
                  className={cn('flex w-full items-start gap-3 rounded-md border bg-background p-2 text-left', day === selected ? 'border-[var(--mod)]' : 'border-border')}
                >
                  <span className="w-10 shrink-0 text-center">
                    <span className="block text-lg font-semibold leading-none tabular-nums">{parseDay(day).getDate()}</span>
                    <span className="block text-[11px] uppercase text-muted-foreground">{names.weekday(day)}</span>
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">{(byDay.get(day) ?? []).map((shift) => block(shift, true))}</span>
                </button>
              </li>
            ))}
            {!shifts.length && (
              <li>
                <EmptyState size="compact" title={t('duty.calendar.emptyPeriod')} />
              </li>
            )}
          </ul>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <DayDetail day={selected} shifts={byDay.get(selected) ?? []} currency={currency} />
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">{t('duty.side.byWorkplace')}</p>
            <Legend shifts={shifts} workplaces={workplaces} currency={currency} />
          </div>
        </aside>
      </div>
    </div>
  )
}

/* ============================================================
   ვარიანტი 2 — კვირების ლენტა
   ============================================================ */

function WeekFeed({ period, shifts, byDay, workplaces, total, currency, current, goTo }: Shared) {
  const { t, i18n } = useTranslation()
  const names = useNames()
  const money = useMoney(currency)
  const today = todayIso()
  const weeks = useMemo(() => weeksOf(period.from, period.to), [period.from, period.to])
  const inPeriod = (day: string) => day >= period.from && day <= period.to
  const [focus, setFocus] = useState<string | null>(null)

  const jump = (day: string) => {
    setFocus(day)
    document.getElementById(`mock-week-${weeks.findIndex((week) => week.includes(day))}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="space-y-3 lg:sticky lg:top-4">
        {/* ---------- პატარა კალენდარი — ნავიგაცია ---------- */}
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-8" aria-label={t('duty.period.previous')} onClick={() => goTo(period.previous.from)}>
              <ChevronLeft className="size-4" />
            </Button>
            <h2 className="min-w-0 flex-1 truncate text-center text-sm font-semibold first-letter:uppercase">{periodLabel(period.from, period.to, i18n.language)}</h2>
            <Button variant="ghost" size="icon" className="size-8" aria-label={t('duty.period.next')} onClick={() => goTo(period.next.from)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
            {names.weekdays.map((name) => (
              <span key={name}>{name.slice(0, 2)}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-0.5">
            {weeks.flat().map((day) => {
              const items = (byDay.get(day) ?? []).filter((shift) => shift.status !== 'cancelled')

              return (
                <button
                  data-kind="calendar"
                  key={day}
                  type="button"
                  disabled={!inPeriod(day)}
                  onClick={() => jump(day)}
                  style={items[0] ? tint(items[0]) : undefined}
                  className={cn(
                    'relative grid h-8 place-items-center rounded-sm text-xs tabular-nums transition-colors disabled:opacity-30',
                    items.length ? 'bg-[color-mix(in_oklab,var(--wp)_26%,transparent)] font-semibold' : 'hover:bg-muted',
                    day === today && 'shadow-[inset_0_0_0_2px_var(--mod)]',
                    day === focus && 'bg-[var(--mod-fill)]',
                  )}
                  data-testid="mock-mini-day"
                >
                  {parseDay(day).getDate()}
                  {/* მეორე სამსახური იმავე დღეს — წერტილი */}
                  {items[1] && <span className="absolute bottom-0.5 right-0.5 size-1.5 rounded-sm" style={{ background: workplaceColor(items[1].workplace) }} />}
                </button>
              )
            })}
          </div>
          {!current && (
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => goTo(null)}>
              <CalendarCheck className="size-4" />
              {t('duty.period.today')}
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              [t('duty.side.shifts'), total.count],
              [t('duty.side.hours'), formatHours(total.hours)],
              [t('duty.side.pay'), money(total)],
            ].map(([label, value]) => (
              <div key={label}>
                <dd className="text-lg font-semibold leading-tight tabular-nums text-[var(--mod)]">{value}</dd>
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
              </div>
            ))}
          </dl>
          <div className="mt-3 border-t border-border pt-3">
            <Legend shifts={shifts} workplaces={workplaces} currency={currency} />
          </div>
        </div>
      </aside>

      {/* ---------- ლენტა: კვირა → მისი მორიგეობები ---------- */}
      <div className="space-y-4" data-testid="mock-feed">
        {weeks.map((week, index) => {
          const days = week.filter(inPeriod)
          const items = days.flatMap((day) => byDay.get(day) ?? [])
          const sum = sumOf(items)

          return (
            <section key={week[0]} id={`mock-week-${index}`} className="scroll-mt-4">
              <header className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
                <h3 className="text-sm font-semibold">
                  {names.short(days[0])} – {names.short(days[days.length - 1])}
                </h3>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {sum.count
                    ? t('duty.period.totals', { count: sum.count, hours: formatHours(sum.hours), pay: money(sum) })
                    : 'თავისუფალი კვირა'}
                </span>
              </header>

              {items.length === 0 ? (
                <div className="rounded-md border border-dashed border-border" aria-hidden>
                  <span className="block h-2" />
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {items.map((shift) => (
                    <li key={shift.id}>
                      <Link
                        to={`/duty?date=${shift.date}`}
                        style={tint(shift)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border bg-card p-2.5 transition-colors hover:border-[var(--wp)]',
                          shift.date === today ? 'border-[var(--mod)]' : 'border-border',
                          shift.date === focus && 'bg-[var(--mod-soft)]',
                          shift.date < today && 'opacity-70',
                        )}
                        data-testid="mock-feed-row"
                      >
                        <span className="w-11 shrink-0 text-center">
                          <span className="block text-xl font-semibold leading-none tabular-nums">{parseDay(shift.date).getDate()}</span>
                          <span className="block text-[11px] uppercase text-muted-foreground">{names.weekday(shift.date)}</span>
                        </span>
                        <span className="h-10 w-1 shrink-0 rounded-sm bg-[var(--wp)]" />
                        <span className="min-w-0 flex-1">
                          <span className={cn('flex flex-wrap items-center gap-1.5 text-sm font-semibold', shift.status === 'cancelled' && 'text-destructive line-through')}>
                            {shift.workplace?.name ?? t('duty.noWorkplace')}
                            <ShiftMarks shift={shift} />
                          </span>
                          <span className="block truncate text-xs tabular-nums text-muted-foreground">
                            {[shift.type ? typeName(shift.type, i18n.language) : t('duty.shift.custom'), shiftRange(shift), shift.status !== 'scheduled' ? t(`duty.status.${shift.status}`) : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold tabular-nums">{t('duty.hoursValue', { hours: hoursLabel(shift) })}</span>
                          <span className="block text-xs tabular-nums text-muted-foreground">
                            {shift.pay != null ? formatMoney(shift.pay, currency, i18n.language) : '—'}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================
   ვარიანტი 3 — მჭიდრო ბადე კვირის ჯამით
   ============================================================ */

function DenseGrid({ period, shifts, byDay, workplaces, total, currency, current, goTo }: Shared) {
  const { t, i18n } = useTranslation()
  const names = useNames()
  const money = useMoney(currency)
  const today = todayIso()
  const weeks = useMemo(() => weeksOf(period.from, period.to), [period.from, period.to])
  const inPeriod = (day: string) => day >= period.from && day <= period.to
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked && inPeriod(picked) ? picked : null

  const shares = workplaces
    .map((workplace) => ({ workplace, sum: sumOf(shifts.filter((shift) => shift.workplace_id === workplace.id)) }))
    .filter((row) => row.sum.hours > 0)

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      {/* ---------- თავი: ნავიგაცია და ჯამი ერთ ხაზზე ---------- */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Button variant="ghost" size="icon" className="size-8" aria-label={t('duty.period.previous')} onClick={() => goTo(period.previous.from)}>
          <ChevronLeft className="size-4" />
        </Button>
        <h2 className="font-display text-lg font-semibold first-letter:uppercase">{periodLabel(period.from, period.to, i18n.language)}</h2>
        <Button variant="ghost" size="icon" className="size-8" aria-label={t('duty.period.next')} onClick={() => goTo(period.next.from)}>
          <ChevronRight className="size-4" />
        </Button>
        {!current && (
          <Button variant="ghost" size="icon" className="size-8" aria-label={t('duty.period.today')} onClick={() => goTo(null)}>
            <CalendarCheck className="size-4" />
          </Button>
        )}
        <p className="ml-auto text-sm tabular-nums text-muted-foreground" data-testid="mock-dense-totals">
          {t('duty.period.totals', { count: total.count, hours: formatHours(total.hours), pay: money(total) })}
        </p>
      </header>

      {/* ---------- ბადე: 7 დღე + კვირის ჯამი ---------- */}
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_4rem] text-center text-xs font-medium text-muted-foreground sm:grid-cols-[repeat(7,minmax(0,1fr))_6rem]">
        {names.weekdays.map((name, i) => (
          <span key={name} className={cn('border-b border-r border-border py-1.5', i >= 5 && 'bg-muted/50')}>
            {name}
          </span>
        ))}
        <span className="border-b border-border bg-muted/50 py-1.5">Σ</span>
      </div>

      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_4rem] sm:grid-cols-[repeat(7,minmax(0,1fr))_6rem]">
        {weeks.map((week) => {
          const sum = sumOf(week.filter(inPeriod).flatMap((day) => byDay.get(day) ?? []))

          return [
            ...week.map((day) => {
              const items = byDay.get(day) ?? []

              if (!inPeriod(day)) {
                return <div key={day} className="min-h-16 border-b border-r border-border bg-muted/20" aria-hidden />
              }

              return (
                <button
                  data-kind="calendar"
                  key={day}
                  type="button"
                  aria-pressed={day === selected}
                  onClick={() => setPicked(day === selected ? null : day)}
                  className={cn(
                    'relative flex min-h-16 flex-col border-b border-r border-border text-left transition-colors',
                    !items.length && 'hover:bg-muted/60',
                    !items.length && weekdayIndex(day) >= 5 && 'bg-muted/40',
                    day === selected && 'shadow-[inset_0_0_0_2px_var(--mod)]',
                  )}
                  data-testid="mock-dense-day"
                >
                  <span
                    className={cn(
                      'absolute left-1 top-0.5 z-10 text-[11px] tabular-nums',
                      day === today ? 'rounded-sm bg-[var(--mod)] px-1 font-semibold text-background' : 'text-muted-foreground',
                    )}
                  >
                    {parseDay(day).getDate()}
                  </span>
                  {/* უჯრა სამსახურის ფერით ივსება; ორი მორიგეობა უჯრას შუაზე ყოფს */}
                  {items.map((shift) => (
                    <span
                      key={shift.id}
                      style={tint(shift)}
                      className={cn(
                        'flex flex-1 flex-col items-center justify-center bg-[color-mix(in_oklab,var(--wp)_22%,transparent)] px-0.5 pt-3 leading-tight',
                        shift.status === 'cancelled' && 'text-destructive line-through',
                      )}
                    >
                      <span className="text-sm font-semibold tabular-nums">
                        {shift.workplace?.short || shift.workplace?.name?.slice(0, 1)} {hoursLabel(shift)}
                      </span>
                      {shift.pay != null && items.length === 1 && (
                        <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:block">{formatMoney(shift.pay, currency, i18n.language)}</span>
                      )}
                    </span>
                  ))}
                </button>
              )
            }),
            <div key={`${week[0]}-sum`} className="flex min-h-16 flex-col items-center justify-center border-b border-border bg-muted/50 px-1 text-center leading-tight" data-testid="mock-week-sum">
              <span className={cn('text-sm font-semibold tabular-nums', sum.count === 0 && 'text-muted-foreground/50')}>
                {sum.count ? t('duty.hoursValue', { hours: formatHours(sum.hours) }) : '—'}
              </span>
              {sum.paid > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{money(sum)}</span>}
            </div>,
          ]
        })}
      </div>

      {/* ---------- არჩეული დღე — ერთი ზოლი ბადის ქვემოთ ---------- */}
      {selected && (
        <div className="border-b border-border p-3">
          <DayDetail day={selected} shifts={byDay.get(selected) ?? []} currency={currency} compact />
        </div>
      )}

      {/* ---------- სამსახურების წილი საათებში ---------- */}
      <footer className="p-3">
        {shares.length > 0 && (
          <div className="mb-3 flex h-2.5 overflow-hidden rounded-sm bg-muted" role="img" aria-label={t('duty.side.byWorkplace')}>
            {shares.map(({ workplace, sum }) => (
              <span key={workplace.id} style={{ width: `${(sum.hours / total.hours) * 100}%`, background: workplaceColor(workplace) }} />
            ))}
          </div>
        )}
        <Legend shifts={shifts} workplaces={workplaces} currency={currency} />
      </footer>
    </section>
  )
}
