import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, CalendarCheck } from 'lucide-react'
import { deleteDutyShift, toggleDutyFavorite, updateDutyShift, type DutyShift, type DutyShiftStatus } from '@/api/duty'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { invalidateDuty } from '@/lib/duty'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { favoriteAction, MENU_ICONS, type MenuAction } from '@/components/ui/record-menu'

/* ============================================================
   **მორიგეობის მარჯვენა ღილაკის მენიუ** — რჩეული · გაუქმება (ან გაუქმების
   მოხსნა) · — · რედაქტირება · წაშლა.

   ⚠️ **გაუქმება წაშლა არ არის**: დღე რჩება წითლად და თანხა 0-ია (სერვერი
   ტარიფს აღარ კითხულობს); მოხსნაზე თანხა ისევ ტარიფიდან ითვლება.

   ერთი წყარო სიის სტრიქონისა და კალენდრის ჩიპისთვის, რომ ორ ხედში მენიუ არ
   დაშორდეს. ⚠️ წაშლა **დადასტურებით** (სხვა მოდულების მენიუს იგივე) და ურნაში —
   ფანჯრის „წაშლა“ დადასტურების გარეშეა, რადგან იქ ჩანაწერი უკვე გახსნილია.
   ============================================================ */

export function useDutyShiftActions(onEdit: (shift: DutyShift) => void) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { date } = useDateFormat()

  const favorite = useMutation({
    mutationFn: toggleDutyFavorite,
    onSuccess: () => invalidateDuty(qc),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: DutyShiftStatus }) => updateDutyShift(id, { status }),
    onSuccess: (_, vars) => {
      invalidateDuty(qc)
      toast({ title: t(vars.status === 'cancelled' ? 'duty.status.cancelledDone' : 'duty.status.restored'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const trash = useMutation({
    mutationFn: deleteDutyShift,
    onSuccess: () => {
      invalidateDuty(qc)
      toast({ title: t('duty.shift.trashed'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const actionsFor = (shift: DutyShift): MenuAction[] => [
    favoriteAction(shift.is_favorite, () => favorite.mutate(shift.id), t),
    shift.status === 'cancelled'
      ? { key: 'uncancel', label: t('duty.status.uncancel'), icon: CalendarCheck, run: () => setStatus.mutate({ id: shift.id, status: 'scheduled' }) }
      : { key: 'cancel', label: t('duty.status.cancel'), icon: Ban, run: () => setStatus.mutate({ id: shift.id, status: 'cancelled' }) },
    { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => onEdit(shift) },
    {
      key: 'delete',
      label: t('actions.delete'),
      icon: MENU_ICONS.delete,
      danger: true,
      run: async () => {
        const ok = await confirm({
          title: t('duty.shift.deleteTitle'),
          description: t('confirm.deleteRecordDesc', {
            name: [date(shift.date), shift.workplace?.name ?? t('duty.noWorkplace')].join(' · '),
          }),
          variant: 'destructive',
        })
        if (ok) trash.mutate(shift.id)
      },
    },
  ]

  return { actionsFor, favorite }
}
