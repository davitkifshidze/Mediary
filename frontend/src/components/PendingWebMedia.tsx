import { useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Play, Video, X } from 'lucide-react'
import type { SerpImage, SerpImportTarget } from '@/api/web'
import type { GalleryParentKind } from '@/api/gallery'
import type { PendingWeb } from '@/lib/pendingWeb'
import { formatDuration } from '@/lib/videoDuration'
import { Button } from '@/components/ui/button'
import { WebImageDialog } from '@/components/WebImageDialog'
import { WebVideoDialog } from '@/components/WebVideoDialog'

/* ============================================================
   **„ვებიდან" — ახალი ჩანაწერის მომლოდინე ფოტოები და ვიდეოები**.

   იგივე ორი ძებნის ფანჯარაა, რაც ჩანაწერის გალერეაში (`ParentGallery`), იგივე
   საწყისი შეკითხვითა და ჩიპებით — ოღონდ `onPick` რეჟიმში: მონიშნული აქ
   „მომლოდინედ" ჩანს (ესკიზი/სათაური, ✕) და ჩანაწერის შექმნისთანავე იგზავნება
   (`lib/pendingWeb.ts`). `PendingFilesSection`-ის „ფაილების" ბლოკის გვერდით დგას.
   ============================================================ */

const keyOf = (image: SerpImage) => image.original ?? image.thumbnail ?? image.link ?? ''

export function PendingWebMedia({
  target,
  query,
  terms,
  value,
  onChange,
}: {
  target: SerpImportTarget & GalleryParentKind
  /** ძებნის საწყისი შეკითხვა (ბუკმარკზე — სათაური + დომენი) */
  query: string
  terms?: string[]
  value: PendingWeb
  onChange: Dispatch<SetStateAction<PendingWeb>>
}) {
  const { t } = useTranslation()
  const [photosOpen, setPhotosOpen] = useState(false)
  const [videosOpen, setVideosOpen] = useState(false)
  const count = value.images.length + value.videos.length
  const name = query || t('gallery.recordPhotos')

  return (
    <div className="rounded-xl border border-border p-3" data-testid="pending-web">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <Globe className="size-4 text-muted-foreground" />
          {t('gallery.webBadge')}
          {count > 0 && <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs leading-none tabular-nums">{count}</span>}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPhotosOpen(true)}>
            <Globe className="size-3.5" />
            {t('web.searchPhotos')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setVideosOpen(true)}>
            <Video className="size-3.5" />
            {t('web.searchVideos')}
          </Button>
        </div>
      </div>

      {value.images.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" data-testid="pending-web-images">
          {value.images.map((image) => (
            <li key={keyOf(image)} className="relative size-16 overflow-hidden rounded-md border border-border bg-muted">
              <img
                src={image.thumbnail ?? image.original ?? ''}
                alt={image.title ?? ''}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="size-full object-cover"
              />
              <button
                type="button"
                aria-label={t('actions.delete')}
                onClick={() => onChange((cur) => ({ ...cur, images: cur.images.filter((i) => keyOf(i) !== keyOf(image)) }))}
                className="absolute right-0.5 top-0.5 grid size-5 cursor-pointer place-items-center rounded bg-black/60 text-white"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {value.videos.length > 0 && (
        <ul className="mt-3 space-y-1.5" data-testid="pending-web-videos">
          {value.videos.map((video) => (
            <li key={video.link} className="flex items-center gap-2 text-sm">
              <Play className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{video.title ?? video.link}</span>
              {video.duration != null && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDuration(video.duration)}</span>
              )}
              <button
                type="button"
                aria-label={t('actions.delete')}
                onClick={() => onChange((cur) => ({ ...cur, videos: cur.videos.filter((v) => v.link !== video.link) }))}
                className="shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {photosOpen && (
        <WebImageDialog
          target={target}
          initialQuery={query}
          title={t('web.searchPhotosFor', { name })}
          context={{ base: query, terms }}
          onPick={(images) =>
            onChange((cur) => {
              const known = new Set(cur.images.map(keyOf))
              return { ...cur, images: [...cur.images, ...images.filter((i) => !known.has(keyOf(i)))] }
            })
          }
          onClose={() => setPhotosOpen(false)}
        />
      )}

      {videosOpen && (
        <WebVideoDialog
          target={target}
          initialQuery={query}
          title={t('web.searchVideosFor', { name })}
          picked={value.videos.map((v) => v.link)}
          onPick={(video) =>
            onChange((cur) => (cur.videos.some((v) => v.link === video.link) ? cur : { ...cur, videos: [...cur.videos, video] }))
          }
          onClose={() => setVideosOpen(false)}
        />
      )}
    </div>
  )
}
