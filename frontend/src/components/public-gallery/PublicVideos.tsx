import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ExternalLink, Loader2, Play, Video } from 'lucide-react'
import { fetchPublicGalleryVideos, type PublicGalleryVideo } from '@/api/publicProfile'
import type { VideoPlatform } from '@/api/videos'
import { isAllowedEmbed } from '@/lib/embed'
import { useContentLang } from '@/lib/settings'
import { formatDuration } from '@/lib/videoDuration'
import { EmptyState } from '@/components/ui/empty-state'
import { ModalShell } from '@/components/ui/modal-shell'
import { ShowMore } from '@/components/ui/show-more'
import { VideoEmbed } from '@/components/VideoEmbed'

/* ============================================================
   **საჯარო „ვიდეოები" — შენახული ვიდეო-ბმულები** (Tasks §32.2).

   მფლობელის `VideosCut`-ის სია: ესკიზი, სათაური, არხი და ვისზეა მიბმული.

   ⚠️ **ყურება ფანჯარაშია და არა საერთო ფლეერში.** ფლეერი (`PlayerProvider`)
   `Protected`-ის შიგნით ცხოვრობს, საჯარო პროფილი კი მის გარეთაა — ე.ი.
   `usePlayer()` აქ არ არსებობს. ⚠️ **§35-მა ეს განზრახ ასე დატოვა**:
   გლობალური დამკვრელი ჩართვას მფლობელის ჩანაწერზე ითვლის და სესიას
   ითხოვს, სტუმარს კი არც ერთი აქვს — ე.ი. აქ `VideoEmbed` ხატავს, იგივე
   allowlist-ით (`lib/embed.ts` ჰოსტს ხელახლა ამოწმებს — სერვერის `embed_url`-საც).

   ⚠️ **დაკვრადი არ არის → წყაროს საიტი** (`platform === 'other'`-ის წესი):
   შავი ყუთის ნაცვლად ცხადი ბმული.

   ⚠️ **ესკიზი დაშორებული URL-ია** (`thumbnail_url`) — `storageUrl()`-ს არ
   გადის და ბლარის გარეშე ჩანს (შენი პირობა).
   ============================================================ */

export function PublicVideos({ username }: { username: string }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const [watching, setWatching] = useState<PublicGalleryVideo | null>(null)

  const query = useInfiniteQuery({
    queryKey: ['public-gallery', username, 'videos'],
    queryFn: ({ pageParam }) => fetchPublicGalleryVideos(username, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined,
  })

  const videos = useMemo(() => (query.data?.pages ?? []).flatMap((page) => page.data), [query.data])
  const total = query.data?.pages[0]?.meta.total ?? 0

  if (query.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!videos.length) {
    return <EmptyState icon={<Video className="size-6" />} title={t('publicProfile.gallery.emptyVideos')} />
  }

  const ownerOf = (video: PublicGalleryVideo) =>
    video.owner
      ? (lang === 'ka' ? video.owner.title_ka || video.owner.title : video.owner.title || video.owner.title_ka)
      : null

  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((video) => {
          const playable = isAllowedEmbed(video.embed_url) || video.platform === 'file'
          const title = video.title ?? video.url

          return (
            <li
              key={video.id}
              className="flex gap-3 rounded-xl border border-border bg-card p-2.5 transition-colors hover:border-primary/50"
            >
              <button
                type="button"
                onClick={() => (playable ? setWatching(video) : window.open(video.url, '_blank', 'noopener,noreferrer'))}
                className="relative h-20 w-32 shrink-0 cursor-pointer overflow-hidden rounded-lg bg-muted"
                aria-label={title}
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
                <span className="absolute inset-0 grid place-items-center bg-black/25 text-white opacity-0 transition-opacity hover:opacity-100">
                  <Play className="size-6" />
                </span>
                {video.duration != null && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-medium tabular-nums text-white">
                    {formatDuration(video.duration)}
                  </span>
                )}
              </button>

              <div className="flex min-w-0 flex-1 flex-col">
                <p className="line-clamp-2 text-sm font-medium">{title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[video.channel, ownerOf(video)].filter(Boolean).join(' · ')}
                </p>

                <div className="mt-auto flex items-center gap-1 pt-1.5">
                  {playable && (
                    <button
                      type="button"
                      onClick={() => setWatching(video)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Play className="size-3.5" />
                      {t('publicProfile.gallery.watch')}
                    </button>
                  )}
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-3.5" />
                    {t('videos.openExternal')}
                  </a>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <ShowMore
        shown={videos.length}
        total={total}
        loading={query.isFetchingNextPage}
        onMore={() => query.fetchNextPage()}
      />

      {watching && (
        <ModalShell title={watching.title ?? watching.url} onClose={() => setWatching(null)} wide>
          <div className="mt-4">
            <VideoEmbed
              video={{
                url: watching.url,
                embed_url: watching.embed_url,
                title: watching.title ?? watching.url,
                platform: (watching.platform ?? 'other') as VideoPlatform,
              }}
            />
          </div>
        </ModalShell>
      )}
    </div>
  )
}
