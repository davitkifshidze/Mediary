import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Trash2 } from 'lucide-react'
import { bulkUpdateDutyShifts, deleteDutyShifts, type DutyShift, type DutyShiftType, type DutyWorkplace } from '@/api/duty'
import { errorMessage } from '@/lib/errors'
import { invalidateDuty, typeName, workplaceColor } from '@/lib/duty'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { useToast } from '@/components/ui/feedback'
import { FormField, FormSection } from '@/components/ui/form-layout'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'

/* ============================================================
   **მონიშნული დღეების მორიგეობები — მასობრივი შეცვლა და წაშლა (Tasks §34.5).**

   ⚠️ **თანხა ხელახლა ითვლება ახალი სამსახურის/ტიპის ტარიფით** (სერვერი,
   `PATCH /duty/shifts`): „ეს დღეები B-ში იყო“ ხელახალი კლასიფიკაციაა, და ძველი
   თანხა ტყუილი იქნებოდა. ტიპის შეცვლა საათებსაც ტიპისას აძლევს.
   ⚠️ წაშლა ურნაშია — აღდგენა ურნიდან.
   ============================================================ */

const KEEP = 'keep'

export function DutyBulkDialog({
  shifts,
  workplaces,
  types,
  onClose,
  onDone,
}: {
  shifts: DutyShift[]
  workplaces: DutyWorkplace[]
  types: DutyShiftType[]
  onClose: () => void
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [workplace, setWorkplace] = useState<string>(KEEP)
  const [type, setType] = useState<string>(KEEP)

  const ids = shifts.map((s) => s.id)

  const change = useMutation({
    mutationFn: () =>
      bulkUpdateDutyShifts(ids, {
        ...(workplace === KEEP ? {} : { workplace_id: Number(workplace) }),
        ...(type === KEEP ? {} : { type_id: Number(type) }),
      }),
    onSuccess: (updated) => {
      invalidateDuty(qc)
      toast({ title: t('duty.bulk.changed', { count: updated }), variant: 'success' })
      onDone()
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const remove = useMutation({
    mutationFn: () => deleteDutyShifts(ids),
    onSuccess: (count) => {
      invalidateDuty(qc)
      toast({ title: t('duty.bulk.trashed', { count }), variant: 'success' })
      onDone()
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t('duty.bulk.title', { count: shifts.length })} onClose={onClose} hint={t('duty.bulk.hint')}>
      <FormSection>
        <FormField label={t('fields.name.duty.workplace')}>
          <div className="flex flex-wrap gap-2">
            <Chip active={workplace === KEEP} onClick={() => setWorkplace(KEEP)}>
              {t('duty.bulk.keep')}
            </Chip>
            {workplaces.map((w) => (
              <Chip
                key={w.id}
                active={workplace === String(w.id)}
                onClick={() => setWorkplace(String(w.id))}
                icon={<span className="size-2.5 rounded-sm" style={{ background: workplaceColor(w) }} />}
              >
                {w.name}
              </Chip>
            ))}
          </div>
        </FormField>

        <FormField label={t('fields.name.duty.type')}>
          <div className="flex flex-wrap gap-2">
            <Chip active={type === KEEP} onClick={() => setType(KEEP)}>
              {t('duty.bulk.keep')}
            </Chip>
            {types.map((x) => (
              <Chip key={x.id} active={type === String(x.id)} onClick={() => setType(String(x.id))}>
                {typeName(x, i18n.language)}
              </Chip>
            ))}
          </div>
        </FormField>
      </FormSection>

      <ModalFooter>
        <Button variant="destructiveOutline" onClick={() => remove.mutate()} disabled={remove.isPending || !shifts.length}>
          <Trash2 className="size-4" />
          {t('duty.bulk.delete', { count: shifts.length })}
        </Button>
        <Button variant="outline" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button onClick={() => change.mutate()} disabled={(workplace === KEEP && type === KEEP) || change.isPending}>
          <Check className="size-4" />
          {t('duty.bulk.apply')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
