import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus } from 'lucide-react'
import { batchDutyShifts, type DutySettingsData, type DutyShiftType, type DutyWorkplace } from '@/api/duty'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { dutyPay, formatHours, formatMoney, invalidateDuty, typeName, workplaceColor } from '@/lib/duty'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { useToast } from '@/components/ui/feedback'
import { FormField, FormSection } from '@/components/ui/form-layout'
import { Input } from '@/components/ui/input'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   **ერთიანი მონიშვნა → N მორიგეობა (Tasks §34.5).**

   ზემოთ — **სამსახური** და **ნაგულისხმევი ტიპი** ყველა დღეზე („A · 24 სთ“);
   ქვემოთ — მონიშნული დღეები, სადაც თითოეულზე ტიპი ცალკე იცვლება (ან „სხვა“ +
   საათები), თანხა ტარიფიდან ივსება და ჯამი ბოლოში ჩანს. „შენახვა“ — ერთი
   მოთხოვნა, ერთი ტრანზაქცია (`POST /duty/shifts/batch`): ნახევრად შენახული
   პარტია არ არსებობს.

   ⚠️ **„ნაგულისხმევი“ ნიშნავს „სადაც ცალკე არ აგირჩევია“**: დღის ტიპი, რომელიც
   ხელით შეცვალე, ზედა არჩევანის შეცვლაზე ადგილზე რჩება.
   ============================================================ */

const CUSTOM = 'custom'
const INHERIT = 'inherit'

interface Row {
  day: string
  /** `inherit` — ზედა ნაგულისხმევი; `custom` — ქასთომ საათები; სხვა — ტიპის id */
  type: string
  hours: string
  /** ხელით ჩაწერილი თანხა; ცარიელი — ტარიფიდან */
  pay: string
}

