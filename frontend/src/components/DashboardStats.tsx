import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarCheck, ChartColumn, Heart, Library } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType,
} from 'recharts'
import { fetchStatsSummary } from '@/api/stats'
import { CountUp } from '@/components/CountUp'
import { CHART_GRID, CHART_TICK, ChartFrame, ChartTip } from '@/components/ui/chart'

/* ============================================================
   დეშბორდის მთავარი სტატისტიკა (2026-09-19, შენი მითითებით).

   ⚠️ **ეს `/stats`-ს არ ცვლის და არც ბარათებს.** სამი სხვადასხვა კითხვაა:
   ბარათი — „რომელი მოდული და სად შევდივარ", ეს ბლოკი — „სულ რამდენი
   მაქვს და რა გავაკეთე ბოლო დროს", `/stats` — „რა გავაკეთე ზუსტად, რა
   ჭრილში". ამიტომ აქ ოთხი რიცხვია და ერთი გრაფიკი, და არა ჭრილების ასლი.

   ⚠️ **ოთხი რიცხვი ბარათებად და არა დიაგრამად.** „რამდენიმე მთავარი
   რიცხვი" ზუსტად ის შემთხვევაა, როცა გრაფიკი **ზედმეტია** — ერთზოლიანი
   დიაგრამა რიცხვზე ნაკლებს ამბობს.

   ⚠️ **ერთადერთი გრაფიკი დროისაა** (თვეების დინამიკა) — ის ერთადერთი
   ფაქტია, რომელსაც რიცხვი ვერ იტევს: „წელს 140" და „როდის" სხვადასხვა
   პასუხია.

   ⚠️ **ჩაურთველი ან ცარიელი ბიბლიოთეკა ბლოკს მთლიანად მალავს** — ოთხი
   ნული დეშბორდზე ყოველდღიური ხმაურია (იგივე წესი, რაც „მალე"-ს აქვს).
   ============================================================ */

export function DashboardStats() {
  const { t } = useTranslation()

  const { data } = useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: fetchStatsSummary,
    staleTime: 5 * 60_000,
  })

  if (!data || data.totals.records === 0) return null

  const { totals } = data
  const active = data.months.some((m) => m.count > 0)

  const rows = data.months.map((row) => ({
    month: row.month,
    label: t(`stats.monthShort.${row.month}`),
    full: t(`stats.month.${row.month}`),
    value: row.count,
  }))

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <ChartColumn className="size-5 text-muted-foreground" />
          {t('dashboard.stats')}
        </h2>

        <Link to="/stats" className="flex items-center gap-1 text-sm text-primary hover:text-primary/70">
          {t('dashboard.statsMore')}
          <ArrowRight className="size-4" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={<Library className="size-4" />} label={t('dashboard.statRecords')} value={totals.records} />
        <Tile icon={<Heart className="size-4" />} label={t('dashboard.statFavorites')} value={totals.favorites} />
        <Tile
          icon={<CalendarCheck className="size-4" />}
          label={t('dashboard.statDoneYear', { year: data.year })}
          value={totals.done_year}
        />
        <Tile
          icon={<CalendarCheck className="size-4" />}
          label={t('dashboard.statDoneMonth')}
          value={totals.done_month}
        />
      </div>

      {/* ⚠️ ნულოვან წელს გრაფიკი არ იხატება — ბრტყელი ხაზი ღერძით
          „ჯერ არაფერი" კითხვას უფრო ბუნდოვნად პასუხობს, ვიდრე მისი
          არყოფნა; ოთხი რიცხვი მაინც რჩება. */}
      {active && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            {t('stats.byMonth', { year: data.year })}
          </h3>
          <ChartFrame height={150}>
            <AreaChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <defs>
                <linearGradient id="fb-dash-months" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={CHART_GRID} />
              <XAxis dataKey="label" tick={CHART_TICK} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={44} />
              <Tooltip
                cursor={{ stroke: CHART_GRID }}
                content={(props: TooltipContentProps<TooltipValueType, number | string>) => {
                  const entry = props.payload?.[0]

                  if (!props.active || !entry) return null

                  const row = entry.payload as (typeof rows)[number]

                  return <ChartTip rows={[{ label: row.full, value: row.value, tone: 'var(--primary)' }]} />
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#fb-dash-months)"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
              />
            </AreaChart>
          </ChartFrame>
        </div>
      )}
    </section>
  )
}

/**
 * ერთი რიცხვი.
 *
 * ⚠️ **`CountUp` იგივე კომპონენტია, რასაც ბარათები იყენებენ** — ორი
 * სხვადასხვა ანიმაცია ერთ გვერდზე ორ სხვადასხვა აპად იკითხებოდა.
 */
function Tile({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground [&>svg]:size-4">
        {icon}
        {label}
      </span>
      <span className="mt-1 block font-display text-2xl font-semibold leading-none tabular-nums">
        <CountUp value={value} />
      </span>
    </div>
  )
}
