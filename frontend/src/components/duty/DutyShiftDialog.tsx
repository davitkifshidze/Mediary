import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import {
  createDutyShift,
  deleteDutyShift,
  updateDutyShift,
  type DutySettingsData,
  type DutyShift,
  type DutyShiftType,
  type DutyWorkplace,
} from '@/api/duty'
import { errorMessage } from '@/lib/errors'
import { dutyPay, formatHours, invalidateDuty, shiftEnd, timeRange, typeName, workplaceColor } from '@/lib/duty'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { DatePicker } from '@/components/ui/date-picker'
import { useToast } from '@/components/ui/feedback'
import { FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
import { NumberPick } from '@/components/ui/number-pick'
import { Textarea } from '@/components/ui/textarea'
import { TimePicker } from '@/components/ui/time-picker'

/* ============================================================
   **ერთი მორიგეობა — სწრაფი დამატება/რედაქტირება.**

   სამსახური ჩიპებით (ფერით), ტიპი ჩიპებით ან „სხვა“ + საათები, თანხა წინასწარ
   შევსებული ტარიფიდან (`dutyPay()` — სერვერის `DutyPay`-ის ასლი), შენიშვნა.

   ⚠️ **სამსახურის ნაგულისხმევები** (`default_type_id`, `default_start_time`):
   ახალ მორიგეობაზე და სამსახურის არჩევისას ტიპი და დაწყება თვითონ ივსება
   („112“ → 24 სთ · 09:00); ცარიელი ნაგულისხმევი არაფერს ცვლის. დაწყების
   ქვეშ დასრულება ჩანს — „09:00 → 09:00 (+1)“ (`shiftEnd()`).

   ⚠️ **თანხა ცხადად იგზავნება** — რაც ველში წერია, ის ინახება (ცარიელი = უცნობი
   თანხა). ⚠️ სანამ თანხას ხელით არ შეეხები, სამსახურის/ტიპის/საათების შეცვლა მას
   ხელახლა ითვლის; შეხების შემდეგ — აღარ (შენს ციფრს ფორმა არ გადაწერს).
   ============================================================ */

const CUSTOM = 'custom'

/** „სხვა“ საათების სწრაფი არჩევანი — დანარჩენი `NumberPick`-ის „სხვაში“ */
const HOUR_OPTIONS = [4, 5, 6, 7, 8, 10, 12, 16, 18, 24]

const FORM_ID = 'duty-shift-form'

export function DutyShiftDialog({
  shift,
  date,
  workplaces,
  types,
  settings,
  onClose,
}: {
  /** `null` — ახალი მორიგეობა `date`-ზე */
  shift: DutyShift | null
  date?: string
  workplaces: DutyWorkplace[]
  types: DutyShiftType[]
  settings: DutySettingsData | undefined
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const currency = settings?.currency ?? '₾'

  const active = workplaces.filter((w) => w.is_active || w.id === shift?.workplace_id)
  const firstWorkplace = settings?.default_workplace_id ?? active[0]?.id ?? null
  const startWorkplace = workplaces.find((w) => w.id === firstWorkplace)
  // სამსახურის ნაგულისხმევი ტიპი (თუ ჯერ არსებობს) → მოდულისა → პირველი
  const ownType = (w: DutyWorkplace | undefined) =>
    w?.default_type_id != null && types.some((x) => x.id === w.default_type_id) ? w.default_type_id : null
  const firstType = ownType(startWorkplace) ?? settings?.default_type_id ?? types[0]?.id ?? null

  const [workplaceId, setWorkplaceId] = useState<number | null>(shift ? shift.workplace_id : firstWorkplace)
  const [typeKey, setTypeKey] = useState<string>(
    shift ? (shift.type_id ? String(shift.type_id) : CUSTOM) : firstType ? String(firstType) : CUSTOM,
  )
  const [hours, setHours] = useState<number>(shift ? shift.hours : (types.find((x) => x.id === firstType)?.hours ?? 12))
  const [day, setDay] = useState<string>(shift?.date ?? date ?? '')
  const [startTime, setStartTime] = useState<string | null>(shift ? shift.start_time : (startWorkplace?.default_start_time ?? null))
  const [note, setNote] = useState(shift?.note ?? '')
  const [pay, setPay] = useState<string>(shift?.pay != null ? String(shift.pay) : '')
  const [payTouched, setPayTouched] = useState(!!shift)

  const typeId = typeKey === CUSTOM ? null : Number(typeKey)
  const workplace = workplaces.find((w) => w.id === workplaceId) ?? null

  // თანხა ტარიფიდან — სანამ ხელით არ შეცვლი
  const suggested = useMemo(() => dutyPay(workplace, typeId, hours), [workplace, typeId, hours])
  const payValue = payTouched ? pay : suggested != null ? String(suggested) : ''

  const pickType = (key: string) => {
    setTypeKey(key)
    const type = types.find((x) => String(x.id) === key)
    if (type) setHours(type.hours)
  }

  /** სამსახური + მისი ნაგულისხმევები (ცარიელი არაფერს ცვლის) */
  const pickWorkplace = (w: DutyWorkplace) => {
    setWorkplaceId(w.id)
    const own = ownType(w)
    if (own != null) pickType(String(own))
    if (w.default_start_time) setStartTime(w.default_start_time)
  }

  const range = timeRange(startTime, shiftEnd(startTime, hours))

  const save = useMutation({
    mutationFn: () => {
      const input = {
        date: day,
        workplace_id: workplaceId,
        type_id: typeId,
        hours,
        start_time: startTime,
        note: note.trim() || null,
        pay: payValue.trim() === '' ? null : Number(payValue),
      }

      return shift ? updateDutyShift(shift.id, input) : createDutyShift(input)
    },
    onSuccess: () => {
      invalidateDuty(qc)
      toast({ title: t(shift ? 'duty.shift.saved' : 'duty.shift.created'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const remove = useMutation({
    mutationFn: () => deleteDutyShift(shift!.id),
    onSuccess: () => {
      invalidateDuty(qc)
      toast({ title: t('duty.shift.trashed'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const lang = i18n.language

  return (
    <ModalShell title={t(shift ? 'duty.shift.edit' : 'duty.shift.add')} onClose={onClose}>
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          if (day && hours > 0) save.mutate()
        }}
      >
        <FormSection>
          <FormField label={t('fields.name.duty.date')} htmlFor="duty-date" required>
            <DatePicker id="duty-date" value={day || null} onChange={(v) => setDay(v ?? '')} />
          </FormField>

          <FormField label={t('fields.name.duty.workplace')}>
            <div className="flex flex-wrap gap-2">
              {active.map((w) => (
                <Chip
                  key={w.id}
                  active={workplaceId === w.id}
                  onClick={() => pickWorkplace(w)}
                  icon={<span className="size-2.5 rounded-sm" style={{ background: workplaceColor(w) }} />}
                >
                  {w.name}
                </Chip>
              ))}
            </div>
          </FormField>

          <FormField label={t('fields.name.duty.type')}>
            <div className="flex flex-wrap gap-2">
              {types.map((type) => (
                <Chip key={type.id} active={typeKey === String(type.id)} onClick={() => pickType(String(type.id))}>
                  {typeName(type, lang)}
                </Chip>
              ))}
              <Chip active={typeKey === CUSTOM} onClick={() => setTypeKey(CUSTOM)}>
                {t('duty.shift.custom')}
              </Chip>
            </div>
          </FormField>

          <FormField size="half" label={t('fields.name.duty.hours')} htmlFor="duty-hours" required>
            <NumberPick
              id="duty-hours"
              value={hours}
              onChange={(v) => setHours(v)}
              options={HOUR_OPTIONS.includes(hours) ? HOUR_OPTIONS : [...HOUR_OPTIONS, hours].sort((a, b) => a - b)}
              min={0.5}
              max={72}
            />
          </FormField>
          <FormField size="half" label={t('fields.name.duty.start_time')} htmlFor="duty-start">
            <TimePicker id="duty-start" value={startTime} onChange={setStartTime} clearable />
            {range && (
              <p className="mt-1 text-xs tabular-nums text-muted-foreground" data-testid="duty-shift-range">
                {range}
              </p>
            )}
          </FormField>

          <FormField
            label={`${t('fields.name.duty.pay')} (${currency})`}
            htmlFor="duty-pay"
            hint={
              !payTouched && suggested == null
                ? t('duty.shift.noRate')
                : t('duty.shift.payHint', { hours: formatHours(hours) })
            }
          >
            <Input
              id="duty-pay"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={payValue}
              onChange={(e) => {
                setPayTouched(true)
                setPay(e.target.value)
              }}
            />
          </FormField>

          <FormField label={t('fields.name.duty.note')} htmlFor="duty-note">
            <Textarea id="duty-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </FormField>
        </FormSection>
      </form>

      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending}>
        {shift && (
          <Button type="button" variant="destructiveOutline" onClick={() => remove.mutate()} disabled={remove.isPending}>
            <Trash2 className="size-4" />
            {t('confirm.delete')}
          </Button>
        )}
      </FormFooter>
    </ModalShell>
  )
}
