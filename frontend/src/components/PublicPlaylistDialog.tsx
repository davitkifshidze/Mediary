import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ExternalLink, ListMusic, Loader2, Music, Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import { fetchPublicPlaylist, type PublicCard } from '@/api/publicProfile'
import type { VideoPlatform } from '@/api/videos'
import { storageUrl } from '@/lib/api'
import { isAllowedEmbed, type EmbedEvent } from '@/lib/embed'
import type { PlayerItem } from '@/lib/player'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/videoDuration'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { ModalShell } from '@/components/ui/modal-shell'
import { ShowMore } from '@/components/ui/show-more'
import { PlayerStage } from '@/components/PlayerStage'

/* ============================================================
   **საჯარო ფლეილისტის შიგთავსი** (Tasks §33.2).

   შენი სიტყვები: „ფლეილისტი თუ გაზიარებული მაქვს, შიდა კონტენტი რატომ არ
   არის საჯარო? უნდა ჩანდეს — და რა შედის იქ."

   ⚠️ **დაკვრა აქვეა და არა საერთო ფლეერში.** `PlayerProvider` `Protected`-ის
   შიგნით ცხოვრობს, საჯარო პროფილი კი მის გარეთაა — ე.ი. `usePlayer()` აქ არ
   არსებობს (§32-ის ვიდეოების იგივე მიზეზი). სცენა კი **იგივეა**: `PlayerStage`
   თავისით დგას — allowlist, `postMessage`-ის დეკოდერი და `origin`-ის შემოწმება
   ერთხელაა დაწერილი. ⚠️ **§35-მა (YouTube-ის სტილის დამკვრელი) ეს ფანჯარა
   განზრახ დატოვა**: გვერდითა პანელი `PlayerProvider`-ის ნაწილია, ე.ი. აქ
   ვერ იცხოვრებდა; აქვე `PlayerStage`-ის ახალი პირობაც მოქმედებს —
   ავტოდაკვრა ფრეიმის დაბადების მომენტის `playing`-ს მიჰყვება.

   ⚠️ **`kind: 'link'`** — სტუმრის დაკვრა მფლობელის `play_count`-ს არ უნდა
   ზრდიდეს (და ის endpoint მფლობელის სესიას ითხოვს). `PlayerItem.kind`-ის
   „მრიცხველი არ არსებობს" მნიშვნელობა ზუსტად ესაა.

   ⚠️ **„შემდეგი" ჩატვირთულ ნაწილს არ ემორჩილება**: სია გვერდებადაა (100-100),
   ბოლოს მიღწევისას მომდევნო გვერდი ჩამოიტვირთება და დაკვრა გრძელდება —
   თორემ 150-სიმღერიანი ფლეილისტი მე-100-ზე ჩუმად გაჩერდებოდა.
   ============================================================ */

const PLATFORMS: readonly VideoPlatform[] = ['youtube', 'vimeo', 'dailymotion', 'file', 'other']

/** რამდენ გვერდს ვკითხულობთ ზედიზედ დასაკრავის საძებნად — ხარვეზზე უსასრულო ციკლი არ უნდა იყოს */
const MAX_PAGE_HOPS = 20

function toItem(card: PublicCard): PlayerItem {
  const platform = PLATFORMS.find((p) => p === card.platform) ?? 'other'

  return {
    kind: 'link',
    id: card.id,
    title: card.title_en || card.title_ka || '—',
    subtitle: card.subtitle ?? null,
    url: card.url ?? '',
    embedUrl: card.embed_url ?? null,
    platform,
    thumbnail: storageUrl(card.image),
    duration: card.duration ?? null,
  }
}

/** ⚠️ ჰოსტი აქაც მოწმდება (`lib/embed.ts`) — სერვერის `embed_url`-საც არ ვენდობით ბრმად */
function playable(item: PlayerItem): boolean {
  if (!item.url) return false
  return item.platform === 'file' || isAllowedEmbed(item.embedUrl)
}

function nextPlayable(items: PlayerItem[], after: number): number | null {
  for (let i = after + 1; i < items.length; i++) if (playable(items[i])) return i
  return null
}

function prevPlayable(items: PlayerItem[], before: number): number | null {
  for (let i = before - 1; i >= 0; i--) if (playable(items[i])) return i
  return null
}

