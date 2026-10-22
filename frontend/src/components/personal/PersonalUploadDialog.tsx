import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { fetchPeople, fetchPersonalAlbums, PERSONAL_KEY } from '@/api/personal'
import { Button } from '@/components/ui/button'
import { FormField, FormSection } from '@/components/ui/form-layout'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PersonalUploadButton, PersonalUploader, type PersonalUploaderHandle } from '@/components/personal/PersonalUploader'

/* ============================================================
   **ატვირთვა გვერდის სათაურიდან** — სად ჩავარდეს: პიროვნება
   და/ან ალბომი, ან არსად („დაუჯგუფებელი").

   ⚠️ პიროვნების ალბომის არჩევა პიროვნებასაც თვითონ სვამს (სერვერის ინვარიანტი) —
   ამიტომ ალბომის სიაში მისი პიროვნება ქვესათაურად ჩანს.
   ⚠️ ამრჩევები წინასწარ ივსება იმ პიროვნებით/ალბომით, საიდანაც ფანჯარა გაიხსნა;
   ფაილს „ატვირთვა" ირჩევს, გადათრევა კი ამრჩევების ქვედა ბლოკზე მუშაობს.
   ============================================================ */

const NONE = 'none'

export function PersonalUploadDialog({
  onClose,
  personId,
  albumId,
}: {
  onClose: () => void
  personId?: number | null
  albumId?: number | null
}) {
  const { t } = useTranslation()
  const uploader = useRef<PersonalUploaderHandle>(null)
  const peopleQ = useQuery({ queryKey: [PERSONAL_KEY, 'people'], queryFn: fetchPeople })
  const albumsQ = useQuery({ queryKey: [PERSONAL_KEY, 'albums', {}], queryFn: () => fetchPersonalAlbums() })

  const [person, setPerson] = useState(personId ? String(personId) : NONE)
  const [album, setAlbum] = useState(albumId ? String(albumId) : NONE)

  return (
    <ModalShell title={t('personal.upload.title')} onClose={onClose} size="wide" hint={t('personal.upload.hint')}>
      <FormSection>
        <FormField label={t('personal.move.person')} size="half">
          <Select value={person} onValueChange={setPerson}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('personal.move.noPerson')}</SelectItem>
              {(peopleQ.data ?? []).map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={t('personal.move.album')} size="half">
          <Select value={album} onValueChange={setAlbum}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('personal.move.noAlbum')}</SelectItem>
              {(albumsQ.data ?? []).map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.person ? `${a.name} · ${a.person.name}` : a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </FormSection>

      <PersonalUploader
        ref={uploader}
        className="mt-4"
        personId={person === NONE ? null : Number(person)}
        albumId={album === NONE ? null : Number(album)}
      >
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/40 p-4">
          <PersonalUploadButton onClick={() => uploader.current?.open()} />
          <span className="text-sm text-muted-foreground">{t('personal.upload.dragHint')}</span>
        </div>
      </PersonalUploader>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          {t('actions.close')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
