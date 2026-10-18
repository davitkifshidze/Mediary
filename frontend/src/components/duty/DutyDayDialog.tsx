import { useTranslation } from 'react-i18next'
import { Plus, SquarePen } from 'lucide-react'
import type { DutySettingsData, DutyShift } from '@/api/duty'
import { useDateFormat } from '@/lib/dates'
import { formatHours, formatMoney, typeName, workplaceColor } from '@/lib/duty'
import { Button } from '@/components/ui/button'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'

/* ============================================================
   **ერთი დღე კალენდარზე** — ამ დღის მორიგეობები (ორი სამსახური ან
   ორი მორიგეობაც შეიძლება) და „დამატება“. ⚠️ ცარიელ დღეზე ეს ფანჯარა არ
   იხსნება — გვერდი პირდაპირ დამატების ფორმას აჩვენებს.
   ============================================================ */

export function DutyDayDialog({
  day,
  shifts,
  settings,
  onEdit,
  onAdd,
  onClose,
}: {
  day: string
  shifts: DutyShift[]
  settings: DutySettingsData | undefined
  onEdit: (shift: DutyShift) => void
  onAdd: () => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { date } = useDateFormat()
  const currency = settings?.currency ?? '₾'

  return (
    <ModalShell title={date(day)} onClose={onClose}>
      <ul className="space-y-2">
        {shifts.map((shift) => (
          <li key={shift.id} className="flex items-center gap-3 rounded-md border border-border p-3">
            <span className="h-9 w-1.5 shrink-0 rounded-sm" style={{ background: workplaceColor(shift.workplace) }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {shift.workplace?.name ?? t('duty.noWorkplace')}
                <span className="text-muted-foreground"> · {shift.type ? typeName(shift.type, i18n.language) : t('duty.shift.custom')}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[
                  t('duty.hoursValue', { hours: formatHours(shift.hours) }),
                  shift.start_time,
                  shift.pay != null ? formatMoney(shift.pay, currency, i18n.language) : null,
                  shift.note,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <Button variant="edit" size="sm" onClick={() => onEdit(shift)}>
              <SquarePen className="size-3.5" />
              {t('actions.edit')}
            </Button>
          </li>
        ))}
      </ul>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
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
