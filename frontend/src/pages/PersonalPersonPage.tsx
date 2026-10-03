import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Cake, Film, Folders, Image, SquarePen, Trash2, Upload, UserRound } from 'lucide-react'
import { fetchPersonalAlbums, fetchPerson, isHidden, PERSONAL_KEY, updatePerson } from '@/api/personal'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { countLabel, invalidatePersonal } from '@/lib/personal'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { PrivateImage } from '@/components/PrivateFile'
import { Button } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/feedback'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { GalleryStackSkeleton } from '@/components/gallery/GalleryPhotoGrid'
import { PersonalAlbumCards } from '@/components/personal/PersonalAlbumCards'
import { AddAlbumButton } from '@/components/personal/PersonalAlbumsCut'
import { PersonDialog } from '@/components/personal/PersonDialog'
import { PersonalDeleteDialog } from '@/components/personal/PersonalDeleteDialog'
import { PersonalLockActions, PersonalLockedScreen } from '@/components/personal/PersonalLock'
import { PersonalMediaGrid } from '@/components/personal/PersonalMediaGrid'
import { PersonalUploader } from '@/components/personal/PersonalUploader'
import { PersonalUploadDialog } from '@/components/personal/PersonalUploadDialog'

/* ============================================================
   **ადამიანის გვერდი — `/personal/people/:id` (Tasks §33.5).**

   შენი სიტყვები: „პიროვნების ფოტო/ვიდეო სექციები განცალკევებით ტაბებად,
   ბარათების სახითაც".

   ⚠️ **ჩანართები: ფოტოები · ვიდეოები · ალბომები** (`?tab=` — „უკან" იმავე
   ჩანართზე აბრუნებს). ფოტოსა და ვიდეოს ჩანართს თავისი ატვირთვის ზონა აქვს:
   ჩაგდებული ფაილი ამ ადამიანს ეკუთვნის.

   ⚠️ **მთავარი ფოტო ბადიდან ირჩევა** („მთავარად დაყენება") — ცალკე
   ატვირთვა ორ სხვადასხვა „პორტრეტს" გააჩენდა.

   ⚠️ **ჩაკეტილი და დაუხსნელი ადამიანი (§33.7)** — მხოლოდ სახელი, რიცხვი და
   ბოქლომი (`PersonalLockedScreen`); ჰერო, ველები, ჩანართები და ღილაკები
   გახსნამდე არ იხატება — სერვერი მათ შიგთავსს ისედაც არ აგზავნის.
   ============================================================ */

type Tab = 'photos' | 'videos' | 'albums'

const TABS: { key: Tab; icon: typeof Image }[] = [
  { key: 'photos', icon: Image },
  { key: 'videos', icon: Film },
  { key: 'albums', icon: Folders },
]

/** სრული წლები დაბადების დღიდან */
function ageOf(birthday: string): number {
  const born = new Date(`${birthday}T12:00:00`)
  const now = new Date()
  let years = now.getFullYear() - born.getFullYear()
  if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) years -= 1

  return Math.max(0, years)
}

