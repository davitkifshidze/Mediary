import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Download, Loader2 } from 'lucide-react'
import { DUTY_KEY, fetchDutyPeriods, type DutySettingsData, type DutyTotals as Totals, type DutyWorkplace } from '@/api/duty'
import { formatHours, formatMoney, periodLabel, workplaceColor } from '@/lib/duty'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

/* ============================================================
   **შემოსავალი — პერიოდი × სამსახური** (`?view=income`).

   „რომელი სამსახურიდან ამ თვეში რამდენი შემომივიდა, რამდენი საათი
   ვიმორიგევე": ბოლო 12 პერიოდი, უახლესი ზემოთ — მორიგეობები · საათები ·
   თანხა (+ გაუქმებული და უთანხო), ბოლოს ჯამი; CSV იგივე ცხრილია.

   ⚠️ **პერიოდი სამსახურისაა**: გაფილტრულ სამსახურზე (`?w`) — მისი
   პერიოდები („5-დან 4-მდე"), „ყველაზე" — კალენდარული თვეები და თითო
   პერიოდში სამსახურების სტრიქონები (`GET /duty/summary/periods`).
   ============================================================ */

const COUNT = 12

export function DutyIncome({
  until,
  workplaceFilter,
  workplaces,
  settings,
}: {
  /** რომელ დღემდე — გვერდის მიმდინარე პერიოდის ბოლო */
  until: string
  workplaceFilter: number | null
  workplaces: DutyWorkplace[]
  settings: DutySettingsData | undefined
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const currency = settings?.currency ?? '₾'

  const periodsQ = useQuery({
    queryKey: [DUTY_KEY, 'income', until, workplaceFilter],
    queryFn: () => fetchDutyPeriods(COUNT, until, workplaceFilter),
  })

  if (periodsQ.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // უახლესი ზემოთ
  const periods = [...(periodsQ.data ?? [])].reverse()
  const workplaceOf = (id: number | null) => workplaces.find((w) => w.id === id) ?? null
  const total = periods.reduce(
    (sum, p) => ({
      shifts: sum.shifts + p.totals.shifts,
      hours: sum.hours + p.totals.hours,
      pay: sum.pay + p.totals.pay,
      unpaid: sum.unpaid + p.totals.unpaid,
      cancelled: sum.cancelled + p.totals.cancelled,
    }),
    { shifts: 0, hours: 0, pay: 0, unpaid: 0, cancelled: 0 },
  )

  if (!total.shifts && !total.cancelled) {
    return <EmptyState title={t('duty.income.empty')} hint={t('duty.income.emptyHint')} />
  }

  const cells = (row: Totals) => (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{row.shifts}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.hours)}</td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(row.pay, currency, lang)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.cancelled || ''}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.unpaid || ''}</td>
    </>
  )

  /** CSV — იგივე ცხრილი: პერიოდი · სამსახური · რიცხვები (ჯერ ძველი) */
  const exportCsv = () => {
    const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
    const head = ['from', 'to', 'workplace', 'shifts', 'hours', 'pay', 'cancelled', 'unpaid']
    const rows = [...periods].reverse().flatMap((p) =>
      (workplaceFilter == null ? p.workplaces : [{ ...p.totals, workplace_id: workplaceFilter }]).map((row) => [
        p.from,
        p.to,
        workplaceOf(row.workplace_id)?.name ?? '',
        row.shifts,
        row.hours,
        row.pay,
        row.cancelled,
        row.unpaid,
      ]),
    )
    const csv = [head, ...rows].map((line) => line.map(quote).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `mediary-duty-income-${periods[periods.length - 1]?.from ?? 'all'}-${periods[0]?.to ?? ''}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="rounded-xl border border-border bg-card" data-testid="duty-income">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <h3 className="font-display text-base font-semibold">
          {t(workplaceFilter == null ? 'duty.income.titleAll' : 'duty.income.titleOne', {
            name: workplaceOf(workplaceFilter)?.name ?? '',
            count: COUNT,
          })}
        </h3>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="size-4" />
          {t('duty.income.csv')}
        </Button>
      </div>

      <div className="fb-scroll overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">{t('duty.income.period')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('duty.totals.shifts')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('duty.totals.hours')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('duty.totals.pay')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('duty.status.cancelled')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('duty.income.unpaid')}</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <Fragment key={p.from}>
                <tr className="border-b border-border" data-testid="duty-income-period">
                  <td className="px-3 py-2 font-medium">{periodLabel(p.from, p.to, lang)}</td>
                  {cells(p.totals)}
                </tr>
                {/* „ყველაზე" — თითო სამსახური პერიოდის ქვეშ */}
                {workplaceFilter == null &&
                  p.workplaces.length > 1 &&
                  p.workplaces.map((row) => {
                    const w = workplaceOf(row.workplace_id)
                    return (
                      <tr key={String(row.workplace_id)} className="border-b border-border text-muted-foreground" data-testid="duty-income-workplace">
                        <td className="py-1.5 pl-7 pr-3">
                          <span className="inline-flex items-center gap-2">
                            <span className="size-2.5 rounded-sm" style={{ background: workplaceColor(w) }} />
                            {w?.name ?? t('duty.noWorkplace')}
                          </span>
                        </td>
                        {cells(row)}
                      </tr>
                    )
                  })}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-semibold" data-testid="duty-income-total">
              <td className="px-3 py-2">{t('duty.income.total', { count: periods.length })}</td>
              {cells(total)}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
