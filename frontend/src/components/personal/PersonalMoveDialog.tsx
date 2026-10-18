import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoveRight } from 'lucide-react'
import { fetchPeople, fetchPersonalAlbums, isHidden, movePersonalMedia, PERSONAL_KEY } from '@/api/personal'
import { errorMessage } from '@/lib/errors'
import { invalidatePersonal } from '@/lib/personal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { FormField, FormSection } from '@/components/ui/form-layout'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   **გადატანა ადამიანში და/ან ალბომში** — მრავალმონიშვნით.

   ⚠️ **„არ შეიცვალოს" ნაგულისხმევია ორივეგან**: გასაღები საერთოდ არ იგზავნება
   და სერვერი იმ ღერძს ხელს არ ახლებს; „მოხსნა" (`null`) კი ცხადი არჩევანია.

   ⚠️ **ადამიანის ალბომი ადამიანსაც ცვლის** — ინვარიანტი სერვერისაა, აქ
   მხოლოდ ქვესათაურია, რომ არჩევისას ჩანდეს, ვისი ალბომია.

   ⚠️ **ჩაკეტილი და დაუხსნელი სამიზნე გათიშულია** — სერვერი მას 423-ით
   უარყოფს: ფოტო მომხმარებლის თვალწინ „გაქრებოდა". ჯერ გახსნა.
   ============================================================ */

const KEEP = 'keep'
const NONE = 'none'

export function PersonalMoveDialog({
  ids,
  onClose,
  onMoved,
}: {
  ids: number[]
  onClose: () => void
  onMoved?: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const peopleQ = useQuery({ queryKey: [PERSONAL_KEY, 'people'], queryFn: fetchPeople })
  const albumsQ = useQuery({ queryKey: [PERSONAL_KEY, 'albums', {}], queryFn: () => fetchPersonalAlbums() })

  const [person, setPerson] = useState(KEEP)
  const [album, setAlbum] = useState(KEEP)

  const value = (choice: string) => (choice === NONE ? null : Number(choice))

  const move = useMutation({
    mutationFn: () =>
      movePersonalMedia(ids, {
        ...(person === KEEP ? {} : { person_id: value(person) }),
        ...(album === KEEP ? {} : { album_id: value(album) }),
      }),
    onSuccess: (moved) => {
      invalidatePersonal(qc)
      toast({ title: t('personal.move.done', { count: moved }), variant: 'success' })
      onMoved?.()
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const chosenAlbum = (albumsQ.data ?? []).find((a) => String(a.id) === album)

  return (
    <ModalShell title={t('personal.move.title', { count: ids.length })} onClose={onClose} hint={t('personal.move.hint')}>
      <FormSection>
        <FormField label={t('personal.move.person')}>
          <Select value={person} onValueChange={setPerson}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={KEEP}>{t('personal.move.keep')}</SelectItem>
              <SelectItem value={NONE}>{t('personal.move.noPerson')}</SelectItem>
              {(peopleQ.data ?? []).map((p) => (
                <SelectItem key={p.id} value={String(p.id)} disabled={isHidden(p)}>
                  {isHidden(p) ? `${p.name} · ${t('lock.badgeLocked')}` : p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={t('personal.move.album')}>
          <Select value={album} onValueChange={setAlbum}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={KEEP}>{t('personal.move.keep')}</SelectItem>
              <SelectItem value={NONE}>{t('personal.move.noAlbum')}</SelectItem>
              {(albumsQ.data ?? []).map((a) => (
                <SelectItem key={a.id} value={String(a.id)} disabled={isHidden(a)}>
                  {[a.name, a.person?.name, isHidden(a) ? t('lock.badgeLocked') : null].filter(Boolean).join(' · ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {chosenAlbum?.person && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('personal.move.followsAlbum', { name: chosenAlbum.person.name })}
            </p>
          )}
        </FormField>
      </FormSection>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button disabled={(person === KEEP && album === KEEP) || move.isPending} onClick={() => move.mutate()}>
          <MoveRight className="size-4" />
          {t('gallery.move')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
