import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserRoundPlus, X } from 'lucide-react'
import { fetchPeople, isHidden, PERSONAL_KEY, updatePersonalAlbum, type PersonalAlbum } from '@/api/personal'
import { errorMessage } from '@/lib/errors'
import { invalidatePersonal } from '@/lib/personal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { FormField, FormSection } from '@/components/ui/form-layout'
import { SelectWithAdd } from '@/components/ui/inline-add'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { SelectItem } from '@/components/ui/select'
import { addPerson } from '@/components/personal/personalAdd'

/* ============================================================
   **გარე ალბომის მიბმა პიროვნებაზე — მთლიანად.**

   ალბომი პიროვნების ალბომებში ჩნდება და მისი ფოტო-ვიდეოც ამ პიროვნების ხდება
   (სერვერის ინვარიანტი: პიროვნების ალბომის შიგთავსი მისია). ერთი ან რამდენიმე
   მონიშნული ფოტოს მიბმა ბადის „გადატანაა" (`PersonalMoveDialog`).

   ⚠️ **ჩაკეტილი და დაუხსნელი პიროვნება გათიშულია** — სერვერი მას 423-ით უარყოფს.
   ============================================================ */

export function PersonalAttachDialog({ album, onClose }: { album: PersonalAlbum; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const peopleQ = useQuery({ queryKey: [PERSONAL_KEY, 'people'], queryFn: fetchPeople })
  const [person, setPerson] = useState('')

  const attach = useMutation({
    mutationFn: () => updatePersonalAlbum(album.id, { person_id: Number(person) }),
    onSuccess: (saved) => {
      invalidatePersonal(qc)
      toast({ title: t('personal.attach.done', { name: saved.person?.name ?? '' }), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t('personal.attach.title', { name: album.name })} onClose={onClose} hint={t('personal.attach.hint')}>
      <FormSection>
        <FormField label={t('personal.move.person')} required>
          <SelectWithAdd
            value={person}
            onValueChange={setPerson}
            addLabel={t('personal.person.add')}
            dialog={addPerson}
            placeholder={t('personal.attach.pick')}
          >
            {(peopleQ.data ?? []).map((p) => (
              <SelectItem key={p.id} value={String(p.id)} disabled={isHidden(p)}>
                {isHidden(p) ? `${p.name} · ${t('lock.badgeLocked')}` : p.name}
              </SelectItem>
            ))}
          </SelectWithAdd>
        </FormField>
      </FormSection>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          <X className="size-4" />
          {t('actions.cancel')}
        </Button>
        <Button disabled={!person || attach.isPending} onClick={() => attach.mutate()} data-testid="attach-confirm">
          <UserRoundPlus className="size-4" />
          {t('personal.attach.confirm')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
