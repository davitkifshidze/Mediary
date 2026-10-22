import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis, type TooltipContentProps, type TooltipValueType } from 'recharts'
import { Loader2 } from 'lucide-react'
import {
  DUTY_KEY,
  fetchDutyPeriods,
  fetchDutySummary,
  type DutyRange,
  type DutySettingsData,
  type DutyShiftType,
  type DutyTotals as Totals,
  type DutyWorkplace,
} from '@/api/duty'
import { formatHours, formatMoney, parseDay, typeName, workplaceColor } from '@/lib/duty'
import { BAR_RADIUS_Y, CHART_GRID, CHART_TICK, ChartFrame, ChartTip } from '@/components/ui/chart'
import { CutTabs } from '@/components/ui/cut-tabs'
import { InfoHint } from '@/components/ui/info-hint'

/* ============================================================
   **ჯამები** — პერიოდის მორიგეობები · საათები · თანხა, **ყველაზე და
   თითო სამსახურზე**, ტიპების მიხედვით დაშლა, წინა პერიოდთან შედარება და გრაფიკი
   პერიოდებით, სამსახურების ფერებით.

   ⚠️ **ფორმები ამოცანით** (dataviz): სამი სათაური რიცხვია (ტაილები, გრაფიკი არა);
   სამსახურები — ცხრილი წილის თხელი ზოლით (ცხრილი ერთდროულად გრაფიკის „ცხრილის
   ხედიცაა“); დროში ცვლილება — დაწყობილი სვეტები, **ერთი ღერძით** (თანხა ·
   საათები · რაოდენობა — ფილტრით ზემოთ და არა ორი ღერძით). ფერი სამსახურისაა
   (იდენტობა) და ფილტრი მას არ ცვლის; ტექსტი ტექსტის ფერითაა.

   ⚠️ **თანხის გარეშე მორიგეობა ჯამში არ ითვლება** — ცალკე წერია (`unpaid`), რომ
   „1 200 ₾“ სრულ ჯამად არ წაიკითხებოდეს.
   ============================================================ */

type Metric = 'pay' | 'hours' | 'shifts'

type Tip = TooltipContentProps<TooltipValueType, number | string>

