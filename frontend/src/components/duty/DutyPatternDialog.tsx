import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import {
  createDutyPattern,
  deleteDutyPattern,
  updateDutyPattern,
  type DutyPattern,
  type DutyPatternInput,
  type DutyShiftType,
  type DutyWorkplace,
} from '@/api/duty'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { invalidateDuty, patternDates, todayIso, typeName } from '@/lib/duty'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { DatePicker } from '@/components/ui/date-picker'
import { useToast } from '@/components/ui/feedback'
import { FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { ModalShell } from '@/components/ui/modal-shell'
import { NumberPick } from '@/components/ui/number-pick'
import { Switch } from '@/components/ui/switch'
import { TimePicker } from '@/components/ui/time-picker'

/* ============================================================
   **სამსახურის რიტმი — „ყოველ მე-4 დღეს".**

   ტიპი (ან სხვა საათები) · ყოველ რამდენ დღეში · პირველი დღე · დაწყება.
   რიტმი კალენდარზე თვითონ არაფერს ხატავს — „რიტმის გაგრძელება" (პერიოდის
   ზოლში) მისგან ნამდვილ მორიგეობებს ქმნის; ქვემოთ შემდეგი დღეები ჩანს.

   ⚠️ **`preset`** — „რიტმი მონიშნულიდან": ინტერვალი, პირველი დღე, ტიპი და
   დაწყება მონიშნული მორიგეობებიდან მოდის, და ისინი რიტმს მიეკუთვნება
   (`adopt_ids`), ე.ი. გაგრძელება ბოლო მათგანის შემდეგ იწყება.
   ============================================================ */

const FORM_ID = 'duty-pattern-form'

const CUSTOM = 'custom'

/** „ყოველ N დღეში" — სწრაფი არჩევანი; დანარჩენი `NumberPick`-ის „სხვაში“ */
const INTERVALS = [1, 2, 3, 4, 5, 6, 7]

const HOUR_OPTIONS = [4, 5, 6, 7, 8, 10, 12, 16, 18, 24]

export function DutyPatternDialog({
  workplace,
  pattern,
  types,
  preset,
  onClose,
}: {
  workplace: DutyWorkplace
  /** `null` — ახალი რიტმი */
  pattern: DutyPattern | null
  types: DutyShiftType[]
  preset?: Partial<Pick<DutyPattern, 'interval_days' | 'anchor_date' | 'type_id' | 'hours' | 'start_time'>> & { adopt_ids?: number[] }
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { date } = useDateFormat()

  const initialType = preset?.type_id !== undefined ? preset.type_id : (pattern?.type_id ?? workplace.default_type_id ?? types[0]?.id ?? null)
  const [typeKey, setTypeKey] = useState(initialType != null && types.some((x) => x.id === initialType) ? String(initialType) : CUSTOM)
  const [hours, setHours] = useState(preset?.hours ?? pattern?.hours ?? types.find((x) => x.id === initialType)?.hours ?? 24)
  const [intervalDays, setIntervalDays] = useState(preset?.interval_days ?? pattern?.interval_days ?? 4)
  const [anchor, setAnchor] = useState(preset?.anchor_date ?? pattern?.anchor_date ?? todayIso())
  const [startTime, setStartTime] = useState<string | null>(
    preset?.start_time !== undefined ? preset.start_time : (pattern?.start_time ?? workplace.default_start_time ?? null),
  )
  const [active, setActive] = useState(pattern?.is_active ?? true)

  const typeId = typeKey === CUSTOM ? null : Number(typeKey)

  const pickType = (key: string) => {
    setTypeKey(key)
    const type = types.find((x) => String(x.id) === key)
    if (type) setHours(type.hours)
  }

  // შემდეგი ოთხი დღე — დღეიდან ან პირველი დღიდან (რომელიც გვიანაა)
  const upcoming = intervalDays > 0 && anchor ? patternDates(anchor, intervalDays, anchor > todayIso() ? anchor : todayIso(), 4) : []

  const save = useMutation({
    mutationFn: () => {
      const input: DutyPatternInput = {
        workplace_id: workplace.id,
        type_id: typeId,
        hours,
        interval_days: intervalDays,
        anchor_date: anchor,
        start_time: startTime,
        is_active: active,
        ...(preset?.adopt_ids?.length ? { adopt_ids: preset.adopt_ids } : {}),
      }

      return pattern ? updateDutyPattern(pattern.id, input) : createDutyPattern(input)
    },
    onSuccess: () => {
      invalidateDuty(qc)
      toast({ title: t('duty.pattern.saved'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const remove = useMutation({
    mutationFn: () => deleteDutyPattern(pattern!.id),
    onSuccess: () => {
      invalidateDuty(qc)
      toast({ title: t('duty.pattern.removed'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t('duty.pattern.titleFor', { name: workplace.name })} onClose={onClose} hint={t('duty.pattern.hint')}>
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          if (anchor && intervalDays > 0 && hours > 0) save.mutate()
        }}
      >
        <FormSection>
          <FormField label={t('fields.name.duty.type')}>
            <div className="flex flex-wrap gap-2">
              {types.map((type) => (
                <Chip key={type.id} active={typeKey === String(type.id)} onClick={() => pickType(String(type.id))}>
                  {typeName(type, i18n.language)}
                </Chip>
              ))}
              <Chip active={typeKey === CUSTOM} onClick={() => setTypeKey(CUSTOM)}>
                {t('duty.shift.custom')}
              </Chip>
            </div>
          </FormField>

          <FormField size="half" show={typeKey === CUSTOM} label={t('fields.name.duty.hours')} htmlFor="duty-pattern-hours">
            <NumberPick
              id="duty-pattern-hours"
              value={hours}
              onChange={setHours}
              options={HOUR_OPTIONS.includes(hours) ? HOUR_OPTIONS : [...HOUR_OPTIONS, hours].sort((a, b) => a - b)}
              min={0.5}
              max={72}
            />
          </FormField>

          <FormField size="half" label={t('duty.pattern.interval')} htmlFor="duty-pattern-interval" required>
            <NumberPick
              id="duty-pattern-interval"
              value={intervalDays}
              onChange={setIntervalDays}
              options={INTERVALS.includes(intervalDays) ? INTERVALS : [...INTERVALS, intervalDays].sort((a, b) => a - b)}
              min={1}
              max={60}
            />
          </FormField>
          <FormField size="half" label={t('duty.pattern.anchor')} htmlFor="duty-pattern-anchor" required>
            <DatePicker id="duty-pattern-anchor" value={anchor || null} onChange={(v) => setAnchor(v ?? '')} />
          </FormField>
          <FormField size="half" label={t('fields.name.duty.start_time')} htmlFor="duty-pattern-start">
            <TimePicker id="duty-pattern-start" value={startTime} onChange={setStartTime} clearable />
          </FormField>

          {upcoming.length > 0 && (
            <FormField>
              <p className="text-sm text-muted-foreground" data-testid="duty-pattern-preview">
                {t('duty.pattern.preview', { dates: upcoming.map((d) => date(d)).join(' · ') })}
              </p>
            </FormField>
          )}

          {pattern && (
            <FormField>
              <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm font-medium">
                {t('duty.pattern.active')}
                <Switch checked={active} onCheckedChange={setActive} aria-label={t('duty.pattern.active')} />
              </label>
            </FormField>
          )}
        </FormSection>
      </form>

      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending}>
        {pattern && (
          <Button type="button" variant="destructiveOutline" onClick={() => remove.mutate()} disabled={remove.isPending}>
            <Trash2 className="size-4" />
            {t('confirm.delete')}
          </Button>
        )}
      </FormFooter>
    </ModalShell>
  )
}
