import { useTranslation } from 'react-i18next'
import { CalendarClock, SquarePen } from 'lucide-react'
import type { DutySettingsData, DutyShift } from '@/api/duty'
import { parseDay } from '@/lib/duty'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { DutyDayTile, DutyShiftCard } from '@/components/duty/DutyBits'
import { useDutyShiftActions } from '@/components/duty/useDutyShiftActions'

/* ============================================================
   **სია — მორიგეობები თვეებად, იმავე ბლოკებით, რაც კალენდარზეა.**

   ყოველი თვე თავისი მიკრული სათაურით; მორიგეობა — `DutyShiftCard` (სამსახურის
   ფერადი ზოლი, ტიპი, დრო, საათები, თანხა, სტატუსი, შენიშვნა), თავში რიცხვი და
   კვირის დღე, ბოლოში რჩეული და „რედაქტირება“. იგივე და „წაშლა“ მარჯვენა
   ღილაკზეც (`useDutyShiftActions` — კალენდრის ბლოკის იგივე მენიუ).
   ⚠️ რიგი სერვერისაა — თარიღი, მერე დაწყების დრო; აქ მხოლოდ თვეებად იჭრება.
   ⚠️ **`dimmed`** — „ღია" სამსახურის მორიგეობები ბაცად (ფერი და მონაცემი უცვლელი).
   ============================================================ */

export function DutyList({
  shifts,
  settings,
  onEdit,
  dimmed,
  emptyTitle,
}: {
  shifts: DutyShift[]
  settings: DutySettingsData | undefined
  onEdit: (shift: DutyShift) => void
  dimmed?: ReadonlySet<number>
  /** ფილტრით ცარიელი სია სხვა რამეს ამბობს, ვიდრე ცარიელი პერიოდი */
  emptyTitle?: string
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const currency = settings?.currency ?? '₾'
  const { actionsFor, favorite, moveDialog } = useDutyShiftActions(onEdit, currency)
  const monthFormat = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' })
  const monthOf = (iso: string) => {
    const text = monthFormat.format(parseDay(iso))
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  if (!shifts.length) {
    return (
      <EmptyState
        icon={<CalendarClock className="size-6" />}
        title={emptyTitle ?? t('duty.empty')}
        hint={emptyTitle ? undefined : t('duty.emptyHint')}
      />
    )
  }

  // თვე იცვლება → ახალი ჯგუფი (სერვერის რიგი ხელუხლებელია)
  const months: { key: string; items: DutyShift[] }[] = []
  for (const shift of shifts) {
    const key = shift.date.slice(0, 7)
    const last = months[months.length - 1]
    if (last?.key === key) last.items.push(shift)
    else months.push({ key, items: [shift] })
  }

  return (
    <div className="space-y-4" data-testid="duty-list">
      {months.map((month) => (
        <section key={month.key}>
          <h3 className="sticky top-14 z-10 mb-2 bg-background/90 py-1.5 text-sm font-semibold backdrop-blur-sm" data-testid="duty-month">
            {monthOf(month.items[0].date)}
          </h3>
          <ul className="space-y-2">
            {month.items.map((shift) => (
              <DutyShiftCard
                key={shift.id}
                shift={shift}
                currency={currency}
                menu={actionsFor(shift)}
                dimmed={shift.workplace_id != null && dimmed?.has(shift.workplace_id)}
                lead={<DutyDayTile day={shift.date} />}
                data-testid="duty-row"
              >
                <FavoriteButton active={shift.is_favorite} onToggle={() => favorite.mutate(shift.id)} pending={favorite.isPending} />
                <Button variant="edit" size="sm" onClick={() => onEdit(shift)}>
                  <SquarePen className="size-3.5" />
                  {t('actions.edit')}
                </Button>
              </DutyShiftCard>
            ))}
          </ul>
        </section>
      ))}
      {moveDialog}
    </div>
  )
}
