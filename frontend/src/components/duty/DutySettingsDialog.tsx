import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, SquarePen, Tags, Trash2 } from 'lucide-react'
import {
  reorderDutyWorkplaces,
  updateDutySettings,
  type DutySettingsData,
  type DutyShiftType,
  type DutyWorkplace,
} from '@/api/duty'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { DUTY_COLORS, formatMoney, invalidateDuty, typeName, workplaceColor } from '@/lib/duty'
import { Button, buttonVariants } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { useToast } from '@/components/ui/feedback'
import { FormField, FormSection } from '@/components/ui/form-layout'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { NumberPick } from '@/components/ui/number-pick'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sortable, SortableItem } from '@/components/ui/sortable'
import { Switch } from '@/components/ui/switch'
import { TimePicker } from '@/components/ui/time-picker'
import { DutyWorkplaceDeleteDialog } from '@/components/duty/DutyWorkplaceDeleteDialog'
import { DutyWorkplaceDialog } from '@/components/duty/DutyWorkplaceDialog'

/* ============================================================
   **მორიგეობის პარამეტრები.**

   პერიოდის პირველი დღე (1–28), ვალუტა, სწრაფი დამატების ნაგულისხმევები და
   **სამსახურები** (ტარიფებით, რიგით, წაშლით). ტიპები კლასიფიკატორია და
   `/dictionaries/duty-types`-ზე იმართება — აქ მხოლოდ ბმულია.

   ⚠️ **პერიოდის დღის შეცვლა მომავალზე მოქმედებს**: თუ მიმდინარე ან წინა
   პერიოდში მორიგეობა უკვე გაქვს, ახალი დღე **მომდევნო პერიოდიდან** იწყება
   (სერვერი წყვეტს; ფანჯარა დაგეგმილ ცვლილებას ცხადად წერს). ჩანაწერების გარეშე
   — მაშინვე.
   ============================================================ */

const NONE = 'none'
const DAY_OPTIONS = [1, 5, 10, 15, 20, 25]
const CURRENCIES = ['₾', '$', '€']

