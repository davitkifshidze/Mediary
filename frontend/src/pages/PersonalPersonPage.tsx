import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Cake, Film, Folders, Image, LayoutGrid, SquarePen, Trash2, UserRound } from 'lucide-react'
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
import { PersonalGroups } from '@/components/personal/PersonalGroups'
import { PersonalLockActions, PersonalLockedScreen } from '@/components/personal/PersonalLock'
import { PersonalMediaGrid } from '@/components/personal/PersonalMediaGrid'
import { PersonalUploadDialog } from '@/components/personal/PersonalUploadDialog'
import { PersonalUploadButton, PersonalUploader, type PersonalUploaderHandle } from '@/components/personal/PersonalUploader'

/* ============================================================
   **პიროვნების გვერდი — `/personal/people/:id`.**

   შენი სიტყვები: „პიროვნების ფოტო/ვიდეო სექციები განცალკევებით ტაბებად,
   ბარათების სახითაც" · „ჩემ განყოფილებაში იყოს საშუალება ვნახო ერთიანად,
   ასევე დაჯგუფებულადაც".

   ⚠️ **ჩანართები: ყველა · ფოტოები · ვიდეოები · ალბომები** (`?tab=`, „ყველა"
   ნაგულისხმევია — „უკან" იმავე ჩანართზე აბრუნებს). პირველ სამზე
   **დაჯგუფება: დაჯგუფების გარეშე · ალბომით** (`?group=album`) — ალბომით ხედი
   „ფოტო & ვიდეოს" ჯგუფებია (`PersonalGroups`), მხოლოდ ამ პიროვნების ფოტო/ვიდეო
   და ბოლოს „ალბომის გარეშე".

   ⚠️ **ატვირთვა ჩანართისაა**: „ატვირთვა" (ყველაში), „ფოტოს ატვირთვა" (ფოტოებში),
   „ვიდეოს ატვირთვა" (ვიდეოებში), „ალბომის შექმნა" (ალბომებში) — ჩანართების ზოლის
   მარჯვნივ. ღილაკი ფანჯარას ხსნის, სადაც ალბომიც ირჩევა (იქვე შექმნით); ჩანართების
   მთელი არე კი გადათრევის სამიზნეა (`PersonalUploader`) — ფაილი ამ პიროვნებას ეკუთვნის
   და ჩანართის სახეობას მიჰყვება.

   ⚠️ **მთავარი ფოტო**: ბადიდან „მთავარად დაყენება", ან რედაქტირების ფანჯრიდან —
   ცალკე ატვირთვა, შეცვლა, წაშლა (`PersonalCoverField`; ატვირთული ჩვეულებრივი ფოტოა).

   ⚠️ **ჩაკეტილი და დაუხსნელი პიროვნება** — მხოლოდ სახელი, რიცხვი და
   ბოქლომი (`PersonalLockedScreen`); ჰერო, ველები, ჩანართები და ღილაკები
   გახსნამდე არ იხატება — სერვერი მათ შიგთავსს ისედაც არ აგზავნის.
   ============================================================ */

type Tab = 'all' | 'photos' | 'videos' | 'albums'

type Grouping = 'none' | 'album'

const TABS: { key: Tab; icon: typeof Image }[] = [
  { key: 'all', icon: LayoutGrid },
  { key: 'photos', icon: Image },
  { key: 'videos', icon: Film },
  { key: 'albums', icon: Folders },
]