export function DutyTotals({
  period,
  workplaceFilter,
  workplaces,
  types,
  settings,
}: {
  period: DutyRange
  workplaceFilter: number | null
  workplaces: DutyWorkplace[]
  types: DutyShiftType[]
  settings: DutySettingsData | undefined
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const currency = settings?.currency ?? '₾'
  const [metric, setMetric] = useState<Metric>('pay')

  const filter = workplaceFilter != null ? [workplaceFilter] : undefined

  const summaryQ = useQuery({
    queryKey: [DUTY_KEY, 'summary', period.from, period.to, workplaceFilter],
    queryFn: () => fetchDutySummary({ from: period.from, to: period.to, workplaceIds: filter }),
  })
  const periodsQ = useQuery({
    queryKey: [DUTY_KEY, 'periods', period.to],
    queryFn: () => fetchDutyPeriods(12, period.to),
  })

  const summary = summaryQ.data
  const value = (totals: Totals, m: Metric) => (m === 'pay' ? totals.pay : m === 'hours' ? totals.hours : totals.shifts)
  const show = (n: number, m: Metric) =>
    m === 'pay' ? formatMoney(n, currency, lang) : m === 'hours' ? t('duty.hoursValue', { hours: formatHours(n) }) : String(n)

  const workplaceOf = (id: number | null) => workplaces.find((w) => w.id === id) ?? null

  /* გრაფიკის რიგები — პერიოდი × სამსახური; ფილტრი სამსახურს ჭრის, ფერს კი არ ცვლის */
  const chart = useMemo(() => {
    const periods = periodsQ.data ?? []
    const shown = workplaces.filter((w) => workplaceFilter == null || w.id === workplaceFilter)
    const short = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' })

    return {
      series: shown,
      rows: periods.map((p) => ({
        key: p.from,
        label: short.format(parseDay(p.from)),
        full: `${short.format(parseDay(p.from))} – ${short.format(parseDay(p.to))}`,
        ...Object.fromEntries(
          shown.map((w) => {
            const row = p.workplaces.find((x) => x.workplace_id === w.id)
            return [`w${w.id}`, row ? value(row, metric) : 0]
          }),
        ),
      })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `value` სუფთა ფუნქციაა
  }, [periodsQ.data, workplaces, workplaceFilter, metric, lang])

  if (summaryQ.isLoading || !summary) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const previous = summary.previous
  const delta = (m: Metric) => {
    if (!previous) return null
    const diff = value(summary.totals, m) - value(previous, m)
    if (diff === 0) return t('duty.totals.same')
    const text = show(Math.abs(diff), m)
    return t(diff > 0 ? 'duty.totals.more' : 'duty.totals.less', { value: text })
  }

  const tiles: { key: Metric; label: string }[] = [
    { key: 'shifts', label: t('duty.totals.shifts') },
    { key: 'hours', label: t('duty.totals.hours') },
    { key: 'pay', label: t('duty.totals.pay') },
  ]

  const maxPay = Math.max(1, ...summary.workplaces.map((w) => value(w, metric)))

  return (
    <div className="space-y-5" data-testid="duty-totals">
      {/* ---------- სათაური რიცხვები ---------- */}
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.key} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{show(value(summary.totals, tile.key), tile.key)}</p>
            {delta(tile.key) && <p className="mt-1 text-xs text-muted-foreground">{delta(tile.key)}</p>}
          </div>
        ))}
      </div>

      {(summary.totals.unpaid > 0 || summary.totals.cancelled > 0) && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground" data-testid="duty-totals-aside">
          {summary.totals.unpaid > 0 && (
            <span className="inline-flex items-center gap-1.5">
              {t('duty.totals.unpaid', { count: summary.totals.unpaid })}
              <InfoHint info={t('duty.totals.unpaidHint')} />
            </span>
          )}
          {/* გაუქმებული ჯამში არ შედის — ცალკე რიცხვია */}
          {summary.totals.cancelled > 0 && (
            <span className="inline-flex items-center gap-1.5">
              {t('duty.totals.cancelled', { count: summary.totals.cancelled })}
              <InfoHint info={t('duty.totals.cancelledHint')} />
            </span>
          )}
        </p>
      )}

      {/* ---------- სამსახურებით ---------- */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold">{t('duty.totals.byWorkplace')}</h3>
          <CutTabs
            layout="inline"
            options={[
              { key: 'pay', label: t('duty.totals.pay') },
              { key: 'hours', label: t('duty.totals.hours') },
              { key: 'shifts', label: t('duty.totals.shifts') },
            ]}
            value={metric}
            onChange={(key) => setMetric(key as Metric)}
          />
        </div>

        {summary.workplaces.length ? (
          <ul className="space-y-3" data-testid="duty-totals-workplaces">
            {summary.workplaces.map((row) => {
              const w = workplaceOf(row.workplace_id)

              return (
                <li key={String(row.workplace_id)}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: workplaceColor(w) }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{w?.name ?? t('duty.noWorkplace')}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {[`${row.shifts} × `, t('duty.hoursValue', { hours: formatHours(row.hours) })].join('')}
                    </span>
                    <span className="w-28 text-right font-medium tabular-nums">{formatMoney(row.pay, currency, lang)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-muted">
                    <div
                      className="h-full rounded-sm"
                      style={{ width: `${(value(row, metric) / maxPay) * 100}%`, background: workplaceColor(w) }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('duty.empty')}</p>
        )}
      </section>

      {/* ---------- ტიპებით ---------- */}
      {summary.types.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 font-display text-base font-semibold">{t('duty.totals.byType')}</h3>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {summary.types.map((row) => {
                const type = types.find((x) => x.id === row.type_id)

                return (
                  <tr key={String(row.type_id)}>
                    <td className="py-2">{type ? typeName(type, lang) : t('duty.shift.custom')}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{row.shifts}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{t('duty.hoursValue', { hours: formatHours(row.hours) })}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{formatMoney(row.pay, currency, lang)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* ---------- პერიოდებით ---------- */}
      {chart.rows.length > 1 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold">{t('duty.totals.byPeriod', { metric: tiles.find((x) => x.key === metric)?.label })}</h3>
            {chart.series.length > 1 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {chart.series.map((w) => (
                  <li key={w.id} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-[2px]" style={{ background: workplaceColor(w) }} aria-hidden />
                    {w.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ChartFrame height={240}>
            <BarChart data={chart.rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART_GRID} />
              <XAxis dataKey="label" tick={CHART_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} allowDecimals={metric !== 'shifts'} width={56} />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                content={(props: Tip) => {
                  const entry = props.payload?.[0]
                  if (!props.active || !entry) return null
                  const row = entry.payload as Record<string, number | string>

                  return (
                    <ChartTip
                      title={String(row.full ?? row.label)}
                      rows={chart.series
                        .map((w) => ({ label: w.name, value: Number(row[`w${w.id}`] ?? 0), tone: workplaceColor(w) }))
                        .filter((r) => r.value > 0)}
                    />
                  )
                }}
              />
              {chart.series.map((w, i) => (
                <Bar
                  key={w.id}
                  dataKey={`w${w.id}`}
                  name={w.name}
                  stackId="stack"
                  fill={workplaceColor(w)}
                  // ⚠️ 2px ზედაპირის ღრეჭო სეგმენტებს შორის; მომრგვალება მხოლოდ ზედა სერიას
                  stroke="var(--card)"
                  strokeWidth={2}
                  maxBarSize={36}
                  radius={i === chart.series.length - 1 ? BAR_RADIUS_Y : 0}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ChartFrame>
        </section>
      )}
    </div>
  )
}
