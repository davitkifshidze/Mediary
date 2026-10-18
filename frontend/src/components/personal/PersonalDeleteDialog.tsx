import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderOutput, Trash2 } from 'lucide-react'
import { deletePerson, deletePersonalAlbum, type Person, type PersonalAlbum } from '@/api/personal'
import { errorMessage } from '@/lib/errors'
import { countLabel, invalidatePersonal } from '@/lib/personal'
import { useSettings } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

/* ============================================================
   **ადამიანის ან ალბომის წაშლა — ურნაში, ცხადი არჩევანით.**

   ⚠️ **ნაგულისხმევი უსაფრთხოა: შიგთავსი რჩება.** ადამიანის ფოტოები და
   ალბომები უჯგუფოდ რჩება, ალბომის ფოტოები — ალბომის გარეშე (გალერეის ალბომის
   წესი: „საქაღალდის" მოშორება ბიბლიოთეკის წაშლა ვერ იქნება). აღდგენა მათ უკან
   მიაბამს. „შიგთავსიც" ცხადი არჩევანია — მაშინ ის ურნაშია ადამიანთან/ალბომთან
   ერთად და მასთან ერთად ბრუნდება.

   ⚠️ `useConfirm` აქ არ გამოდგება — ის ორღილაკიანი კითხვაა და არჩევანს ვერ ატევს.
   ============================================================ */

type Target = { kind: 'person'; person: Person } | { kind: 'album'; album: PersonalAlbum }

export function PersonalDeleteDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: Target
  onClose: () => void
  onDeleted?: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { settings } = useSettings()
  const [mode, setMode] = useState<'keep' | 'with'>('keep')

  const isPerson = target.kind === 'person'
  const name = isPerson ? target.person.name : target.album.name
  const photos = isPerson ? target.person.photos : target.album.photos
  const videos = isPerson ? target.person.videos : target.album.videos
  const albums = isPerson ? target.person.albums : 0
  const empty = photos + videos + albums === 0

  const remove = useMutation({
    mutationFn: () =>
      target.kind === 'person'
        ? deletePerson(target.person.id, mode === 'keep')
        : deletePersonalAlbum(target.album.id, mode === 'with'),
    onSuccess: () => {
      invalidatePersonal(qc)
      toast({ title: t('personal.delete.done', { name }), variant: 'success' })
      onDeleted?.()
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const contents = [countLabel(t, photos, videos), albums > 0 ? t('personal.albumsCount', { count: albums }) : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <ModalShell
      title={t(isPerson ? 'personal.delete.personTitle' : 'personal.delete.albumTitle', { name })}
      onClose={onClose}
      destructive
    >
      <p className="text-sm text-muted-foreground">{t('personal.delete.toTrash', { days: settings.trashDays })}</p>

      {!empty && (
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'keep' | 'with')} className="mt-4 gap-2">
          <Choice
            value="keep"
            active={mode === 'keep'}
            icon={<FolderOutput className="size-4 text-muted-foreground" />}
            label={t(isPerson ? 'personal.delete.keepPerson' : 'personal.delete.keepAlbum')}
            hint={contents}
          />
          <Choice
            value="with"
            active={mode === 'with'}
            icon={<Trash2 className="size-4 text-destructive" />}
            label={t('personal.delete.withContents')}
            hint={t('personal.delete.withContentsHint')}
          />
        </RadioGroup>
      )}

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
          <Trash2 className="size-4" />
          {t('confirm.delete')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}

function Choice({
  value,
  active,
  icon,
  label,
  hint,
}: {
  value: string
  active: boolean
  icon: React.ReactNode
  label: string
  hint?: string
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${active ? 'border-primary bg-secondary/40' : 'border-border'}`}
    >
      <RadioGroupItem value={value} className="mt-0.5" />
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}
