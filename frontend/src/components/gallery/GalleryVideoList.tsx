import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Play, Trash2 } from 'lucide-react'
import { deleteGalleryVideo, type GalleryVideo } from '@/api/gallery'
import { isAllowedEmbed } from '@/lib/embed'
import { errorMessage } from '@/lib/errors'
import { usePlayer, type PlayerItem } from '@/lib/player'
import { formatDuration } from '@/lib/videoDuration'
import { Button } from '@/components/ui/button'
import { useConfirm, useToast } from '@/components/ui/feedback'
import type { VideoPlatform } from '@/api/videos'

/* ============================================================
   ჩანაწერზე/მსახიობზე შენახული **ვიდეო-ბმულები** (§8.1).

   ⚠️ **სექცია თვითონ ქრება, როცა ბმული არ არის** — ცარიელი „ვიდეოები"
   სათაური ყოველ ჩანაწერზე ზედმეტ ხმაურს ქმნიდა; ძებნის ღილაკი ისედაც
   ზემოთაა.

   ⚠️ **დაკვრა საერთო დამკვრელშია** (§7.2) — გვერდის გადართვა დაკვრას არ
   წყვეტს. ჩაუშენებელი პლატფორმა ბმულით იხსნება და ამას ცხადად ამბობს.
   ============================================================ */

export function GalleryVideoList({
  videos,
  onChanged,
}: {
  videos: GalleryVideo[]
  onChanged?: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { toast } = useToast()
  const player = usePlayer()

  const remove = useMutation({
    mutationFn: (id: number) => deleteGalleryVideo(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gallery-videos'] })
      onChanged?.()
      toast({ title: t('gallery.videoDeleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (!videos.length) return null

  const toItem = (video: GalleryVideo): PlayerItem => ({
    // ⚠️ `link` — მრიცხველი არ არსებობს (ბმული `videos` ცხრილში არ დევს)
    kind: 'link',
    id: video.id,
    title: video.title ?? video.url,
    subtitle: video.channel,
    url: video.url,
    embedUrl: video.embed_url,
    platform: (video.platform ?? 'other') as VideoPlatform,
    thumbnail: video.thumbnail_url,
    duration: video.duration,
  })

  return (
    <section className="mt-6 border-t border-border pt-5">
      <h3 className="mb-3 font-mono text-sm uppercase tracking-wider text-muted-foreground">
        {t('gallery.videosTitle')}
        <span className="ml-2 normal-case tracking-normal">{videos.length}</span>
      </h3>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((video, index) => {
          const playable = isAllowedEmbed(video.embed_url)

          return (
            <li
              key={video.id}
              className="flex gap-3 rounded-xl border border-border bg-background p-2.5"
            >
              <button
                type="button"
                aria-label={video.title ?? video.url}
                onClick={() =>
                  playable
                    ? player.play(videos.map(toItem), index, t('gallery.videosTitle'))
                    : window.open(video.url, '_blank', 'noreferrer')
                }
                className="relative h-16 w-24 shrink-0 cursor-pointer overflow-hidden rounded-lg bg-muted"
              >
                {video.thumbnail_url && (
                  <img
                    src={video.thumbnail_url}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="size-full object-cover"
                  />
                )}
                <span className="absolute inset-0 grid place-items-center bg-black/25 text-white opacity-0 transition-opacity hover:opacity-100">
                  <Play className="size-5" />
                </span>
                {video.duration != null && (
                  <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[10px] tabular-nums text-white">
                    {formatDuration(video.duration)}
                  </span>
                )}
              </button>

              <div className="flex min-w-0 flex-1 flex-col">
                <p className="line-clamp-2 text-xs font-medium">{video.title ?? video.url}</p>
                <p className="truncate text-[11px] text-muted-foreground">{video.channel}</p>
                <div className="mt-auto flex items-center gap-1 pt-1">
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="size-3" />
                    {t('photos.infoOpen')}
                  </a>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-6 px-1.5 text-destructive"
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
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