export function DutySettingsDialog({
  settings,
  workplaces,
  types,
  onClose,
}: {
  settings: DutySettingsData
  workplaces: DutyWorkplace[]
  types: DutyShiftType[]
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { date } = useDateFormat()
  const lang = i18n.language

  const [day, setDay] = useState(settings.pending?.day ?? settings.period_start_day)
  const [currency, setCurrency] = useState(settings.currency)
  const [defaultWorkplace, setDefaultWorkplace] = useState(String(settings.default_workplace_id ?? NONE))
  const [defaultType, setDefaultType] = useState(String(settings.default_type_id ?? NONE))
  const [remindAt, setRemindAt] = useState<string | null>(settings.remind_at)
  const [remindTelegram, setRemindTelegram] = useState(settings.remind_telegram)
  const [editing, setEditing] = useState<{ workplace: DutyWorkplace | null } | null>(null)
  const [deleting, setDeleting] = useState<DutyWorkplace | null>(null)

  const save = useMutation({
    mutationFn: () =>
      updateDutySettings({
        period_start_day: day,
        currency: currency.trim() || '₾',
        default_workplace_id: defaultWorkplace === NONE ? null : Number(defaultWorkplace),
        default_type_id: defaultType === NONE ? null : Number(defaultType),
        remind_at: remindAt,
        remind_telegram: remindTelegram,
      }),
    onSuccess: (saved) => {
      invalidateDuty(qc)
      toast({
        title: saved.pending
          ? t('duty.settings.scheduled', { day: saved.pending.day, date: date(saved.pending.since) })
          : t('duty.settings.saved'),
        variant: 'success',
      })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const reorder = useMutation({
    mutationFn: reorderDutyWorkplaces,
    onSuccess: () => invalidateDuty(qc),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const nextColor = DUTY_COLORS[workplaces.length % DUTY_COLORS.length]

  return (
    <ModalShell title={t('duty.settings.title')} onClose={onClose} size="wide">
      <FormSection>
        <FormField size="half" label={t('duty.settings.periodDay')} htmlFor="duty-period-day" hint={t('duty.settings.periodDayHint')}>
          <NumberPick id="duty-period-day" value={day} onChange={setDay} options={DAY_OPTIONS} min={1} max={28} />
          {settings.pending && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('duty.settings.pending', { day: settings.pending.day, date: date(settings.pending.since) })}
            </p>
          )}
        </FormField>

        <FormField size="half" label={t('duty.settings.currency')} htmlFor="duty-currency">
          <div className="flex items-center gap-2">
            {CURRENCIES.map((c) => (
              <Chip key={c} active={currency === c} onClick={() => setCurrency(c)}>
                {c}
              </Chip>
            ))}
            <Input id="duty-currency" className="w-20" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={5} />
          </div>
        </FormField>

        <FormField size="half" label={t('duty.settings.defaultWorkplace')}>
          <Select value={defaultWorkplace} onValueChange={setDefaultWorkplace}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('duty.settings.firstInList')}</SelectItem>
              {workplaces.map((w) => (
                <SelectItem key={w.id} value={String(w.id)}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {/* შეხსენება წინა დღეს (ბრაუზერი; ტელეგრამი — არჩევით) */}
        <FormField size="half" label={t('duty.settings.remind')} htmlFor="duty-remind-at" hint={t('duty.settings.remindHint')}>
          <div className="flex flex-wrap items-center gap-3">
            <TimePicker id="duty-remind-at" value={remindAt} onChange={setRemindAt} clearable />
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={remindTelegram}
                onCheckedChange={setRemindTelegram}
                disabled={!remindAt}
                aria-label={t('duty.settings.remindTelegram')}
              />
              {t('duty.settings.remindTelegram')}
              <InfoHint info={t('duty.settings.remindTelegramHint')} />
            </label>
          </div>
        </FormField>

        <FormField size="half" label={t('duty.settings.defaultType')}>
          <Select value={defaultType} onValueChange={setDefaultType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('duty.settings.firstInList')}</SelectItem>
              {types.map((type) => (
                <SelectItem key={type.id} value={String(type.id)}>
                  {typeName(type, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </FormSection>

      {/* ---------- სამსახურები ---------- */}
      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{t('duty.workplace.title')}</h3>
          <InfoHint info={t('duty.workplace.listHint')} />
          <div className="ml-auto flex gap-2">
            <Link to="/dictionaries/duty-types" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <Tags className="size-4" />
              {t('duty.settings.types')}
            </Link>
            <Button size="sm" onClick={() => setEditing({ workplace: null })}>
              <Plus className="size-4" />
              {t('duty.workplace.add')}
            </Button>
          </div>
        </div>

        <ul className="space-y-2">
          <Sortable ids={workplaces.map((w) => w.id)} onReorder={(ids) => reorder.mutate(ids.map(Number))}>
            {workplaces.map((w) => (
              <SortableItem key={w.id} id={w.id} className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
                <span className="size-4 shrink-0 rounded-sm" style={{ background: workplaceColor(w) }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {w.name}
                    {w.short && <span className="text-muted-foreground"> · {w.short}</span>}
                    {!w.is_active && <span className="text-muted-foreground"> · {t('duty.workplace.inactive')}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      ...w.rates.map((r) => {
                        const type = types.find((x) => x.id === r.type_id)
                        return type ? `${typeName(type, lang)} — ${formatMoney(r.pay, settings.currency, lang)}` : null
                      }),
                      w.hourly_rate != null ? t('duty.workplace.perHour', { pay: formatMoney(w.hourly_rate, settings.currency, lang) }) : null,
                      t('duty.workplace.shifts', { count: w.shifts_count }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Button variant="edit" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setEditing({ workplace: w })}>
                  <SquarePen className="size-3.5" />
                  {t('actions.edit')}
                </Button>
                <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-destructive" onClick={() => setDeleting(w)}>
                  <Trash2 className="size-3.5" />
                  {t('confirm.delete')}
                </Button>
              </SortableItem>
            ))}
          </Sortable>
        </ul>
      </section>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {t('actions.save')}
        </Button>
      </ModalFooter>

      {editing && (
        <DutyWorkplaceDialog
          workplace={editing.workplace}
          types={types}
          nextColor={nextColor}
          currency={settings.currency}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <DutyWorkplaceDeleteDialog
          workplace={deleting}
          others={workplaces.filter((w) => w.id !== deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </ModalShell>
  )
}
