import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPerson, updatePerson, type Person } from '@/api/personal'
import { useRecordExtras } from '@/lib/customFieldDraft'
import { errorMessage } from '@/lib/errors'
import { useModuleFields } from '@/lib/fields'
import { invalidatePersonal } from '@/lib/personal'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { DatePicker } from '@/components/ui/date-picker'
import { useToast } from '@/components/ui/feedback'
import { FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
import { Textarea } from '@/components/ui/textarea'

/* ============================================================
   **ადამიანის დამატება/რედაქტირება.**

   ⚠️ **ველები `FieldCatalog`-იდანაა** (`personal`: სახელი · დაბადების დღე ·
   შენიშვნა) — `/modules/personal`-ზე დამალული ველი აქაც ქრება; სახელი
   ჩაკეტილია (ადამიანი უსახელოდ არ არსებობს).

   ⚠️ **დამატებითი ველები ახალ ადამიანზეც** (მონახაზით): ჯერ ადამიანი
   იქმნება, მერე ველები მიება (`useRecordExtras`).

   ⚠️ **ფოტო აქ არ ტვირთება** — მთავარი ფოტო მისი ერთ-ერთი ფოტოა („მთავარად
   დაყენება" ბადეში); ცალკე ატვირთვის ველი ორ სხვადასხვა „პორტრეტს" გააჩენდა.
   ============================================================ */

const FORM_ID = 'person-form'

export function PersonDialog({
  person,
  onClose,
  onSaved,
}: {
  /** `null` — ახალი ადამიანი */
  person: Person | null
  onClose: () => void
  onSaved?: (person: Person) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const fields = useModuleFields('personal')
  const extras = useRecordExtras<Person>('personal', person)

  const [name, setName] = useState(person?.name ?? '')
  const [birthday, setBirthday] = useState<string | null>(person?.birthday ?? null)
  const [note, setNote] = useState(person?.note ?? '')

  const save = useMutation({
    mutationFn: async () => {
      const input = {
        name: name.trim(),
        birthday: fields.shows('birthday') ? birthday : undefined,
        note: fields.shows('note') ? note.trim() || null : undefined,
      }
      const target = extras.current
      const saved = target ? await updatePerson(target.id, input) : await createPerson(input)
      const extra = await extras.afterSave(saved)

      return { saved, extra }
    },
    onSuccess: ({ saved, extra }) => {
      invalidatePersonal(qc)

      if (!extra.ok) {
        toast({ title: extra.message, variant: 'error' })
        return
      }

      toast({ title: t(person ? 'personal.person.saved' : 'personal.person.created'), variant: 'success' })
      onSaved?.(saved)
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const missing = !name.trim() || fields.isMissing('birthday', birthday) || fields.isMissing('note', note.trim())

  return (
    <ModalShell title={t(person ? 'personal.person.edit' : 'personal.person.add')} onClose={onClose} hint={t('personal.person.hint')}>
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          if (!missing) save.mutate()
        }}
      >
        <FormSection>
          <FormField {...fields.field('name')} htmlFor="person-name" required>
            <Input
              id="person-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder={fields.placeholder('name')}
            />
          </FormField>

          <FormField {...fields.field('birthday')} size="half" htmlFor="person-birthday">
            <DatePicker id="person-birthday" value={birthday} onChange={setBirthday} placeholder={fields.placeholder('birthday')} />
          </FormField>

          <FormField {...fields.field('note')} htmlFor="person-note">
            <Textarea
              id="person-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={5000}
              autoGrow
              placeholder={fields.placeholder('note')}
            />
          </FormField>
        </FormSection>
      </form>

      <CustomFieldsCard module="personal" recordId={extras.current?.id ?? null} draft={extras.draft} className="mt-6" />

      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />
    </ModalShell>
  )
}
