import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import type { DutySettingsData, DutyShift } from '@/api/duty'
import { useDateFormat } from '@/lib/dates'
import { formatHours, sumMoney, sumShifts } from '@/lib/duty'
import { Button } from '@/components/ui/button'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import type { MenuAction } from '@/components/ui/record-menu'
import { DutyDayShifts } from '@/components/duty/DutyBits'

/* ============================================================
   **ერთი დღე ფანჯარაში** — ამ დღის მორიგეობები (ორი სამსახური ან ორი
   მორიგეობაც შეიძლება) და „დამატება“. იგივე სიაა, რაც ფართო ეკრანზე კალენდრის
   გვერდით პანელში დგას; ფანჯარა იქ იხსნება, სადაც პანელი კალენდრის გვერდით
   ვერ ეტევა. ⚠️ ცარიელ დღეზე ეს ფანჯარა არ იხსნება — გვერდი პირდაპირ დამატების
   ფორმას აჩვენებს.
   ============================================================ */

export function DutyDayDialog({
  day,
  shifts,
  settings,
  shiftActions,
  dimmed,
  onEdit,
  onAdd,
  onClose,
}: {
  day: string
  shifts: DutyShift[]
  settings: DutySettingsData | undefined
  shiftActions?: (shift: DutyShift) => MenuAction[]
  dimmed?: ReadonlySet<number>
  onEdit: (shift: DutyShift) => void
  onAdd: () => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { date } = useDateFormat()
  const currency = settings?.currency ?? '₾'
  const sum = sumShifts(shifts)

  return (
    <ModalShell title={date(day)} onClose={onClose}>
      {shifts.length > 1 && (
        <p className="mb-3 text-sm tabular-nums text-muted-foreground" data-testid="duty-day-totals">
          {t('duty.period.totals', { count: sum.count, hours: formatHours(sum.hours), pay: sumMoney(sum, currency, i18n.language) })}
        </p>
      )}

      <DutyDayShifts shifts={shifts} currency={currency} onEdit={onEdit} shiftActions={shiftActions} dimmed={dimmed} />

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          <X className="size-4" />
          {t('actions.close')}
        </Button>
        <Button onClick={onAdd}>
          <Plus className="size-4" />
          {t('duty.shift.add')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
