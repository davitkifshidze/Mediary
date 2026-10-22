import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, Loader2 } from 'lucide-react'
import { DUTY_KEY, fetchDutySummary, type DutyRange, type DutySettingsData, type DutyShiftType, type DutyWorkplace } from '@/api/duty'
import { downloadExport } from '@/api/export'
import { errorMessage } from '@/lib/errors'
import { dutyPay, formatHours, formatMoney, typeName, workplaceColor } from '@/lib/duty'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/date-picker'
import { useToast } from '@/components/ui/feedback'
import { FormField } from '@/components/ui/form-layout'
import { NumberPick } from '@/components/ui/number-pick'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   **კალკულატორი** — ნებისმიერი შუალედი და სამსახური(ები) →
   რამდენი მორიგეობა, საათი და თანხა, ჯამურად და სამსახურებით.

   ⚠️ **„რომ ვიმორიგეო კიდევ N“** სიმულაციაა: ბაზას არ ეხება — არჩეული სამსახურის
   ტარიფით ითვლის (`dutyPay()`, სერვერის წესის ასლი) და ახალ ჯამს აჩვენებს.
   ⚠️ CSV — ყველა მორიგეობა (`/export/duty`, „ჩემი მონაცემების“ იგივე ფაილი).
   ============================================================ */

export function DutyCalculator({
  period,
  workplaces,
  types,
  settings,
}: {
  /** საწყისი შუალედი — მიმდინარე პერიოდი */
  period: DutyRange
  workplaces: DutyWorkplace[]
  types: DutyShiftType[]
  settings: DutySettingsData | undefined
}) {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const lang = i18n.language
  const currency = settings?.currency ?? '₾'

  const [range, setRange] = useState<DateRangeValue>({ from: period.from, to: period.to })
  const [chosen, setChosen] = useState<number[]>([])
  const [extra, setExtra] = useState(1)
  const [simWorkplace, setSimWorkplace] = useState(String(workplaces[0]?.id ?? ''))
  const [simType, setSimType] = useState(String(types[types.length - 1]?.id ?? ''))

  const ready = !!range.from && !!range.to

  const summaryQ = useQuery({
    queryKey: [DUTY_KEY, 'calculator', range.from, range.to, chosen],
    queryFn: () => fetchDutySummary({ from: range.from!, to: range.to!, workplaceIds: chosen }),
    enabled: ready,
  })

  const exportCsv = useMutation({
    mutationFn: () => downloadExport('duty', 'csv'),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const toggle = (id: number) => setChosen((all) => (all.includes(id) ? all.filter((x) => x !== id) : [...all, id]))

  const summary = summaryQ.data
  const workplace = workplaces.find((w) => String(w.id) === simWorkplace) ?? null
  const type = types.find((x) => String(x.id) === simType) ?? null
  const unitPay = type ? dutyPay(workplace, type.id, type.hours) : null
  const addPay = unitPay != null ? unitPay * extra : null
  const addHours = type ? type.hours * extra : 0

  return (
    <div className="space-y-5" data-testid="duty-calculator">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_1fr]">
          <FormField label={t('duty.calc.range')} htmlFor="duty-calc-range">
            <DateRangePicker id="duty-calc-range" value={range} onChange={setRange} />
          </FormField>
          <FormField label={t('duty.calc.workplaces')} hint={t('duty.calc.workplacesHint')}>
            <div className="flex flex-wrap gap-2">
              {workplaces.map((w) => (
                <Chip
                  key={w.id}
                  active={chosen.includes(w.id)}
                  onClick={() => toggle(w.id)}
                  icon={<span className="size-2.5 rounded-sm" style={{ background: workplaceColor(w) }} />}
                >
                  {w.name}
                </Chip>
              ))}
            </div>
          </FormField>
        </div>

        {!ready ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('duty.calc.pickRange')}</p>
        ) : summaryQ.isLoading || !summary ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <p className="text-lg" data-testid="duty-calc-total">
              {t('duty.calc.result', {
                count: summary.totals.shifts,
                hours: formatHours(summary.totals.hours),
                pay: formatMoney(summary.totals.pay, currency, lang),
              })}
            </p>
            {summary.totals.unpaid > 0 && <p className="text-xs text-muted-foreground">{t('duty.totals.unpaid', { count: summary.totals.unpaid })}</p>}
            {summary.totals.cancelled > 0 && (
              <p className="text-xs text-muted-foreground">{t('duty.totals.cancelled', { count: summary.totals.cancelled })}</p>
            )}
            {summary.workplaces.length > 1 && (
              <ul className="space-y-1 text-sm">
                {summary.workplaces.map((row) => {
                  const w = workplaces.find((x) => x.id === row.workplace_id) ?? null

                  return (
                    <li key={String(row.workplace_id)} className="flex items-center gap-2">
                      <span className="size-2.5 rounded-[2px]" style={{ background: workplaceColor(w) }} aria-hidden />
                      <span className="flex-1">{w?.name ?? t('duty.noWorkplace')}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {row.shifts} · {t('duty.hoursValue', { hours: formatHours(row.hours) })}
                      </span>
                      <span className="w-28 text-right font-medium tabular-nums">{formatMoney(row.pay, currency, lang)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ---------- სიმულაცია ---------- */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3 font-display text-base font-semibold">{t('duty.calc.whatIf')}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <FormField label={t('duty.calc.more')} htmlFor="duty-calc-more">
            <NumberPick id="duty-calc-more" value={extra} onChange={setExtra} options={[1, 2, 3, 4, 5, 8, 10]} min={1} max={60} />
          </FormField>
          <FormField label={t('fields.name.duty.workplace')}>
            <Select value={simWorkplace} onValueChange={setSimWorkplace}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workplaces.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t('fields.name.duty.type')}>
            <Select value={simType} onValueChange={setSimType}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((x) => (
                  <SelectItem key={x.id} value={String(x.id)}>
                    {typeName(x, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <p className="mt-4 text-sm" data-testid="duty-calc-whatif">
          {addPay == null
            ? t('duty.calc.noRate')
            : t('duty.calc.whatIfResult', {
                hours: formatHours(addHours),
                add: formatMoney(addPay, currency, lang),
                total: formatMoney((summary?.totals.pay ?? 0) + addPay, currency, lang),
              })}
        </p>
      </section>

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => exportCsv.mutate()} disabled={exportCsv.isPending}>
          <Download className="size-4" />
          {t('duty.calc.export')}
        </Button>
      </div>
    </div>
  )
}
