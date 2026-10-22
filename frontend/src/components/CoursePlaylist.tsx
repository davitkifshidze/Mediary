import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, FolderOpen, FolderPlus, ListVideo, Loader2, Play, RefreshCw, TriangleAlert } from 'lucide-react'
import {
  addPlaylistVideos,
  fetchCoursePlaylist,
  fetchPlaylistPlan,
  type Course,
  type CoursePlaylist,
  type CoursePlaylistItem,
  type CoursePlaylistVideo,
} from '@/api/courses'
import { downloadBusy } from '@/api/videos'
import { errorMessage, translateCode } from '@/lib/errors'
import { formatBytes } from '@/lib/utils'
import { useModules } from '@/lib/modules'
import { LIST_PAGE_SIZE, useClientPages } from '@/lib/paged'
import { usePlayer, type PlayerItem } from '@/lib/player'
import { formatDuration } from '@/lib/videoDuration'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { useToast } from '@/components/ui/feedback'
import { DetailSection } from '@/components/DetailHero'
import { PlayerSpot } from '@/components/PlayerSpot'
import { PlaylistImportDialog, type PlaylistImportChoice } from '@/components/PlaylistImportDialog'

/* ============================================================
   **კურსის ფანჯარა — „ვიდეოები (N)"**.

   შენი სიტყვები: „ინფო წამოიღო ქვე-ვიდეოების, ფლეილისტში რაც შედის, და
   გამომიტანო". სია სერვერიდან მოდის (`GET /courses/{id}/playlist` — YouTube
   Data API შენი გასაღებით, მის გარეშე `yt-dlp`; ქეში 24 სთ, „განახლება" —
   ახლავე).

   ⚠️ **ელემენტი თავისთავად ჩანაწერი არ არის** — პროგრესი არ აქვს
   („გაკვეთილები" დახურული გადაწყვეტილებაა). ჩექბოქსით არჩეული კი ვიდეოების
   მოდულში ემატება — კურსი იქ „საქაღალდეა" (`POST /courses/{id}/playlist/videos`,
   ტიპი და სტატუსი ერთხელ — `PlaylistImportDialog`); უკვე დამატებულს ჩექბოქსის
   გვერდით ბეჯი აქვს. „ყველას მონიშვნა" **ყველა** ელემენტს ეხება და არა გვერდს.
   „ჩამოტვირთვა" — ჩანაწერები + ლოკალური ასლი ერთ ფონურ რიგად; დადასტურებამდე
   გეგმა („N ვიდეო · ~X GB · თავისუფალია Y"), სანამ რიგი მუშაობს — სია
   თვითონ ახლდება, ჩავარდნილი (მაგ. კვოტაზე) მიზეზით ჩანს.

   ⚠️ **ვიდეო კურსის ფანჯარაში უკრავს** — ვიდეოების ფანჯრის წესით: სიის ზემოთ
   16:9 ადგილი (`PlayerSpot`), დაჭერა რიგს აქედან ბოლომდე უშვებს; „გატანა"
   ჩარჩოში ამაგრებს და ფანჯარას ხურავს, ფანჯრის დახურვა გაუტანელ ვიდეოს
   ხურავს. რიგის `origin` — `course-{id}` (პოზიციები სხვა კურსს ემთხვევა),
   `href` — `/courses?open={id}` (ჩარჩოს „ფანჯარაში დაბრუნება"). გვერდითა
   ისარი — YouTube-ზე გახსნა.
   ⚠️ რიგის ერთეული `link`-ია (მრიცხველი არ არსებობს) და id
   **უარყოფითია**: ბაზის ჩანაწერის id-ს (`link-12`) ვერასდროს დაემთხვევა.
   ============================================================ */

/** ვიდეოებში მყოფი ელემენტის ბეჯი — ლოკალური / მიმდინარე / რიგში / ჩავარდნილი / უბრალოდ ვიდეოებშია */
function videoBadge(video: CoursePlaylistVideo, t: (key: string) => string): { label: string; className?: string; title?: string } {
  if (video.download_stale) return { label: t('videos.local.stalled'), className: 'bg-[var(--status-towatch)]/15 text-[var(--status-towatch)]' }
  switch (video.download_status) {
    case 'ready':
      return { label: t('videos.local.ready'), className: 'bg-[var(--status-watched)]/15 text-[var(--status-watched)]' }
    case 'running':
    case 'queued':
      return { label: t(`videos.local.${video.download_status}`), className: 'bg-muted text-muted-foreground' }
    case 'failed':
      return {
        label: t('videos.local.failed'),
        className: 'bg-destructive/10 text-destructive',
        // ⚠️ მიზეზი (მაგ. კვოტა) — ჩვენი კოდი ითარგმნება, yt-dlp-ის ტექსტი რჩება
        title: translateCode(video.download_error) || undefined,
      }
    default:
      return { label: t('courses.playlist.inVideos'), className: 'bg-muted text-muted-foreground' }
  }
}