export function PersonalPersonPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const personId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { date } = useDateFormat()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((x) => x.key === params.get('tab')) ? params.get('tab') : 'photos') as Tab

  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)

  const personQ = useQuery({
    queryKey: [PERSONAL_KEY, 'person', personId],
    queryFn: () => fetchPerson(personId),
    enabled: Number.isFinite(personId),
    retry: false,
  })
  const hidden = !!personQ.data && isHidden(personQ.data)
  const albumsQ = useQuery({
    queryKey: [PERSONAL_KEY, 'albums', { person_id: personId }],
    queryFn: () => fetchPersonalAlbums({ person_id: personId }),
    enabled: tab === 'albums' && Number.isFinite(personId) && !hidden,
  })

  const setCover = useMutation({
    mutationFn: (mediaId: number) => updatePerson(personId, { cover_media_id: mediaId }),
    onSuccess: () => {
      invalidatePersonal(qc)
      toast({ title: t('personal.coverSet'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const back = (
    <Link to="/personal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />
      {t('personal.cut.people')}
    </Link>
  )

  if (personQ.isLoading) {
    return (
      <PageContainer>
        <GalleryStackSkeleton count={4} />
      </PageContainer>
    )
  }

  const person = personQ.data

  if (!person) {
    return (
      <PageContainer>
        <div className="mb-4">{back}</div>
        <EmptyState icon={<UserRound className="size-6" />} title={t('personal.person.notFound')} />
      </PageContainer>
    )
  }

  const summary = [countLabel(t, person.photos, person.videos), person.albums > 0 ? t('personal.albumsCount', { count: person.albums }) : null]
    .filter(Boolean)
    .join(' · ')

  if (hidden) {
    return (
      <PageContainer>
        <PageHeader module="personal" title={person.name} before={back} />
        <PersonalLockedScreen kind="people" record={person} summary={summary} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        module="personal"
        title={person.name}
        before={back}
        actions={
          <>
            <PersonalLockActions kind="people" record={person} />
            <Button variant="edit" onClick={() => setEditing(true)}>
              <SquarePen className="size-4" />
              {t('actions.edit')}
            </Button>
            <Button variant="destructiveOutline" onClick={() => setDeleting(true)}>
              <Trash2 className="size-4" />
              {t('confirm.delete')}
            </Button>
            <Button onClick={() => setUploading(true)}>
              <Upload className="size-4" />
              {t('actions.upload')}
            </Button>
          </>
        }
      />

      {/* ---------- ჰერო ---------- */}
      <section className="mb-5 flex flex-col gap-5 rounded-xl border border-border bg-card p-5 sm:flex-row">
        <div className="aspect-[3/4] w-36 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
          {person.cover ? (
            <PrivateImage url={person.cover} alt={person.name} className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-muted-foreground">
              <UserRound className="size-10" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-muted-foreground">{summary}</p>
          {person.birthday && (
            <p className="flex items-center gap-1.5 text-sm">
              <Cake className="size-4 text-muted-foreground" />
              {date(person.birthday)}
              <span className="text-muted-foreground">· {t('personal.person.age', { count: ageOf(person.birthday) })}</span>
            </p>
          )}
          {person.note && <p className="whitespace-pre-line text-sm">{person.note}</p>}
        </div>
      </section>

      {/* §33.4 — დამატებითი ველები ადამიანზე (თვითონ ინახავს თავს; ველის გარეშე არ ჩანს) */}
      <CustomFieldsCard module="personal" recordId={person.id} className="mb-5" />

      <div className="mb-4">
        <CutTabs
          options={TABS.map(({ key, icon }) => ({
            key,
            icon,
            label: t(`personal.tabs.${key}`),
            count: key === 'photos' ? person.photos : key === 'videos' ? person.videos : person.albums,
          }))}
          value={tab}
          onChange={(key) => {
            const next = new URLSearchParams(params)
            if (key === 'photos') next.delete('tab')
            else next.set('tab', key)
            setParams(next, { replace: true })
          }}
        />
      </div>

      {tab !== 'albums' ? (
        <>
          <PersonalUploader compact personId={person.id} className="mb-4" />
          <PersonalMediaGrid
            filters={{ person_id: person.id, kind: tab === 'photos' ? 'photo' : 'video' }}
            primary={{ id: person.cover_media_id, set: (mediaId) => setCover.mutate(mediaId) }}
            emptyText={t(tab === 'photos' ? 'personal.person.noPhotos' : 'personal.person.noVideos')}
          />
        </>
      ) : (
        <section>
          <div className="mb-4 flex justify-end">
            <AddAlbumButton personId={person.id} />
          </div>
          {albumsQ.isLoading ? (
            <GalleryStackSkeleton aspect="wide" count={4} />
          ) : (albumsQ.data ?? []).length ? (
            <PersonalAlbumCards albums={albumsQ.data ?? []} showOwner={false} />
          ) : (
            <EmptyState icon={<Folders className="size-6" />} title={t('personal.person.noAlbums')} />
          )}
        </section>
      )}

      {editing && <PersonDialog person={person} onClose={() => setEditing(false)} />}
      {deleting && (
        <PersonalDeleteDialog target={{ kind: 'person', person }} onClose={() => setDeleting(false)} onDeleted={() => navigate('/personal')} />
      )}
      {uploading && <PersonalUploadDialog personId={person.id} onClose={() => setUploading(false)} />}
    </PageContainer>
  )
}
