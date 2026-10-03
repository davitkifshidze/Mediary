import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, Video } from 'lucide-react'
import { fetchGalleryVideos, type GalleryParentKind } from '@/api/gallery'
import type { SerpImportTarget } from '@/api/web'
import { useModules } from '@/lib/modules'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { GalleryVideoList } from '@/components/gallery/GalleryVideoList'
import { GroupPhotos } from '@/components/gallery/GroupPhotos'
import { WebImageDialog } from '@/components/WebImageDialog'
import { WebVideoDialog } from '@/components/WebVideoDialog'

/* ============================================================
   **არა-მედია მშობლის გალერეა** (Tasks §22) — წიგნი, თამაში, ადგილი, ბუკმარკი (§36),
   პირადი მოდული: ჩანაწერის დეტალში ჩაშენებული იგივე ხედი, რაც
   `/gallery/records/{kind}/{id}` გვერდს აქვს.

   შენი სიტყვები: „წიგნზე გალერეის ჩამოტვირთვა იყოს სერჩით — ძებნიდე, როგორც
   ფილმებშია — და გალერეაში წიგნის პერსონაჟები იყოს ან რამე".

   ⚠️ **ფილმის `RecordGallery`-ს სხვა endpoint აქვს** (`/gallery/{type}/{id}` —
   TMDB-ის კადრები, მსახიობების ფოტოები, ჩამოტვირთვის დიალოგი); აქ ფოტოები
   `owner=book:12` ფილტრით მოდის (`GroupPhotos`), ვიდეოები — `/gallery/videos?owner=`.
   ორივე ერთ სახელქვეშაა — `RecordGallery` ტიპით არჩევს (§22.4).

   ⚠️ **გალერეის მოდულის გარეშე სექცია არ ქრება — ამბობს, რატომ არის ცარიელი**
   (§22.1): ვებიდან ჩამოტვირთული ფოტო `gallery_images`-ში ინახება და მოდულის
   მარშრუტები `module:gallery`-ს უკანაა.

   ⚠️ **ვებძებნის ნაგულისხმევი შეკითხვა და სწრაფი ჩიპები გამომძახებლისაა**
   (§22.2): წიგნზე „{სათაური} {ავტორი}" და „პერსონაჟები · ავტორი · ეკრანიზაცია ·
   ყდები · ილუსტრაციები" — ენა შინაარსის ენის პარამეტრით.
   ============================================================ */

export function ParentGallery({
  type,
  id,
  query,
  terms,
  title,
}: {
  type: GalleryParentKind
  id: number
  /** ვებძებნის საწყისი შეკითხვა — სათაური (+ ავტორი) */
  query: string
  /** სწრაფი ჩიპები შეკითხვისთვის (§22.2) */
  terms?: string[]
  /** ფოტოების ბლოკის სათაური; ნაგულისხმევი — ბეჯი „ვებიდან" */
  title?: string
}) {
  const { t } = useTranslation()
  const { has } = useModules()
  const qc = useQueryClient()
  const [webOpen, setWebOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)

  const enabled = has('gallery')
  const owner = `${type}:${id}`

  const videosQ = useQuery({
    queryKey: ['gallery-videos', owner],
    queryFn: () => fetchGalleryVideos({ owner, per_page: 50 }),
    enabled,
  })

  if (!enabled) {
    return (
      <p className="flex items-start gap-2 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground" data-testid="gallery-off">
        <span className="min-w-0 flex-1">
          {t('gallery.moduleOff')}{' '}
          <a href="/modules" className="text-primary hover:text-primary/70">
            {t('gallery.moduleOffLink')}
          </a>
        </span>
        <InfoHint info={t('gallery.moduleOffHint')} />
      </p>
    )
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['gallery-photos', owner] })
    qc.invalidateQueries({ queryKey: ['gallery-videos', owner] })
    qc.invalidateQueries({ queryKey: ['gallery-summary'] })
  }

  const label = query || t('gallery.recordPhotos')

  return (
    <div className="space-y-4" data-testid="parent-gallery">
      <GroupPhotos
        title={title ?? <Badge className="bg-primary/15 text-foreground">{t('gallery.webBadge')}</Badge>}
        filters={{ owner }}
        cacheKey={owner}
        categories
        emptyText={t('gallery.emptyRecord')}
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

      <GalleryVideoList videos={videosQ.data?.data ?? []} onChanged={invalidate} />

      {webOpen && (
        <WebImageDialog
          target={type as SerpImportTarget}
          id={id}
          initialQuery={query}
          title={t('web.searchPhotosFor', { name: label })}
          context={{ base: query, terms }}
          onClose={() => setWebOpen(false)}
          onImported={invalidate}
        />
      )}

      {videoOpen && (
        <WebVideoDialog
          target={type}
          id={id}
          initialQuery={query}
          title={t('web.searchVideosFor', { name: label })}
          onClose={() => setVideoOpen(false)}
          onSaved={invalidate}
        />
      )}
    </div>
  )
}
