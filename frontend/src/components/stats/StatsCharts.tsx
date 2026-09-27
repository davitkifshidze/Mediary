import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { User } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType,
} from 'recharts'
import { storageUrl } from '@/lib/api'
import { seriesColor } from '@/lib/chartColors'
import { cn } from '@/lib/utils'
import {
  BAR_RADIUS_X,
  BAR_RADIUS_Y,
  CHART_GRID,
  CHART_TICK,
  ChartFrame,
  ChartTip,
  clipLabel,
} from '@/components/ui/chart'

/* ============================================================
   **სტატისტიკის გრაფიკები** (Tasks §28).

   Q19-ის ოთხივე შენიშვნით: **რგოლი არაა** (ნაწილი-მთლიანს ერთი
   ჰორიზონტალური დაწყობილი ზოლი ამბობს — რგოლს ადამიანი ცუდად კითხულობს),
   **თვეები სვეტებია** და არა ფართობი (თვე ცალკეული ერთეულია, ფართობი
   უწყვეტობას „ტყუის"), **ფერი მოდულისაა** (`lib/chartColors.ts` —
   ორივე თემაზე წაკითხვადი) და **ცოტა, მაგრამ დიდი** გრაფიკია ჩანართში.

   ⚠️ **სერიის ფერი `var(--series-N)`-ია** — მნიშვნელობა მშობლის
   `.fb-series`-დან მოდის (`seriesVars`), ე.ი. აქ ფერის გამოთვლა არ ხდება.
   ============================================================ */

export interface Series {
  key: string
  label: string
}

/** ერთი რიგი/სვეტი — `label` + თითო სერიის რიცხვი */
export type StackRow = { key: string; label: string; full?: string } & Record<string, string | number | undefined>

type Tip = TooltipContentProps<TooltipValueType, number | string>

/** ჭრილის სათაური და შიგთავსი */
export function Cut({ title, hint, children, className }: { title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 rounded-xl border border-border bg-card p-5', className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {hint}
      </div>
      {children}
    </section>
  )
}

/** ლეგენდა — ერთ სერიაზე არ იხატება (სათაური ისედაც ასახელებს) */
export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: seriesColor(i) }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

/** ტულტიპი დაწყობილ გრაფიკზე — თითო სერია და ჯამი */
function stackTip(series: Series, allSeries: Series[]) {
  return function Content(props: Tip) {
    const entry = props.payload?.[0]
    if (!props.active || !entry) return null

    const row = entry.payload as StackRow
    const rows = allSeries
      .map((s, i) => ({ label: s.label, value: Number(row[s.key] ?? 0), tone: seriesColor(i) }))
      .filter((r) => r.value > 0)

    return <ChartTip title={row.full ?? row.label} rows={rows.length ? rows : [{ label: series.label, value: 0 }]} />
  }
}

/**
 * **ჰორიზონტალური ზოლები, დომენებად დაწყობილი** — ჟანრები (Q20-ის პირველი
 * კითხვა): სამი ერთნაირი ბლოკის ნაცვლად ერთი შედარება.
 */
export function StackedBars({ rows, series }: { rows: StackRow[]; series: Series[] }) {
  if (!rows.length) return null

  const height = Math.max(160, rows.length * 32 + 16)

  return (
    <ChartFrame height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke={CHART_GRID} />
        <XAxis type="number" allowDecimals={false} tick={CHART_TICK} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={132}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => clipLabel(v, 18)}
        />
        <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={stackTip(series[0], series)} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="stack"
            fill={seriesColor(i)}
            barSize={16}
            // ⚠️ მომრგვალება მხოლოდ ბოლო სეგმენტს — შუაში ღრეჭოს დახატავდა
            radius={i === series.length - 1 ? BAR_RADIUS_X : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartFrame>
  )
}

/**
 * **სვეტები რიგობრივ ღერძზე, დომენებად დაწყობილი** — თვეები (Q20-ის
 * მესამე კითხვა, ერთ დროის ღერძზე), ქულები, გამოშვების წლები.
 *
 * ⚠️ ნულოვანი თვე მაინც ხატება (ცარიელი ადგილით) — „ივლისში არაფერი"
 * უნდა ჩანდეს და არა გამქრალი თვე.
 */