export function DutyBatchDialog({
  days,
  workplaces,
  types,
  settings,
  onClose,
  onDone,
}: {
  days: string[]
  workplaces: DutyWorkplace[]
  types: DutyShiftType[]
  settings: DutySettingsData | undefined
  onClose: () => void
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { date } = useDateFormat()
  const lang = i18n.language
  const currency = settings?.currency ?? '₾'

  const active = workplaces.filter((w) => w.is_active)
  const [workplaceId, setWorkplaceId] = useState<number | null>(settings?.default_workplace_id ?? active[0]?.id ?? null)
  const [defaultType, setDefaultType] = useState<string>(String(settings?.default_type_id ?? types[0]?.id ?? CUSTOM))
  const [defaultHours, setDefaultHours] = useState('12')
  const [rows, setRows] = useState<Row[]>(() => [...days].sort().map((day) => ({ day, type: INHERIT, hours: '', pay: '' })))

  const workplace = workplaces.find((w) => w.id === workplaceId) ?? null

  /** დღის საბოლოო ტიპი, საათები და თანხა — ეკრანზეც და გაგზავნისასაც ერთი წესით */
  const resolved = useMemo(
    () =>
      rows.map((row) => {
        const type = row.type === INHERIT ? defaultType : row.type
        const typeId = type === CUSTOM ? null : Number(type)
        const hoursText = row.type === INHERIT && type === CUSTOM ? defaultHours : row.hours
        const hours = typeId != null ? (types.find((x) => x.id === typeId)?.hours ?? 0) : Number(hoursText)
        const pay = row.pay.trim() !== '' ? Number(row.pay) : dutyPay(workplace, typeId, hours)

        return { day: row.day, typeId, hours, pay, custom: typeId == null }
      }),
    [rows, defaultType, defaultHours, types, workplace],
  )

  const valid = resolved.every((r) => r.hours > 0 && r.hours <= 72)
  const total = resolved.reduce(
    (sum, r) => ({ hours: sum.hours + (r.hours || 0), pay: sum.pay + (r.pay ?? 0) }),
    { hours: 0, pay: 0 },
  )

  const update = (index: number, patch: Partial<Row>) => setRows((all) => all.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const save = useMutation({
    mutationFn: () =>
      batchDutyShifts({
        workplace_id: workplaceId,
        type_id: defaultType === CUSTOM ? null : Number(defaultType),
        items: resolved.map((r) => ({
          date: r.day,
          type_id: r.typeId,
          ...(r.custom ? { hours: r.hours } : {}),
          pay: r.pay,
        })),
      }),
    onSuccess: (created) => {
      invalidateDuty(qc)
      toast({ title: t('duty.batch.done', { count: created.length }), variant: 'success' })
      onDone()
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const typeOptions = (
    <>
      {types.map((type) => (
        <SelectItem key={type.id} value={String(type.id)}>
          {typeName(type, lang)}
        </SelectItem>
      ))}
      <SelectItem value={CUSTOM}>{t('duty.shift.custom')}</SelectItem>
    </>
  )

  return (
    <ModalShell title={t('duty.batch.title', { count: rows.length })} onClose={onClose} size="wide" hint={t('duty.batch.hint')}>
      <FormSection>
        <FormField label={t('fields.name.duty.workplace')}>
          <div className="flex flex-wrap gap-2">
            {active.map((w) => (
              <Chip
                key={w.id}
                active={workplaceId === w.id}
                onClick={() => setWorkplaceId(w.id)}
                icon={<span className="size-2.5 rounded-sm" style={{ background: workplaceColor(w) }} />}
              >
                {w.name}
              </Chip>
            ))}
          </div>
        </FormField>

        <FormField label={t('duty.batch.defaultType')}>
          <div className="flex flex-wrap items-center gap-2">
            {types.map((type) => (
              <Chip key={type.id} active={defaultType === String(type.id)} onClick={() => setDefaultType(String(type.id))}>
                {typeName(type, lang)}
              </Chip>
            ))}
            <Chip active={defaultType === CUSTOM} onClick={() => setDefaultType(CUSTOM)}>
              {t('duty.shift.custom')}
            </Chip>
            {defaultType === CUSTOM && (
              <Input
                aria-label={t('fields.name.duty.hours')}
                type="number"
                min={0.5}
                max={72}
                step="0.5"
                className="w-24"
                value={defaultHours}
                onChange={(e) => setDefaultHours(e.target.value)}
              />
            )}
          </div>
        </FormField>
      </FormSection>

      <ul className="mt-4 divide-y divide-border rounded-md border border-border" data-testid="duty-batch-rows">
        {rows.map((row, index) => {
          const r = resolved[index]

          return (
            <li key={row.day} className="flex flex-wrap items-center gap-2 p-2.5">
              <span className="w-36 shrink-0 text-sm font-medium">{date(row.day)}</span>
              <Select value={row.type} onValueChange={(type) => update(index, { type, hours: type === CUSTOM ? row.hours || '12' : row.hours })}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={INHERIT}>{t('duty.batch.inherit')}</SelectItem>
                  {typeOptions}
                </SelectContent>
              </Select>
              {row.type === CUSTOM && (
                <Input
                  aria-label={t('fields.name.duty.hours')}
                  type="number"
                  min={0.5}
                  max={72}
                  step="0.5"
                  className="w-20"
                  value={row.hours}
                  onChange={(e) => update(index, { hours: e.target.value })}
                />
              )}
              <span className="text-xs text-muted-foreground">{t('duty.hoursValue', { hours: formatHours(r.hours || 0) })}</span>
              <Input
                aria-label={t('fields.name.duty.pay')}
                type="number"
                min={0}
                step="0.01"
                className="ml-auto w-28"
                placeholder={r.pay != null && row.pay === '' ? String(r.pay) : '—'}
                value={row.pay}
                onChange={(e) => update(index, { pay: e.target.value })}
              />
            </li>
          )
        })}
      </ul>

      <p className="mt-3 text-right text-sm" data-testid="duty-batch-total">
        {t('duty.batch.total', {
          count: rows.length,
          hours: formatHours(total.hours),
          pay: formatMoney(total.pay, currency, lang),
        })}
      </p>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button onClick={() => save.mutate()} disabled={!valid || save.isPending || rows.length === 0}>
          <CalendarPlus className="size-4" />
          {t('duty.batch.save', { count: rows.length })}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