export function PublicPlaylistDialog({
  username,
  playlist,
  onClose,
}: {
  username: string
  /** სიის ბარათი — სახელი და რიცხვი მაშინვე ჩანს, სანამ შიგთავსი მოვა */
  playlist: PublicCard
  onClose: () => void
}) {
  const { t } = useTranslation()

  const query = useInfiniteQuery({
    queryKey: ['public-playlist', username, playlist.id],
    queryFn: ({ pageParam }) => fetchPublicPlaylist(username, playlist.id, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined,
    retry: false,
  })

  const pages = query.data?.pages
  const cards = useMemo(() => (pages ?? []).flatMap((page) => page.data), [pages])
  const items = useMemo(() => cards.map(toItem), [cards])
  const total = pages?.[0]?.meta.total ?? playlist.songs_count ?? 0
  const title = pages?.[0]?.playlist.title_en || playlist.title_en || '—'

  const [index, setIndex] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)

  /**
   * ჩართვის მრიცხველი — `lib/player.tsx`-ის წესი: YouTube `ended`-ს ზოგჯერ
   * ორჯერ გზავნის, ე.ი. თითო ჩართვაზე მხოლოდ პირველი ითვლება, თორემ ერთი
   * სიმღერა გადაიხტებოდა.
   */
  const [seq, setSeq] = useState(0)
  const endedSeq = useRef(-1)

  const current = index === null ? null : (items[index] ?? null)

  const start = (at: number) => {
    setIndex(at)
    setPlaying(true)
    setSeq((n) => n + 1)
  }

  const next = async () => {
    if (index === null) return

    let list = items
    let more = query.hasNextPage
    let found = nextPlayable(list, index)

    for (let hop = 0; found === null && more && hop < MAX_PAGE_HOPS; hop++) {
      const res = await query.fetchNextPage()
      list = (res.data?.pages ?? []).flatMap((page) => page.data).map(toItem)
      more = res.hasNextPage
      found = nextPlayable(list, index)
    }

    // სიის ბოლო — ვჩერდებით; თავიდან ჩართვა ერთ დაწკაპუნებაშია
    if (found === null) setPlaying(false)
    else start(found)
  }

  const prev = () => {
    if (index === null) return
    const found = prevPlayable(items, index)
    if (found !== null) start(found)
  }

  const report = (event: EmbedEvent) => {
    if (event === 'playing') setPlaying(true)
    else if (event === 'paused') setPlaying(false)
    else if (event === 'ended') {
      if (endedSeq.current === seq) return
      endedSeq.current = seq
      void next()
    }
  }

  const first = nextPlayable(items, -1)
  const hasNext = index !== null && (nextPlayable(items, index) !== null || !!query.hasNextPage)
  const hasPrev = index !== null && prevPlayable(items, index) !== null

  return (
    <ModalShell
      title={title}
      onClose={onClose}
      wide
      aside={
        first !== null && (
          <Button size="sm" onClick={() => start(first)}>
            <Play className="size-4" />
            {t('playback.playAll')}
          </Button>
        )
      }
    >
      {current && index !== null && (
        <section className="mb-5">
          <PlayerStage item={current} playing={playing} onEvent={report} className="aspect-video w-full" />

          <div className="mt-3 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{current.title}</p>
              {current.subtitle && <p className="truncate text-xs text-muted-foreground">{current.subtitle}</p>}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {t('playback.position', { index: index + 1, total })}
            </span>
            <Button variant="ghost" size="icon" disabled={!hasPrev} onClick={prev} aria-label={t('playback.prev')}>
              <SkipBack className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPlaying((v) => !v)}
              aria-label={playing ? t('playback.pause') : t('playback.play')}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={!hasNext || query.isFetchingNextPage}
              onClick={() => void next()}
              aria-label={t('playback.next')}
            >
              <SkipForward className="size-4" />
            </Button>
          </div>
        </section>
      )}

      {query.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : query.isError ? (
        // ⚠️ შუა გზაზე პირადი გახდა ან ურნაში გადავიდა — 404-ია და არა „ცარიელი"
        <EmptyState icon={<ListMusic className="size-6" />} title={t('playlists.notFound')} />
      ) : !items.length ? (
        <EmptyState icon={<ListMusic className="size-6" />} title={t('playlists.noSongs')} />
      ) : (
        <>
          <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {items.map((item, i) => {
              const canPlay = playable(item)
              const active = i === index

              return (
                <li
                  key={`${item.id}-${i}`}
                  className={cn('flex items-center gap-2 px-3 py-2', active && 'bg-secondary/60')}
                >
                  {/* ⚠️ წყაროს ბმული ღილაკის **გარეთაა** — ჩადგმული ინტერაქტიული
                      ელემენტი არასწორი HTML-ია და ერთი დაჭერა ორივეს გაუშვებდა */}
                  <button
                    type="button"
                    disabled={!canPlay}
                    onClick={() => start(i)}
                    aria-current={active ? 'true' : undefined}
                    className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left disabled:cursor-default"
                  >
                    <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {active && playing ? <Volume2 className="ml-auto size-3.5 text-primary" /> : i + 1}
                    </span>
                    <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="size-full object-cover"
                        />
                      ) : (
                        <Music className="size-4 text-muted-foreground" />
                      )}
                      {canPlay && (
                        <span className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
                          <Play className="size-4" />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      {item.subtitle && (
                        <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                      )}
                    </span>
                    {formatDuration(item.duration) && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatDuration(item.duration)}
                      </span>
                    )}
                  </button>

                  {!canPlay && item.url && <InfoHint info={t('playback.noEmbed')} />}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('playback.openSource')}
                      title={t('playback.openSource')}
                      className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </li>
              )
            })}
          </ol>

          <ShowMore
            shown={items.length}
            total={total}
            loading={query.isFetchingNextPage}
            onMore={() => void query.fetchNextPage()}
          />
        </>
      )}
    </ModalShell>
  )
}
