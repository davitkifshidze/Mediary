import { useState } from 'react'
import { SelectWithAdd } from '@/components/ui/inline-add'
import { addAlbum, addPerson } from '@/components/personal/personalAdd'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoveRight, X } from 'lucide-react'
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

   ⚠️ **სივრცე („ფოტო & ვიდეო" / „სქრინშოტები") ცალკე არჩევანია**: სქრინშოტს
   პიროვნება არ აქვს და მხოლოდ სქრინშოტების ალბომში დევს, ამიტომ სივრცის შეცვლაზე
   ალბომების სია იცვლება და პიროვნების ველი ქრება. ალბომში გადატანისას სივრცეს
   სერვერზე ალბომი წყვეტს; ვიდეო სქრინშოტი ვერ გახდება (გამოიტოვება).
   ============================================================ */

/** სად ცხოვრობს ფოტო: ფოტო & ვიდეო, თუ სქრინშოტების ცალკე სივრცე */
export type PersonalSpace = 'media' | 'screenshots'

const KEEP = 'keep'
const NONE = 'none'

export function PersonalMoveDialog({
  ids,
  space = 'media',
  onClose,
  onMoved,
}: {
  ids: number[]
  /** რომელი სივრციდან გაიხსნა ფანჯარა */
  space?: PersonalSpace
  onClose: () => void
  onMoved?: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  /** სამიზნე სივრცე; `KEEP` — სადაც არის */
  const [target, setTarget] = useState<PersonalSpace | typeof KEEP>(KEEP)
  const into: PersonalSpace = target === KEEP ? space : target
  const shots = into === 'screenshots'

  const peopleQ = useQuery({ queryKey: [PERSONAL_KEY, 'people'], queryFn: fetchPeople })
  const albumsQ = useQuery({
    queryKey: [PERSONAL_KEY, 'albums', shots ? { screenshots: true } : {}],
    queryFn: () => fetchPersonalAlbums(shots ? { screenshots: true } : {}),
  })

  const [person, setPerson] = useState(KEEP)
  const [album, setAlbum] = useState(KEEP)

  /** სივრცის შეცვლა წინა სივრცის არჩევანს აუქმებს — მისი ალბომები იქ არ არსებობს */
  const changeSpace = (next: string) => {
    setTarget(next as PersonalSpace | typeof KEEP)
    setPerson(KEEP)
    setAlbum(KEEP)
  }

  const value = (choice: string) => (choice === NONE ? null : Number(choice))

  const move = useMutation({
    mutationFn: () =>
      movePersonalMedia(ids, {
        ...(target === KEEP ? {} : { screenshot: shots }),
        ...(person === KEEP || shots ? {} : { person_id: value(person) }),
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
        <FormField label={t('personal.move.space')} hint={t('personal.move.spaceHint')}>
          <Select value={target} onValueChange={changeSpace}>
            <SelectTrigger data-testid="move-space">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={KEEP}>{t('personal.move.keep')}</SelectItem>
              {space !== 'media' && <SelectItem value="media">{t('personal.move.toMedia')}</SelectItem>}
              {space !== 'screenshots' && <SelectItem value="screenshots">{t('personal.move.toScreenshots')}</SelectItem>}
            </SelectContent>
          </Select>
        </FormField>

        {/* სქრინშოტს პიროვნება არ აქვს */}
        {!shots && (
        <FormField label={t('personal.move.person')}>
          <SelectWithAdd
            value={person}
            onValueChange={setPerson}
            addLabel={t('personal.person.add')}
            dialog={addPerson}
          >
            <SelectItem value={KEEP}>{t('personal.move.keep')}</SelectItem>
            <SelectItem value={NONE}>{t('personal.move.noPerson')}</SelectItem>
            {(peopleQ.data ?? []).map((p) => (
              <SelectItem key={p.id} value={String(p.id)} disabled={isHidden(p)}>
                {isHidden(p) ? `${p.name} · ${t('lock.badgeLocked')}` : p.name}
              </SelectItem>
            ))}
          </SelectWithAdd>
        </FormField>
        )}

        <FormField label={t('personal.move.album')}>
          <SelectWithAdd
            value={album}
            onValueChange={setAlbum}
            addLabel={t('personal.album.add')}
            dialog={addAlbum(person === NONE || person === KEEP || shots ? null : Number(person), shots)}
          >
            <SelectItem value={KEEP}>{t('personal.move.keep')}</SelectItem>
            <SelectItem value={NONE}>{t('personal.move.noAlbum')}</SelectItem>
            {(albumsQ.data ?? []).map((a) => (
              <SelectItem key={a.id} value={String(a.id)} disabled={isHidden(a)}>
                {[a.name, a.person?.name, isHidden(a) ? t('lock.badgeLocked') : null].filter(Boolean).join(' · ')}
              </SelectItem>
            ))}
          </SelectWithAdd>
          {chosenAlbum?.person && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('personal.move.followsAlbum', { name: chosenAlbum.person.name })}
            </p>
          )}
        </FormField>
      </FormSection>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          <X className="size-4" />
          {t('actions.cancel')}
        </Button>
        <Button disabled={(target === KEEP && person === KEEP && album === KEEP) || move.isPending} onClick={() => move.mutate()}>
          <MoveRight className="size-4" />
          {t('gallery.move')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
