import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createDutyWorkplace,
  updateDutyWorkplace,
  type DutyShiftType,
  type DutyWorkplace,
} from '@/api/duty'
import { errorMessage } from '@/lib/errors'
import { DUTY_COLORS, invalidateDuty, typeName } from '@/lib/duty'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/feedback'
import { FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
import { Switch } from '@/components/ui/switch'

/* ============================================================
   **სამსახური — სახელი, ასო, ფერი, ტარიფები.**

   ⚠️ **ტარიფი ტიპზეა** („24 სთ = 220“) და **საათობრივი — ქასთომ საათებისთვის**
   (ტიპის გარეშე მორიგეობა, ან ტიპი, რომელსაც ამ სამსახურში ტარიფი არ აქვს).
   ცარიელი ველი — ტარიფი არ არის. ⚠️ ცვლილება მხოლოდ ახალ მორიგეობებს ეხება:
   ძველს თანხა ჩანაწერზე აქვს და წარსული ჯამი არ იცვლება.
   ============================================================ */

const FORM_ID = 'duty-workplace-form'

export function DutyWorkplaceDialog({
  workplace,
  types,
  nextColor,
  currency,
  onClose,
}: {
  /** `null` — ახალი სამსახური */
  workplace: DutyWorkplace | null
  types: DutyShiftType[]
  /** ახალს რიგით შემდეგი ფერი ეძლევა — ორი სამსახური ერთი ფერით კალენდარზე არ გაირჩევა */
  nextColor: string
  currency: string
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [name, setName] = useState(workplace?.name ?? '')
  const [short, setShort] = useState(workplace?.short ?? '')
  const [color, setColor] = useState(workplace?.color ?? nextColor)
  const [hourly, setHourly] = useState(workplace?.hourly_rate != null ? String(workplace.hourly_rate) : '')
  const [active, setActive] = useState(workplace?.is_active ?? true)
  const [rates, setRates] = useState<Record<number, string>>(() =>
    Object.fromEntries((workplace?.rates ?? []).map((r) => [r.type_id, String(r.pay)])),
  )

  const save = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        short: short.trim() || null,
        color,
        hourly_rate: hourly.trim() === '' ? null : Number(hourly),
        is_active: active,
        rates: types.map((type) => ({
          type_id: type.id,
          pay: (rates[type.id] ?? '').trim() === '' ? null : Number(rates[type.id]),
        })),
      }

      return workplace ? updateDutyWorkplace(workplace.id, input) : createDutyWorkplace(input)
    },
    onSuccess: () => {
      invalidateDuty(qc)
      toast({ title: t(workplace ? 'duty.workplace.saved' : 'duty.workplace.created'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t(workplace ? 'duty.workplace.edit' : 'duty.workplace.add')} onClose={onClose} hint={t('duty.workplace.hint')}>
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) save.mutate()
        }}
      >
        <FormSection>
          <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
            <FormField label={t('duty.workplace.name')} htmlFor="duty-wp-name" required>
              <Input id="duty-wp-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </FormField>
            <FormField label={t('duty.workplace.short')} htmlFor="duty-wp-short" hint={t('duty.workplace.shortHint')}>
              <Input id="duty-wp-short" value={short} onChange={(e) => setShort(e.target.value)} maxLength={3} />
            </FormField>
          </div>

          <FormField label={t('duty.workplace.color')}>
            <div className="flex flex-wrap gap-2">
              {DUTY_COLORS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={cn('size-8 rounded-md border-2', color === c ? 'border-foreground' : 'border-transparent')}
                  // ⚠️ თემის ცვლადი — მუქ თემაზე იგივე სამსახური თავის საფეხურს იღებს
                  style={{ background: `var(--duty-${i + 1})` }}
                />
              ))}
            </div>
          </FormField>

          <FormField
            label={t('duty.workplace.rates', { currency })}
            hint={t('duty.workplace.ratesHint')}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              {types.map((type) => (
                <label key={type.id} className="flex items-center gap-2 text-sm">
                  <span className="w-16 shrink-0 text-muted-foreground">{typeName(type, i18n.language)}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder="—"
                    value={rates[type.id] ?? ''}
                    onChange={(e) => setRates((all) => ({ ...all, [type.id]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </FormField>

          <FormField label={t('duty.workplace.hourly', { currency })} htmlFor="duty-wp-hourly" hint={t('duty.workplace.hourlyHint')}>
            <Input
              id="duty-wp-hourly"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              className="max-w-40"
              value={hourly}
              onChange={(e) => setHourly(e.target.value)}
            />
          </FormField>

          <FormField>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm font-medium">
              {t('duty.workplace.active')}
              <Switch checked={active} onCheckedChange={setActive} aria-label={t('duty.workplace.active')} />
            </label>
          </FormField>
        </FormSection>
      </form>

      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />
    </ModalShell>
  )
}
