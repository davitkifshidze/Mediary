import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateDutyShift, type DutyShift } from '@/api/duty'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { invalidateDuty } from '@/lib/duty'
import { DatePicker } from '@/components/ui/date-picker'
import { useToast } from '@/components/ui/feedback'
import { FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { ModalShell } from '@/components/ui/modal-shell'

/* ============================================================
   **მორიგეობის გაცვლა — სხვა დღეზე გადატანა.**

   მხოლოდ თარიღი იცვლება (`PATCH date`): სამსახური, ტიპი, თანხა და რიტმის
   ნიშანი (`pattern_id`) რჩება — რიტმის გაგრძელება გათავისუფლებულ დღეს აღარ
   დაამატებს, რადგან უკვე გაგრძელებულ შუალედს ხელახლა არ ეხება. ახალ დღეზე
   შეხსენება თავიდან ეკუთვნის (`DutyShift::booted()`).
   ============================================================ */

const FORM_ID = 'duty-move-form'

export function DutyMoveDialog({ shift, onClose }: { shift: DutyShift; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { date } = useDateFormat()
  const [day, setDay] = useState(shift.date)

  const save = useMutation({
    mutationFn: () => updateDutyShift(shift.id, { date: day }),
    onSuccess: () => {
      invalidateDuty(qc)
      toast({ title: t('duty.shift.moved', { date: date(day) }), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t('duty.shift.moveDay')} onClose={onClose}>
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          if (day && day !== shift.date) save.mutate()
        }}
      >
        <FormSection>
          <FormField label={t('duty.shift.newDay')} htmlFor="duty-move-day" required>
            <DatePicker id="duty-move-day" value={day} onChange={(v) => setDay(v ?? shift.date)} />
          </FormField>
        </FormSection>
      </form>

      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />
    </ModalShell>
  )
}
