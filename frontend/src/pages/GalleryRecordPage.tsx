import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Globe, Images, Video } from 'lucide-react'
import { fetchGalleryDetail, type GalleryParentKind } from '@/api/gallery'
import { storageUrl } from '@/lib/api'
import { mediaOf, type MediaType } from '@/lib/media'
import { isMediaKey } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import { formatBytes } from '@/lib/utils'
import { GroupPhotos } from '@/components/gallery/GroupPhotos'
import { PosterImage } from '@/components/PosterImage'
import { RecordGallery } from '@/components/RecordGallery'
import { WebImageDialog } from '@/components/WebImageDialog'
import { WebVideoDialog } from '@/components/WebVideoDialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { PageContainer } from '@/components/ui/page'

/* ============================================================
   **ერთი ჩანაწერის გალერეა ცალკე გვერდად** — `/gallery/records/:type/:id` (§8.5).

   მოთხოვნა: „გარეთ იყოს ფილმების სექცია, რომელშიც შეგვიძლია შევიტანოთ
   ქვე-მსახიობების სექცია". სწორედ ეს გვერდია: ზემოთ ჩანაწერის საკუთარი
   კადრები/პოსტერები, ქვემოთ **მსახიობების ქვე-სექცია** დაჯგუფებული/არეული
   გადამრთველით, ბოლოს კი ვიდეო-ბმულები.

   ⚠️ **ჩანაწერის გვერდზე იგივე სექცია რჩება** (ტრეილერის ქვემოთ) — ეს მისი
   ჩანაცვლება არ არის: აქ გალერეიდან შემოდიხარ და უკან გალერეაში ბრუნდები,
   იქ კი ჩანაწერს ეცნობი.

   ⚠️ **არა-მედია მშობელს (სიმღერა · წიგნი · თამაში) შემადგენლობა არ აქვს**,
   ე.ი. `GET /gallery/{type}/{id}` მასზე არ არსებობს — იქ ბრტყელი ბადეა
   `owner=` ფილტრით. ერთი „უნივერსალური" endpoint-ის გაკეთება TMDB-ის
   ცნებებს (მსახიობი, tmdb_id) სიმღერაზეც გაავრცელებდა.
   ============================================================ */

export function GalleryRecordPage() {
  const { type, id } = useParams()
  /* ⚠️ სახელი ჯგუფის ბარათიდან მოდის: არა-მედია მშობელს დეტალის endpoint
     არ აქვს, ე.ი. სხვაგვარად ვებძებნა ცარიელი ველით გაიხსნებოდა. */
  const passedTitle = (useLocation().state as { title?: string } | null)?.title ?? ''
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const [webOpen, setWebOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)

  const recordId = Number(id)
  const media = isMediaKey(String(type)) ? (type as MediaType) : null

  const detailQ = useQuery({
    queryKey: ['gallery', media, recordId],
    queryFn: () => fetchGalleryDetail(media!, recordId),
    enabled: !!media && Number.isFinite(recordId),
  })

  const record = detailQ.data?.record
  const title =
    (lang === 'ka' ? record?.title_ka || record?.title_en : record?.title_en || record?.title_ka) ??
    ''

  const back = (
    <Link
      to="/gallery/records"
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {t('gallery.cut.records')}
    </Link>
  )

  /* ---------- არა-მედია მშობელი: ბრტყელი ბადე ---------- */
  if (!media) {
    const kind = String(type) as GalleryParentKind

    return (
      <PageContainer>
        {back}
        <GroupPhotos
          title={passedTitle || t('gallery.recordPhotos')}
          filters={{ owner: `${kind}:${recordId}` }}
          cacheKey={`${kind}:${recordId}`}
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => setWebOpen(true)}>
                <Globe className="size-4" />
                {t('web.searchPhotos')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setVideoOpen(true)}>
                <Video className="size-4" />
                {t('web.searchVideos')}
              </Button>
            </>
          }
        />

        {webOpen && (
          <WebImageDialog
            target={kind}
            id={recordId}
            initialQuery={passedTitle}
            title={t('web.searchPhotosFor', { name: passedTitle || t('gallery.recordPhotos') })}
            context={passedTitle ? { base: passedTitle, attachesTo: passedTitle } : undefined}
            onClose={() => setWebOpen(false)}
            onImported={() => qc.invalidateQueries({ queryKey: ['gallery-photos'] })}
          />
        )}
        {videoOpen && (
          <WebVideoDialog
            target={kind}
            id={recordId}
            initialQuery={passedTitle}
            title={t('web.searchVideosFor', { name: passedTitle || t('gallery.recordPhotos') })}
            onClose={() => setVideoOpen(false)}
          />
        )}
      </PageContainer>
    )
  }

  /* ---------- მედია-დომენი: სრული სექცია ---------- */
  return (
    <PageContainer>
      {back}

      <header className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
        <div className="h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
          <PosterImage src={storageUrl(record?.poster_path)} alt="" className="size-full object-cover" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {t(`nav.${media === 'movie' ? 'movies' : media === 'series' ? 'series' : 'anime'}`, media)}
          </p>
          <h1 className="truncate font-display text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            {record?.year && <span className="tabular-nums">{record.year}</span>}
            <span className="inline-flex items-center gap-1">
              <Images className="size-3.5" />
              {t('gallery.photos', {
                count: (detailQ.data?.images.length ?? 0) + (detailQ.data?.cast_images.length ?? 0),
              })}
            </span>
            {detailQ.data?.bytes ? <span>{formatBytes(detailQ.data.bytes)}</span> : null}
          </p>
        </div>

        <Link
          to={`${mediaOf(media).detailBase}/${recordId}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <ExternalLink className="size-4" />
          {t('gallery.openTheRecord')}
        </Link>
      </header>

      {/* ⚠️ **იგივე სექციაა, რაც ჩანაწერის გვერდზე** — ორი ასლი ერთ დღეს
          სხვადასხვა ქცევას მიიღებდა (მაგ. გადამრთველი მხოლოდ ერთგან). */}
      <RecordGallery type={media} id={recordId} bare />
    </PageContainer>
  )
}
