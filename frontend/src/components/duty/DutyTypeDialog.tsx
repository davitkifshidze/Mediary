import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createDutyType, updateDutyType, type DutyShiftType, type DutyTypeInput } from '@/api/duty'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { invalidateDuty } from '@/lib/duty'
import { useToast } from '@/components/ui/feedback'
import { FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { IconPicker } from '@/components/ui/icon-picker'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'

/* ============================================================
   **მორიგეობის ტიპი — დამატება/რედაქტირება (`/dictionaries`).**

   ორენოვანი სახელი (ნაგულისხმევები კოდიდანაა — „8 სთ“/„8 h“), საათები და
   ხატულა. ⚠️ საათების შეცვლა ძველ მორიგეობებს არ ეხება — მათი საათები
   ჩანაწერზეა; ახალი ტიპით დამატებული მორიგეობა ახალ საათებს იღებს.
   ============================================================ */

const FORM_ID = 'duty-type-form'

export function DutyTypeDialog({ type, onClose }: { type: DutyShiftType | null; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [form, setForm] = useState<DutyTypeInput>({
    name_ka: type?.name_ka ?? '',
    name_en: type?.name_en ?? '',
    hours: type?.hours ?? 12,
    icon: type?.icon ?? 'Clock',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: () => (type ? updateDutyType(type.id, form) : createDutyType(form)),
    onSuccess: () => {
      invalidateDuty(qc)
      toast({ title: t('duty.types.saved'), variant: 'success' })
      onClose()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  return (
    <ModalShell title={t(type ? 'duty.types.edit' : 'duty.types.add')} onClose={onClose} hint={t('duty.types.hint')}>
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          setErrors({})
          save.mutate()
        }}
      >
        <FormSection>
          <FormField size="half" label={t('genres.name_ka')} htmlFor="duty-type-ka" required error={errors.name_ka}>
            <Input
              id="duty-type-ka"
              autoFocus
              value={form.name_ka}
              onChange={(e) => setForm((f) => ({ ...f, name_ka: e.target.value }))}
              maxLength={80}
            />
          </FormField>
          <FormField size="half" label={t('genres.name_en')} htmlFor="duty-type-en" required error={errors.name_en}>
            <Input
              id="duty-type-en"
              value={form.name_en}
              onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
              maxLength={80}
            />
          </FormField>

          <FormField label={t('fields.name.duty.hours')} htmlFor="duty-type-hours" required error={errors.hours}>
            <Input
              id="duty-type-hours"
              type="number"
              min={0.5}
              max={72}
              step="0.5"
              className="max-w-32"
              value={String(form.hours)}
              onChange={(e) => setForm((f) => ({ ...f, hours: Number(e.target.value) }))}
            />
          </FormField>

          <FormField label={t('videoTypes.icon')}>
            <IconPicker value={form.icon ?? 'Clock'} onChange={(icon) => setForm((f) => ({ ...f, icon }))} className="mt-1" />
          </FormField>
        </FormSection>
      </form>

      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />
    </ModalShell>
  )
}
