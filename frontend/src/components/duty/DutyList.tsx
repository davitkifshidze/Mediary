import { useTranslation } from 'react-i18next'
import { Ban, CalendarClock, SquarePen } from 'lucide-react'
import type { DutySettingsData, DutyShift } from '@/api/duty'
import { useDateFormat } from '@/lib/dates'
import { formatMoney, hoursLabel, parseDay, shiftRange, typeName, workplaceColor } from '@/lib/duty'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { RecordContextMenu } from '@/components/ui/record-menu'
import { useDutyShiftActions } from '@/components/duty/useDutyShiftActions'

/* ============================================================
   **სია — პერიოდის მორიგეობები სტრიქონებად.**

   თარიღი (კვირის დღით) · სამსახური · ტიპი · დრო · საათები · თანხა · შენიშვნა,
   ბოლოში რჩეული და „რედაქტირება“ (მოქმედებების ზოლის ღილაკები); იგივე და „წაშლა“
   მარჯვენა ღილაკზეც (`useDutyShiftActions` — კალენდრის ჩიპის იგივე მენიუ).
   ⚠️ რიგი სერვერისაა — თარიღი, მერე დაწყების დრო.
   ============================================================ */

export function DutyList({
  shifts,
  settings,
  onEdit,
}: {
  shifts: DutyShift[]
  settings: DutySettingsData | undefined
  onEdit: (shift: DutyShift) => void
}) {
  const { t, i18n } = useTranslation()
  const { date } = useDateFormat()
  const { actionsFor, favorite } = useDutyShiftActions(onEdit)
  const lang = i18n.language
  const currency = settings?.currency ?? '₾'
  const weekday = new Intl.DateTimeFormat(lang, { weekday: 'short' })

  if (!shifts.length) {
    return <EmptyState icon={<CalendarClock className="size-6" />} title={t('duty.empty')} hint={t('duty.emptyHint')} />
  }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card" data-testid="duty-list">
      {shifts.map((shift) => (
        <RecordContextMenu key={shift.id} actions={actionsFor(shift)}>
        <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
          <span className="w-32 shrink-0 text-sm">
            <span className="text-muted-foreground">{weekday.format(parseDay(shift.date))} · </span>
            <span className="font-medium">{date(shift.date)}</span>
          </span>

          <span
            className={cn('flex min-w-0 flex-1 items-center gap-2 text-sm', shift.status === 'cancelled' && 'text-destructive line-through')}
            data-status={shift.status}
          >
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: workplaceColor(shift.workplace) }} />
            <span className="truncate font-medium">{shift.workplace?.name ?? t('duty.noWorkplace')}</span>
            <span className="truncate text-muted-foreground">
              · {shift.type ? typeName(shift.type, lang) : t('duty.shift.custom')}
              {/* „09:00 → 09:00 (+1)“ — დასრულება სერვერიდან (დაწყება + საათები) */}
              {shift.start_time && ` · ${shiftRange(shift) ?? shift.start_time}`}
            </span>
          </span>

          {/* გაუქმებული/ნაწილობრივი — ნიშანი; ნაწილობრივზე საათები „10 / 24“ */}
          {shift.status !== 'scheduled' && (
            <Badge
              className={cn(
                shift.status === 'cancelled'
                  ? 'bg-[color-mix(in_oklab,var(--destructive)_16%,transparent)] text-destructive'
                  : 'bg-[color-mix(in_oklab,var(--icon-warn)_20%,transparent)]',
              )}
            >
              {shift.status === 'cancelled' && <Ban className="size-3" />}
              {t(`duty.status.${shift.status}`)}
            </Badge>
          )}
          <span className="w-20 text-right text-sm tabular-nums">{t('duty.hoursValue', { hours: hoursLabel(shift) })}</span>
          <span className="w-24 text-right text-sm font-medium tabular-nums">
            {shift.pay != null ? formatMoney(shift.pay, currency, lang) : '—'}
          </span>

          <span className="flex items-center gap-1">
            <FavoriteButton active={shift.is_favorite} onToggle={() => favorite.mutate(shift.id)} pending={favorite.isPending} />
            <Button variant="edit" size="sm" className="h-8 px-2.5 text-xs" onClick={() => onEdit(shift)}>
              <SquarePen className="size-3.5" />
              {t('actions.edit')}
            </Button>
          </span>

          {shift.note && <p className="w-full truncate pl-36 text-xs text-muted-foreground">{shift.note}</p>}
        </li>
        </RecordContextMenu>
      ))}
    </ul>
  )
}