export function StackedColumns({ rows, series, height = 240 }: { rows: StackRow[]; series: Series[]; height?: number }) {
  if (!rows.length) return null

  return (
    <ChartFrame height={height}>
      <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid vertical={false} stroke={CHART_GRID} />
        <XAxis dataKey="label" tick={CHART_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
        <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={stackTip(series[0], series)} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="stack"
            fill={seriesColor(i)}
            maxBarSize={36}
            radius={i === series.length - 1 ? BAR_RADIUS_Y : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartFrame>
  )
}

export interface ShareSegment {
  key: string
  label: string
  value: number
  /** CSS-ის ფერი (სტატუსის ან როლის ტონი) */
  tone: string
}

/**
 * **ნაწილი მთელთან — ერთი ჰორიზონტალური დაწყობილი ზოლი** (Q19 — რგოლის
 * ნაცვლად). ⚠️ სეგმენტებს შორის 2px ზედაპირის ღრეჭოა, ლეგენდა კი სახელს,
 * რიცხვსა და პროცენტს ამბობს — ფერი მარტო იდენტობას ვერ ატარებს.
 */
export function StackedShare({ segments, label }: { segments: ShareSegment[]; label?: ReactNode }) {
  const shown = segments.filter((s) => s.value > 0)
  const total = shown.reduce((sum, s) => sum + s.value, 0)

  if (!total) return null

  return (
    <div className="space-y-2">
      {label}
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label={shown.map((s) => `${s.label}: ${s.value}`).join(', ')}>
        {shown.map((s) => (
          <span
            key={s.key}
            className="h-full first:rounded-l-md last:rounded-r-md"
            style={{ width: `${(s.value / total) * 100}%`, background: s.tone }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {shown.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: s.tone }} aria-hidden />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="tabular-nums">{s.value}</span>
            <span className="tabular-nums text-muted-foreground">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface ActorRow {
  id: number
  name: string
  photo: string | null
  count: number
  /** დომენის ზოლი — რომელ სერიაში რამდენი */
  by: { label: string; value: number; index: number }[]
}

/**
 * **ყველაზე ხშირი მსახიობები** (Q20-ის მეორე კითხვა) — ფოტოთი, რაოდენობით
 * და მსახიობის გვერდის ბმულით.
 */
export function ActorGrid({ actors }: { actors: ActorRow[] }) {
  const { t } = useTranslation()

  if (!actors.length) return <p className="text-sm text-muted-foreground">{t('stats.noActors')}</p>

  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {actors.map((actor, i) => {
        const src = storageUrl(actor.photo)

        return (
          <li key={actor.id}>
            <Link
              to={`/actors/${actor.id}`}
              className="group flex h-full flex-col items-center gap-2 rounded-lg border border-border p-3 text-center transition-colors hover:border-primary/50"
            >
              <span className="relative">
                <span className="grid size-16 place-items-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
                  {src ? (
                    <img src={src} alt="" className="size-full object-cover" />
                  ) : (
                    <User className="size-6 text-muted-foreground" />
                  )}
                </span>
                <span className="absolute -left-1 -top-1 grid size-6 place-items-center rounded-md bg-background text-xs font-semibold tabular-nums ring-1 ring-border">
                  {i + 1}
                </span>
              </span>
              <span className="line-clamp-2 text-sm font-medium group-hover:text-primary">{actor.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{t('stats.actorCount', { count: actor.count })}</span>
              {actor.by.length > 1 && (
                <span className="flex h-1.5 w-full gap-px overflow-hidden rounded-md" aria-hidden>
                  {actor.by
                    .filter((b) => b.value > 0)
                    .map((b) => (
                      <span key={b.label} style={{ width: `${(b.value / actor.count) * 100}%`, background: seriesColor(b.index) }} />
                    ))}
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * „წელს 42 · შარშან 35" — ჩანართის თავის ერთი ხაზი (Q20: შედარება მხოლოდ ამდენი).
 *
 * ⚠️ „წელს/შარშან" მხოლოდ მიმდინარე წელზე ითქმის — არჩეულ 2024-ზე ის ტყუილი
 * იქნებოდა, ამიტომ იქ წლები პირდაპირ იწერება.
 */
export function YearLine({ year, thisYear, lastYear }: { year: number; thisYear: number | null; lastYear: number | null }) {
  const { t } = useTranslation()

  if (thisYear == null) return null

  const current = year === new Date().getFullYear()

  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-display text-2xl font-semibold tabular-nums text-foreground">{thisYear}</span>{' '}
      {current ? t('stats.thisYearNow') : t('stats.thisYear', { year })}
      {lastYear != null && (
        <>
          {' · '}
          {current ? t('stats.lastYearNow', { count: lastYear }) : t('stats.lastYear', { count: lastYear, year: year - 1 })}
        </>
      )}
    </p>
  )
}
