import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowUpDown, Folders, Globe, Image, LayoutGrid, SquarePen, Trash2, UserRound, Video } from 'lucide-react'
import { fetchPersonalAlbum, isHidden, PERSONAL_KEY, updatePersonalAlbum } from '@/api/personal'
import { errorMessage } from '@/lib/errors'
import { countLabel, invalidatePersonal } from '@/lib/personal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/feedback'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { GalleryStackSkeleton } from '@/components/gallery/GalleryPhotoGrid'
import { PersonalAlbumDialog } from '@/components/personal/PersonalAlbumDialog'
import { PersonalDeleteDialog } from '@/components/personal/PersonalDeleteDialog'
import { PersonalLockActions, PersonalLockedScreen } from '@/components/personal/PersonalLock'
import { PersonalMediaGrid } from '@/components/personal/PersonalMediaGrid'
import { PersonalReorderDialog } from '@/components/personal/PersonalReorderDialog'
import { PersonalUploadButton, PersonalUploader, type PersonalUploaderHandle } from '@/components/personal/PersonalUploader'

/* ============================================================
   **ალბომის გვერდი — `/personal/albums/:id`.**

   ⚠️ ატვირთვა ალბომშივე ტვირთავს — სათაურის „ატვირთვა" ან ფაილის გადათრევა
   ბადეზე; პიროვნების ალბომზე ფოტო მის პიროვნებასაც ეკუთვნის (სერვერის
   ინვარიანტი). „უკან" — პიროვნების ალბომზე პიროვნების ალბომების ჩანართზე,
   „გარე" ალბომზე — ალბომების ჭრილზე.

   ⚠️ **შიდა გაყოფა: ყველა · ფოტოები · ვიდეოები** (`?kind=`) — ქვე-ალბომები არ
   არსებობს, ალბომი სახეობას არ ზღუდავს. „რიგის შეცვლა" მხოლოდ „ყველაზეა":
   ხელით რიგი ერთია ორივე სახეობისთვის.

   ⚠️ **ჩაკეტილი და დაუხსნელი ალბომი** — ბოქლომიანი გვერდი; ბადე,
   ატვირთვა და ღილაკები გახსნამდე არ ჩანს.
   ============================================================ */

export function PersonalAlbumPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const albumId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const kindParam = params.get('kind')
  const kind = kindParam === 'photo' || kindParam === 'video' ? kindParam : undefined
  const uploader = useRef<PersonalUploaderHandle>(null)

  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reordering, setReordering] = useState(false)

  const albumQ = useQuery({
    queryKey: [PERSONAL_KEY, 'album', albumId],
    queryFn: () => fetchPersonalAlbum(albumId),
    enabled: Number.isFinite(albumId),
    retry: false,
  })

  const setCover = useMutation({
    mutationFn: (mediaId: number) => updatePersonalAlbum(albumId, { cover_media_id: mediaId }),
    onSuccess: () => {
      invalidatePersonal(qc)
      toast({ title: t('personal.coverSet'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const album = albumQ.data
  const backTo = album?.person ? `/personal/people/${album.person.id}?tab=albums` : '/personal/albums'

  const back = (
    <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />
      {album?.person ? album.person.name : t('personal.cut.albums')}
    </Link>
  )

  if (albumQ.isLoading) {
    return (
      <PageContainer>
        <GalleryStackSkeleton count={4} />
      </PageContainer>
    )
  }

  if (!album) {
    return (
      <PageContainer>
        <div className="mb-4">{back}</div>
        <EmptyState icon={<Folders className="size-6" />} title={t('personal.album.notFound')} />
      </PageContainer>
    )
  }

  if (isHidden(album)) {
    return (
      <PageContainer>
        <PageHeader module="personal" title={album.name} before={back} />
        <PersonalLockedScreen kind="albums" record={album} summary={countLabel(t, album.photos, album.videos)} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        module="personal"
        title={album.name}
        subtitle={countLabel(t, album.photos, album.videos)}
        before={back}
        actions={
          <>
            <PersonalLockActions kind="albums" record={album} />
            <Button variant="edit" onClick={() => setEditing(true)}>
              <SquarePen className="size-4" />
              {t('actions.edit')}
            </Button>
            <Button variant="destructiveOutline" onClick={() => setDeleting(true)}>
              <Trash2 className="size-4" />
              {t('confirm.delete')}
            </Button>
            <PersonalUploadButton onClick={() => uploader.current?.open()} />
          </>
        }
      />

      {(album.description || album.person || album.visibility === 'public') && (
        <section className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm">
          {album.person && (
            <Link
              to={`/personal/people/${album.person.id}`}
              className="inline-flex items-center gap-1.5 font-medium hover:text-primary"
            >
              <UserRound className="size-4 text-muted-foreground" />
              {album.person.name}
            </Link>
          )}
          {album.visibility === 'public' && (
            <Badge className="gap-1">
              <Globe className="size-3" />
              {t('personal.album.publicBadge')}
            </Badge>
          )}
          {album.description && <p className="w-full whitespace-pre-line text-muted-foreground">{album.description}</p>}
        </section>
      )}

      {/* გაყოფა და ბადე — მთლიანად გადათრევის სამიზნე (ფაილი ამ ალბომში ჩავარდება) */}
      <PersonalUploader ref={uploader} albumId={album.id} personId={album.person_id}>
      <div className="mb-4" data-testid="album-kinds">
        <CutTabs
          layout="inline"
          size="sm"
          options={[
            { key: 'all', label: t('personal.kind.all'), icon: LayoutGrid, count: album.photos + album.videos },
            { key: 'photo', label: t('personal.kind.photo'), icon: Image, count: album.photos },
            { key: 'video', label: t('personal.kind.video'), icon: Video, count: album.videos },
          ]}
          value={kind ?? 'all'}
          onChange={(key) => {
            const next = new URLSearchParams(params)
            if (key === 'all') next.delete('kind')
            else next.set('kind', key)
            setParams(next, { replace: true })
          }}
        />
      </div>

      <PersonalMediaGrid
        filters={{ album_id: album.id, sort: 'manual', kind }}
        primary={{ id: album.cover_media_id, set: (mediaId) => setCover.mutate(mediaId) }}
        emptyText={t('personal.album.empty')}
        extraTools={
          !kind && album.photos + album.videos > 1 ? (
            <Button variant="outline" size="sm" onClick={() => setReordering(true)}>
              <ArrowUpDown className="size-3.5" />
              {t('personal.reorder.open')}
            </Button>
          ) : undefined
        }
      />
      </PersonalUploader>

      {reordering && <PersonalReorderDialog filters={{ album_id: album.id }} onClose={() => setReordering(false)} />}

      {editing && <PersonalAlbumDialog album={album} onClose={() => setEditing(false)} />}
      {deleting && (
        <PersonalDeleteDialog target={{ kind: 'album', album }} onClose={() => setDeleting(false)} onDeleted={() => navigate(backTo)} />
      )}
    </PageContainer>
  )
}
