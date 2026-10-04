import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteDutyShift, toggleDutyFavorite, type DutyShift } from '@/api/duty'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { invalidateDuty } from '@/lib/duty'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { favoriteAction, MENU_ICONS, type MenuAction } from '@/components/ui/record-menu'

/* ============================================================
   **მორიგეობის მარჯვენა ღილაკის მენიუ (Tasks §7, §34.7)** — რჩეული · — ·
   რედაქტირება · წაშლა.

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
