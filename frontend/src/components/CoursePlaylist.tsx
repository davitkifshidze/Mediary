import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, ListVideo, Loader2, Play, RefreshCw } from 'lucide-react'
import { fetchCoursePlaylist, type Course, type CoursePlaylist, type CoursePlaylistItem } from '@/api/courses'
import { errorMessage } from '@/lib/errors'
import { LIST_PAGE_SIZE, useClientPages } from '@/lib/paged'
import { usePlayer, type PlayerItem } from '@/lib/player'
import { formatDuration } from '@/lib/videoDuration'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { useToast } from '@/components/ui/feedback'
import { DetailSection } from '@/components/DetailHero'

/* ============================================================
   **კურსის ფანჯარა — „ვიდეოები (N)"**.

   შენი სიტყვები: „ინფო წამოიღო ქვე-ვიდეოების, ფლეილისტში რაც შედის, და
   გამომიტანო". სია სერვერიდან მოდის (`GET /courses/{id}/playlist` — YouTube
   Data API შენი გასაღებით, მის გარეშე `yt-dlp`; ქეში 24 სთ, „განახლება" —
   ახლავე).

   ⚠️ **ვიდეო ჩანაწერი არ არის** — არც მონიშვნა აქვს და არც პროგრესი:
   „გაკვეთილები" დახურული გადაწყვეტილებაა (`CLAUDE.md`). ეს ჩვენებაა.

   ⚠️ **დაჭერა — დაკვრა რიგად** (მოტივტივე ჩარჩოში, აქედან ბოლომდე;
   კურსის ფანჯარა ვიდეოს ფანჯარა არ არის, ე.ი. ადგილზე დაკვრის ადგილი
   არ აქვს); გვერდითა ისარი — YouTube-ზე გახსნა.
   ⚠️ რიგის ერთეული `link`-ია (მრიცხველი არ არსებობს) და id
   **უარყოფითია**: ბაზის ჩანაწერის id-ს (`link-12`) ვერასდროს დაემთხვევა.
   ============================================================ */

function playerItem(item: CoursePlaylistItem, list: CoursePlaylist, fallback: string): PlayerItem {
  return {
    kind: 'link',
    id: -item.position,
    title: item.title ?? `#${item.position}`,
    subtitle: list.title ?? fallback,
    url: item.url,
    embedUrl: item.embed_url,
    platform: 'youtube',
    thumbnail: item.thumbnail,
    duration: item.duration,
    href: null,
  }
}

export function CoursePlaylistSection({ course }: { course: Course }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const player = usePlayer()
  const [refreshing, setRefreshing] = useState(false)

  const key = ['course-playlist', course.id, course.url]
  const q = useQuery({
    queryKey: key,
    queryFn: () => fetchCoursePlaylist(course.id),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const list = q.data ?? null
  const items = list?.items ?? []
  const { shown, pagination } = useClientPages(items, LIST_PAGE_SIZE)

  const refresh = async () => {
    setRefreshing(true)
    try {
      qc.setQueryData(key, await fetchCoursePlaylist(course.id, true))
    } catch (e) {
      toast({ title: errorMessage(e), variant: 'error' })
    } finally {
      setRefreshing(false)
    }
  }

  // სერვერმა თქვა „ფლეილისტი არ არის" — სექცია არ იხატება
  if (q.isSuccess && !list) return null

  const playing = player.current?.kind === 'link' ? player.current.url : null
  const total = formatDuration(list?.total_duration)

  return (
    <DetailSection
      icon={<ListVideo className="size-4 text-muted-foreground" />}
      title={t('courses.playlist.title', { count: list?.count ?? 0 })}
      hint={t('courses.playlist.hint')}
      action={
        <div className="flex items-center gap-3">
          {total && (
            <span className="text-xs text-muted-foreground" data-testid="playlist-total">
              {t('courses.playlist.total', { duration: total })}
            </span>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing || q.isLoading}>
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {t('courses.playlist.refresh')}
          </Button>
        </div>
      }
    >
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('api.loading')}</p>
      ) : q.isError ? (
        <EmptyState className="py-6" icon={<ListVideo className="size-5" />} title={errorMessage(q.error)} />
      ) : items.length === 0 ? (
        <EmptyState className="py-6" icon={<ListVideo className="size-5" />} title={t('courses.playlist.empty')} />
      ) : (
        <>
          <ol className="space-y-1" data-testid="playlist-items">
            {shown.map((item) => {
              const current = playing === item.url
              return (
                <li key={item.position} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => player.play(items.map((it) => playerItem(it, list!, course.title)), item.position - 1, `course-${course.id}`)}
                    aria-current={current || undefined}
                    className={cn(
                      'flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted',
                      current && 'bg-secondary',
                    )}
                  >
                    <span className="w-7 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{item.position}</span>
                    <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                      <img src={item.thumbnail} alt="" loading="lazy" className="size-full object-cover" />
                      {current && (
                        <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                          <Play className="size-4" />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{item.title ?? '—'}</span>
                    {item.duration != null && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDuration(item.duration)}</span>
                    )}
                  </button>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('courses.playlist.openOnYoutube')}
                    title={t('courses.playlist.openOnYoutube')}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                </li>
              )
            })}
          </ol>
          <Pagination {...pagination} className="mt-3" />
        </>
      )}
    </DetailSection>
  )
}
