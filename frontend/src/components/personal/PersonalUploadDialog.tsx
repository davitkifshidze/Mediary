import { useRef, useState } from 'react'
import { SelectWithAdd } from '@/components/ui/inline-add'
import { addAlbum, addPerson } from '@/components/personal/personalAdd'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { fetchPeople, fetchPersonalAlbums, PERSONAL_KEY } from '@/api/personal'
import { Button } from '@/components/ui/button'
import { FormField, FormSection } from '@/components/ui/form-layout'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { SelectItem } from '@/components/ui/select'
import { PersonalUploadButton, PersonalUploader, type PersonalUploaderHandle, type UploadOnly } from '@/components/personal/PersonalUploader'
import { X } from 'lucide-react'

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
  only,
  screenshot = false,
}: {
  onClose: () => void
  personId?: number | null
  albumId?: number | null
  /** სქრინშოტების ჩანართიდან — მხოლოდ ფოტო, პიროვნების გარეშე, სქრინშოტების ალბომებით */
  screenshot?: boolean
  /** ფოტოების / ვიდეოების ჩანართიდან — მხოლოდ ეს სახეობა */
  only?: UploadOnly
}) {
  const { t } = useTranslation()
  const uploader = useRef<PersonalUploaderHandle>(null)
  const peopleQ = useQuery({ queryKey: [PERSONAL_KEY, 'people'], queryFn: fetchPeople })
  const albumsQ = useQuery({
    queryKey: [PERSONAL_KEY, 'albums', screenshot ? { screenshots: true } : {}],
    queryFn: () => fetchPersonalAlbums(screenshot ? { screenshots: true } : {}),
  })
  const kind = screenshot ? 'photo' : only

  const [person, setPerson] = useState(personId ? String(personId) : NONE)
  const [album, setAlbum] = useState(albumId ? String(albumId) : NONE)

  return (
    <ModalShell
      title={t(
        screenshot
          ? 'personal.screenshots.upload'
          : only === 'photo'
            ? 'personal.upload.photo'
            : only === 'video'
              ? 'personal.upload.video'
              : 'personal.upload.title',
      )}
      onClose={onClose}
      size="wide"
      hint={t('personal.upload.hint')}
    >
      <FormSection>
        {/* სქრინშოტს პიროვნება არ აქვს */}
        {!screenshot && (
        <FormField label={t('personal.move.person')} size="half">
          <SelectWithAdd
            value={person}
            onValueChange={setPerson}
            addLabel={t('personal.person.add')}
            dialog={addPerson}
          >
            <SelectItem value={NONE}>{t('personal.move.noPerson')}</SelectItem>
            {(peopleQ.data ?? []).map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectWithAdd>
        </FormField>
        )}

        <FormField label={t('personal.move.album')} size="half">
          <SelectWithAdd
            value={album}
            onValueChange={setAlbum}
            addLabel={t('personal.album.add')}
            dialog={addAlbum(person === NONE || screenshot ? null : Number(person), screenshot)}
          >
            <SelectItem value={NONE}>{t('personal.move.noAlbum')}</SelectItem>
            {(albumsQ.data ?? []).map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.person ? `${a.name} · ${a.person.name}` : a.name}
              </SelectItem>
            ))}
          </SelectWithAdd>
        </FormField>
      </FormSection>

      <PersonalUploader
        ref={uploader}
        className="mt-4"
        personId={person === NONE || screenshot ? null : Number(person)}
        albumId={album === NONE ? null : Number(album)}
        only={kind}
        screenshot={screenshot || undefined}
      >
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/40 p-4">
          <PersonalUploadButton onClick={() => uploader.current?.open()} only={kind} />
          <span className="text-sm text-muted-foreground">{t('personal.upload.dragHint')}</span>
        </div>
      </PersonalUploader>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          <X className="size-4" />
          {t('actions.close')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