function playerItem(item: CoursePlaylistItem, list: CoursePlaylist, course: Course): PlayerItem {
  return {
    kind: 'link',
    id: -item.position,
    title: item.title ?? `#${item.position}`,
    subtitle: list.title ?? course.title,
    url: item.url,
    embedUrl: item.embed_url,
    platform: 'youtube',
    thumbnail: item.thumbnail,
    duration: item.duration,
    href: `/courses?open=${course.id}`,
  }
}

export function CoursePlaylistSection({ course }: { course: Course }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const player = usePlayer()
  const [refreshing, setRefreshing] = useState(false)
  // არჩევა მხოლოდ მაშინ, როცა ვიდეოების მოდული ჩართულია
  const { has } = useModules()
  const canImport = has('video')
  /** არჩეული ელემენტები (YouTube-ის id) */
  const [picked, setPicked] = useState<string[]>([])
  /** დიალოგი: `add` — მხოლოდ ჩანაწერები, `download` — ლოკალური ასლითაც */
  const [importing, setImporting] = useState<'add' | 'download' | null>(null)

  const key = ['course-playlist', course.id, course.url]
  const q = useQuery({
    queryKey: key,
    queryFn: () => fetchCoursePlaylist(course.id),
    staleTime: 5 * 60 * 1000,
    retry: false,
    // რიგი მუშაობს — ბეჯები თვითონ ახლდება (ფონურ პროცესს შეტყობინება არ აქვს)
    refetchInterval: (query) =>
      query.state.data?.items.some((it) => it.video && downloadBusy(it.video)) ? 5000 : false,
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

  const add = useMutation({
    mutationFn: (choice: PlaylistImportChoice) =>
      addPlaylistVideos(course.id, { video_ids: picked, ...choice, download: importing === 'download' }),
    onSuccess: (res) => {
      toast({
        title: [
          t('courses.playlist.added', { created: res.created.length, existing: res.existing.length }),
          importing === 'download' ? t('courses.playlist.queued', { count: res.started.length }) : null,
        ]
          .filter(Boolean)
          .join(' · '),
        variant: 'success',
      })
      setPicked([])
      setImporting(null)
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: ['videos'] })
      void qc.invalidateQueries({ queryKey: ['courses'] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  // სერვერმა თქვა „ფლეილისტი არ არის" — სექცია არ იხატება
  if (q.isSuccess && !list) return null

  /* არჩევადი = ლოკალური ასლი ჯერ არ აქვს და არც რიგშია (ვიდეოებში მყოფიც —
     ჩამოსატვირთად; „დამატება" მას ასლს არ შეუქმნის); „ვიდეოებშია N · ლოკალური M" — სიიდან */
  const selectable = items.filter(
    (it) => !it.video || (it.video.download_status !== 'ready' && !downloadBusy(it.video)),
  )
  const allPicked = selectable.length > 0 && selectable.every((it) => picked.includes(it.video_id))
  const togglePick = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const pickedDuration = formatDuration(
    items.filter((it) => picked.includes(it.video_id)).reduce((sum, it) => sum + (it.duration ?? 0), 0),
  )
  const pickedText = [t('courses.playlist.picked', { count: picked.length }), pickedDuration ? `~${pickedDuration}` : null]
    .filter(Boolean)
    .join(' · ')
  const inVideos = items.filter((it) => it.video).length
  const local = items.filter((it) => it.video?.download_status === 'ready').length

  /* ეს კურსი უკრავს? — `origin`-ით (იხ. ზემოთ) */
  const origin = `course-${course.id}`
  const live = player.origin === origin && player.current?.kind === 'link'
  const playing = live ? player.current!.url : null
  const total = formatDuration(list?.total_duration)
  const playFrom = (at: number) =>
    player.play(
      items.map((it) => playerItem(it, list!, course)),
      at,
      list?.title ?? course.title,
      origin,
    )

  return (
    <DetailSection
      icon={<ListVideo className="size-4 text-muted-foreground" />}
      title={t('courses.playlist.title', { count: list?.count ?? 0 })}
      hint={t('courses.playlist.hint')}
      action={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {/* კურსის „საქაღალდე" ვიდეოებში */}
          {canImport && (inVideos > 0 || (course.videos_count ?? 0) > 0) && (
            <Link
              to={`/videos?course=${course.id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              data-testid="playlist-folder-link"
            >
              <FolderOpen className="size-4" />
              {t('courses.playlist.inVideosCount', { count: Math.max(inVideos, course.videos_count ?? 0), local })}
            </Link>
          )}
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
          <PlayerSpot
            className="mb-3"
            thumbnail={live ? player.current!.thumbnail : items[0]?.thumbnail}
            live={live}
            onPlay={() => playFrom(0)}
          />
          {canImport && selectable.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-3" data-testid="playlist-picker">
              <label className="flex cursor-pointer items-center gap-2 px-2 text-sm">
                <Checkbox
                  checked={allPicked}
                  onCheckedChange={() => setPicked(allPicked ? [] : selectable.map((it) => it.video_id))}
                  data-testid="playlist-pick-all"
                />
                {t('courses.playlist.pickAll', { count: selectable.length })}
              </label>
              {picked.length > 0 && (
                <span className="text-xs text-muted-foreground" data-testid="playlist-picked">
                  {pickedText}
                </span>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={picked.length === 0}
                  onClick={() => setImporting('add')}
                  data-testid="playlist-add"
                >
                  <FolderPlus className="size-4" />
                  {t('courses.playlist.addToVideos')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={picked.length === 0}
                  onClick={() => setImporting('download')}
                  data-testid="playlist-download"
                >
                  <Download className="size-4" />
                  {t('courses.playlist.download')}
                </Button>
              </div>
            </div>
          )}
          <ol className="space-y-1" data-testid="playlist-items">
            {shown.map((item) => {
              const current = playing === item.url
              return (
                <li key={item.position} className="flex items-center gap-1">
                  {canImport && (
                    <span className="grid w-7 shrink-0 place-items-center">
                      {selectable.includes(item) && (
                        <Checkbox
                          checked={picked.includes(item.video_id)}
                          onCheckedChange={() => togglePick(item.video_id)}
                          aria-label={t('courses.playlist.pick')}
                          data-testid="playlist-pick"
                        />
                      )}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => playFrom(item.position - 1)}
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
                    {/* უკვე ვიდეოებშია — და ლოკალური ასლის მდგომარეობა */}
                    {item.video &&
                      (() => {
                        const badge = videoBadge(item.video, t)
                        return (
                          <Badge className={cn('shrink-0', badge.className)} title={badge.title} data-testid="playlist-in-videos">
                            {item.video.download_status === 'failed' && <TriangleAlert className="size-3" />}
                            {badge.label}
                          </Badge>
                        )
                      })()}
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

      {importing && (
        <PlaylistImportDialog
          title={t(importing === 'download' ? 'courses.playlist.download' : 'courses.playlist.addToVideos')}
          summary={pickedText}
          busy={add.isPending}
          confirmLabel={t(importing === 'download' ? 'courses.playlist.download' : 'courses.playlist.addToVideos')}
          onClose={() => setImporting(null)}
          onConfirm={(choice) => add.mutate(choice)}
        >
          {importing === 'download' && <PlaylistPlanNote courseId={course.id} ids={picked} />}
        </PlaylistImportDialog>
      )}
    </DetailSection>
  )
}

/**
 * **გეგმა ჩამოტვირთვამდე** — „~X GB · თავისუფალია Y"; არ ეტევა — გაფრთხილება.
 * ⚠️ ზომა სავარაუდოა (სერვერი რამდენიმე ვიდეოს ზომავს და ხანგრძლივობაზე
 * ავრცელებს), თუმცა სწორედ ის აჩენს, რომ ნახევარი კურსი კვოტაზე ჩავარდება.
 */
function PlaylistPlanNote({ courseId, ids }: { courseId: number; ids: string[] }) {
  const { t } = useTranslation()
  const plan = useQuery({
    queryKey: ['playlist-plan', courseId, ids],
    queryFn: () => fetchPlaylistPlan(courseId, ids),
    retry: false,
    staleTime: 60_000,
  })

  if (plan.isLoading) {
    return (
      <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t('courses.playlist.planLoading')}
      </p>
    )
  }
  if (plan.isError) {
    return <p className="mt-2 text-sm text-destructive">{errorMessage(plan.error)}</p>
  }

  const data = plan.data!
  const free = formatBytes(data.free_bytes)

  return (
    <div className="mt-2 space-y-1 text-sm" data-testid="playlist-plan">
      <p className="text-muted-foreground">
        {data.estimate_bytes === null
          ? t('courses.playlist.planUnknown', { free })
          : t('courses.playlist.plan', { size: formatBytes(data.estimate_bytes), free })}
      </p>
      {data.fits === false && (
        <p className="flex items-center gap-1.5 text-destructive" data-testid="playlist-plan-warning">
          <TriangleAlert className="size-4 shrink-0" />
          {t('courses.playlist.planTooBig')}
        </p>
      )}
    </div>
  )
}
