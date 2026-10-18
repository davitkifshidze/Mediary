import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe } from 'lucide-react'
import {
  createPersonalAlbum,
  fetchPeople,
  isHidden,
  PERSONAL_KEY,
  updatePersonalAlbum,
  type PersonalAlbum,
} from '@/api/personal'
import { errorMessage } from '@/lib/errors'
import { invalidatePersonal } from '@/lib/personal'
import { useToast } from '@/components/ui/feedback'
import { FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

/* ============================================================
   **პირადი გალერეის ალბომი — დამატება/რედაქტირება.**

   ⚠️ **„ვისია" აქვეა**: ალბომი „გარეთ" (არავისი) ან ადამიანის შიგნით.
   ⚠️ სხვა ადამიანზე გადატანა ფოტოებს თან მიაქვს — სერვერის ინვარიანტი
   („ადამიანის ალბომის ფოტო მისია"), აქ მხოლოდ ახსნაა (`i`).

   ⚠️ **საჯაროობა ალბომის დონეზეა** — ადამიანი და ცალკეული ფოტო საჯარო
   ვერ გახდება; პროფილზე ის მაშინ ჩანს, როცა „პირადი გალერეა" პროფილის
   მოდულებშიც ჩართულია (სამი ფენა). ⚠️ **ჩაკეტილი ალბომი — არასდროს**:
   გადამრთველი გათიშულია (სერვერი 422-ს აბრუნებს), ჩაკეტილი და დაუხსნელი
   ადამიანი კი „ვისია"-ში ვერ აირჩევა (423).
   ============================================================ */

const FORM_ID = 'personal-album-form'
const NO_PERSON = 'none'

export function PersonalAlbumDialog({
  album,
  personId,
  onClose,
  onSaved,
}: {
  /** `null` — ახალი ალბომი */
  album: PersonalAlbum | null
  /** ახალი ალბომის ადამიანი (ადამიანის გვერდიდან) */
  personId?: number | null
  onClose: () => void
  onSaved?: (album: PersonalAlbum) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const peopleQ = useQuery({ queryKey: [PERSONAL_KEY, 'people'], queryFn: fetchPeople })

  const [name, setName] = useState(album?.name ?? '')
  const [description, setDescription] = useState(album?.description ?? '')
  const [owner, setOwner] = useState<string>(String(album ? (album.person_id ?? NO_PERSON) : (personId ?? NO_PERSON)))
  const [isPublic, setIsPublic] = useState(album?.visibility === 'public')

  const save = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        description: description.trim() || null,
        person_id: owner === NO_PERSON ? null : Number(owner),
        visibility: isPublic ? ('public' as const) : ('private' as const),
      }

      return album ? updatePersonalAlbum(album.id, input) : createPersonalAlbum(input)
    },
    onSuccess: (saved) => {
      invalidatePersonal(qc)
      toast({ title: t(album ? 'personal.album.saved' : 'personal.album.created'), variant: 'success' })
      onSaved?.(saved)
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t(album ? 'personal.album.edit' : 'personal.album.add')} onClose={onClose}>
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) save.mutate()
        }}
      >
        <FormSection>
          <FormField label={t('personal.album.name')} htmlFor="personal-album-name" required>
            <Input
              id="personal-album-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </FormField>

          <FormField label={t('personal.album.owner')} hint={t('personal.album.ownerHint')}>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PERSON}>{t('personal.album.outside')}</SelectItem>
                {(peopleQ.data ?? []).map((person) => (
                  <SelectItem key={person.id} value={String(person.id)} disabled={isHidden(person)}>
                    {isHidden(person) ? `${person.name} · ${t('lock.badgeLocked')}` : person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label={t('personal.album.description')} htmlFor="personal-album-description">
            <Textarea
              id="personal-album-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </FormField>

          {/* ---------- საჯაროობა ---------- */}
          <FormField>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
              <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                <Globe className={isPublic ? 'size-4 text-primary' : 'size-4 text-muted-foreground'} />
                {t('personal.album.public')}
                <InfoHint info={t(album?.locked ? 'personal.lock.notPublic' : 'personal.album.publicHint')} />
              </div>
              <Switch
                checked={isPublic}
                onCheckedChange={setIsPublic}
                disabled={!!album?.locked}
                aria-label={t('personal.album.public')}
              />
            </div>
          </FormField>
        </FormSection>
      </form>

      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />
    </ModalShell>
  )
}