/** ჩანართი → ბადის სახეობა („ყველა" — ორივე) */
const KIND_OF: Record<Exclude<Tab, 'albums'>, 'photo' | 'video' | undefined> = {
  all: undefined,
  photos: 'photo',
  videos: 'video',
}

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
  const tab = (TABS.some((x) => x.key === params.get('tab')) ? params.get('tab') : 'all') as Tab
  const grouping: Grouping = params.get('group') === 'album' ? 'album' : 'none'
  const uploader = useRef<PersonalUploaderHandle>(null)

  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(false)
  /** ჩანართის სახეობა — ატვირთვა და გადათრევა მას მიჰყვება */
  const only = tab === 'photos' ? 'photo' : tab === 'videos' ? 'video' : undefined

  /** ნაგულისხმევი მნიშვნელობა მისამართში არ იწერება */
  const setParam = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params)
    if (value === fallback) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

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
    <Link to="/personal/people" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
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

      {/* დამატებითი ველები ადამიანზე (თვითონ ინახავს თავს; ველის გარეშე არ ჩანს) */}
      <CustomFieldsCard module="personal" recordId={person.id} className="mb-5" />

      {/* ჩანართები და შიგთავსი — მთლიანად გადათრევის სამიზნე (ფაილი ამ პიროვნებას ეკუთვნის) */}
      <PersonalUploader ref={uploader} personId={person.id} only={only}>
      <div className="mb-4 flex flex-wrap items-end gap-3" data-testid="person-tabs">
        <div className="min-w-0 flex-1">
        <CutTabs
          options={TABS.map(({ key, icon }) => ({
            key,
            icon,
            label: t(`personal.tabs.${key}`),
            count:
              key === 'all'
                ? person.photos + person.videos
                : key === 'photos'
                  ? person.photos
                  : key === 'videos'
                    ? person.videos
                    : person.albums,
          }))}
          value={tab}
          onChange={(key) => setParam('tab', key, 'all')}
        />
        </div>
        {/* ჩანართის საკუთარი ღილაკი */}
        <div data-testid="person-tab-action">
          {tab === 'albums' ? <AddAlbumButton personId={person.id} /> : <PersonalUploadButton only={only} onClick={() => setUploading(true)} />}
        </div>
      </div>

      {tab !== 'albums' ? (
        <>
          <div className="mb-4" data-testid="person-grouping">
            <CutTabs
              layout="inline"
              size="sm"
              label={t('personal.groups.label')}
              options={[
                { key: 'none', label: t('personal.groups.none'), icon: LayoutGrid },
                { key: 'album', label: t('personal.groups.album'), icon: Folders },
              ]}
              value={grouping}
              onChange={(key) => setParam('group', key, 'none')}
            />
          </div>

          {grouping === 'album' ? (
            <PersonalGroups
              key={tab}
              by="album"
              filters={{ person_id: person.id, kind: KIND_OF[tab] }}
              primary={{ id: person.cover_media_id, set: (mediaId) => setCover.mutate(mediaId) }}
            />
          ) : (
            <PersonalMediaGrid
              filters={{ person_id: person.id, kind: KIND_OF[tab] }}
              primary={{ id: person.cover_media_id, set: (mediaId) => setCover.mutate(mediaId) }}
              emptyText={t(
                tab === 'photos' ? 'personal.person.noPhotos' : tab === 'videos' ? 'personal.person.noVideos' : 'personal.person.noMedia',
              )}
            />
          )}
        </>
      ) : (
        <section>
          {albumsQ.isLoading ? (
            <GalleryStackSkeleton aspect="wide" count={4} />
          ) : (albumsQ.data ?? []).length ? (
            <PersonalAlbumCards albums={albumsQ.data ?? []} showOwner={false} />
          ) : (
            <EmptyState icon={<Folders className="size-6" />} title={t('personal.person.noAlbums')} />
          )}
        </section>
      )}
      </PersonalUploader>

      {uploading && <PersonalUploadDialog personId={person.id} only={only} onClose={() => setUploading(false)} />}
      {editing && <PersonDialog person={person} onClose={() => setEditing(false)} />}
      {deleting && (
        <PersonalDeleteDialog target={{ kind: 'person', person }} onClose={() => setDeleting(false)} onDeleted={() => navigate('/personal/people')} />
      )}
    </PageContainer>
  )
}
