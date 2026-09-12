import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Play, Trash2, Video } from 'lucide-react'
import {
  deleteGalleryVideo,
  fetchGalleryVideos,
  type GalleryVideo as GalleryVideoItem,
} from '@/api/gallery'
import { isAllowedEmbed } from '@/lib/embed'
import { errorMessage } from '@/lib/errors'
import { usePlayer, type PlayerItem } from '@/lib/player'
import { formatDuration } from '@/lib/videoDuration'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { Pager } from '@/components/gallery/GroupPhotos'
import type { VideoPlatform } from '@/api/videos'

/* ============================================================
   შენახული **ვიდეო-ბმულები** (§8.1/§8.4).

   ⚠️ **ეს ვიდეოს მოდული არ არის.** ვიდეოს მოდული შენი ბიბლიოთეკაა
   (ტიპები, ძებნა, სტატისტიკა); აქ კი ჩანაწერზე ან **მსახიობზე** მიბმული
   ბმულებია, რომლებიც ვებძებნამ მოიტანა — ე.ი. გალერეის ნაწილია.

   ⚠️ **დაკვრა საერთო დამკვრელშია** (§7.2): გვერდის გადართვა დაკვრას არ
   წყვეტს. `kind: 'link'` ნიშნავს, რომ მრიცხველი არ არსებობს — ბმულს
   `videos` ცხრილში ჩანაწერი არ აქვს.

   ⚠️ **ესკიზი დაშორებული URL-ია** და ბლარის გარეშე ჩანს (შენი პირობა).
   ============================================================ */

export function VideosCut() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { toast } = useToast()
  const player = usePlayer()
  const [page, setPage] = useState(1)

  const query = useQuery({
    queryKey: ['gallery-videos', page],
    queryFn: () => fetchGalleryVideos({ page, per_page: 24 }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteGalleryVideo(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gallery-videos'] })
      qc.invalidateQueries({ queryKey: ['gallery-summary'] })
      toast({ title: t('gallery.videoDeleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const items = query.data?.data ?? []
  const meta = query.data?.meta

  /** ერთი ბმული → დამკვრელის ერთეული */
  const toItem = (video: GalleryVideoItem): PlayerItem => ({
    kind: 'link',
    id: video.id,
    title: video.title ?? video.url,
    subtitle: video.channel ?? video.owner.title ?? null,
    url: video.url,
    embedUrl: video.embed_url,
    platform: (video.platform ?? 'other') as VideoPlatform,
    thumbnail: video.thumbnail_url,
    duration: video.duration,
  })

  const playFrom = (index: number) =>
    player.play(items.map(toItem), index, t('gallery.videosTitle'))

  if (query.isLoading) {
    return (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="h-24 animate-pulse rounded-xl border border-border bg-muted/60" />
        ))}
      </ul>
    )
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={<Video className="size-6" />}
        title={t('gallery.noVideos')}
        hint={t('gallery.noVideosHint')}
      />
    )
  }

  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((video, index) => {
          const playable = isAllowedEmbed(video.embed_url)

          return (
            <li
              key={video.id}
              className="flex gap-3 rounded-xl border border-border bg-card p-2.5 transition-colors hover:border-primary/50"
            >
              <button
                type="button"
                onClick={() => (playable ? playFrom(index) : window.open(video.url, '_blank', 'noreferrer'))}
                className="relative h-20 w-32 shrink-0 cursor-pointer overflow-hidden rounded-lg bg-muted"
                aria-label={video.title ?? video.url}
              >
                {video.thumbnail_url && (
                  <img
                    src={video.thumbnail_url}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="size-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                )}
                <span
                  className={cn(
                    'absolute inset-0 grid place-items-center bg-black/25 text-white opacity-0 transition-opacity hover:opacity-100',
                  )}
                >
                  <Play className="size-6" />
                </span>
                {video.duration != null && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-medium tabular-nums text-white">
                    {formatDuration(video.duration)}
                  </span>
                )}
              </button>

              <div className="flex min-w-0 flex-1 flex-col">
                <p className="line-clamp-2 text-sm font-medium">{video.title ?? video.url}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[video.channel, video.owner.title].filter(Boolean).join(' · ')}
                </p>

                <div className="mt-auto flex items-center gap-1 pt-1.5">
                  {video.owner.kind === 'actor' ? (
                    <Link
                      to={`/actors/${video.owner.id}`}
                      className="rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {t('gallery.actorPage')}
                    </Link>
                  ) : (
                    <Link
                      to={`/gallery/records/${video.owner.kind}/${video.owner.id}`}
                      className="rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {t('gallery.openRecord')}
                    </Link>
                  )}

                  <a
                    href={video.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="size-3.5" />
                    {t('photos.infoOpen')}
                  </a>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7 px-2 text-xs text-destructive"
                    onClick={async () => {
                      const ok = await confirm({
                        title: t('gallery.videoDeleteTitle'),
                        description: t('gallery.videoDeleteHint'),
                        confirmText: t('confirm.delete'),
                        variant: 'destructive',
                      })
                      if (ok) remove.mutate(video.id)
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {meta && meta.last_page > 1 && (
        <Pager page={meta.page} lastPage={meta.last_page} total={meta.total} onChange={setPage} />
      )}
    </div>
  )
}
