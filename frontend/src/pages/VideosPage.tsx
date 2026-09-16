import { useEffect, useMemo, useRef, useState } from 'react'
import { StatusBadge } from '@/components/StatusBadge'
import { statusByKey, statusName, useStatuses } from '@/lib/statuses'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useListLimit } from '@/lib/paged'
import { ShowMore } from '@/components/ui/show-more'
import {
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileX,
  Globe,
  HardDriveDownload,
  ListVideo,
  Loader2,
  SquarePen,
  Play,
  Plus,
  RotateCcw,
  Search,
  Star,
  Tags,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import {
  createVideo,
  deleteVideo,
  deleteVideoDownload,
  fetchVideoDownloadStatus,
  fetchVideoMetadata,
  fetchVideoTypes,
  fetchVideos,
  markVideoWatched,
  startVideoDownload,
  toggleVideoFavorite,
  updateVideo,
  videoDownloadUrl,
  type Video,
  type VideoFilters,
  type VideoInput,
  type VideoMetadata,
  type VideoType,
} from '@/api/videos'
import { fetchWebVideoDetails } from '@/api/web'
import { storageUrl } from '@/lib/api'
import { useDateFormat } from '@/lib/dates'
import { useModuleFields } from '@/lib/fields'
import { dedupeTags } from '@/lib/tags'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { videoTypeName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { formatDuration, isDirectMediaUrl, probeMediaDuration } from '@/lib/videoDuration'
import { usePlayer, videoItem } from '@/lib/player'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { ModuleIcon } from '@/components/ModuleIcon'
import { PosterUploader } from '@/components/PosterUploader'
import { TagSelect } from '@/components/TagSelect'
import { VideoDetail } from '@/components/VideoDetail'
import { VideoTypeDialog } from '@/components/VideoTypeDialog'
import {
  FilterGroup,
  FilterOption,
  FilterOptionList,
  FilterPanel,
  FilterTrigger,
} from '@/components/FilterPanel'
import { useFilterDraft } from '@/lib/filters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DurationInput } from '@/components/ui/duration-input'
import { FieldLabel } from '@/components/ui/field-label'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ModalShell } from '@/components/ui/modal-shell'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn, formatBytes } from '@/lib/utils'

/* ============================================================
   ვიდეოების მოდული (I5) — Tasks 5.

   5.1 — ტიპი მართვადი ლექსიკონია (`video_types`), ფორმაში select + „ახალი ტიპი".
   5.2 — ფილტრები მარჯვენა პანელში: ტიპები, ტეგები, ძებნა, სორტირება (იგივე
         მოდელი, რაც ბიბლიოთეკაზე — 2.2).
   5.3 — ტეგების დუბლი submit-ზე იჭრება, user-ს შეტყობინება ეძლევა.
   5.4 — thumbnail `PosterUploader`-ით (preview, drag&drop, წაშლა).
   5.5 — ხანგრძლივობის ხელით ველი მოიხსნა; ავტომატური probe რჩება.
   ============================================================ */

const SORTS = ['newest', 'oldest', 'title', 'watched'] as const

/** პანელის ფილტრები — „ცარიელი" და მისი ტიპი ერთ ადგილას (`lib/filters.ts`) */
const EMPTY_FILTERS = { types: [] as string[], tags: [] as string[] }
type PanelFilters = typeof EMPTY_FILTERS

export function VideosPage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  // §6.4 — სტატუსების ლექსიკონი (სექციები, ბეჯი, ფორმა)
  const { data: statuses = [] } = useStatuses('video')
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const fmt = useDateFormat()

  const [params, setParams] = useSearchParams()
  const search = params.toString()
  const view = params.get('view') ?? 'all'

  // მოქმედი ფილტრი მისამართშია (2.2-ის მოდელი): საიდბარი და პანელი ერთსა და იმავეს ხედავს
  const types = useMemo(() => new URLSearchParams(search).get('type')?.split(',').filter(Boolean) ?? [], [search])
  const tags = useMemo(() => new URLSearchParams(search).get('tag')?.split(',').filter(Boolean) ?? [], [search])

  // მონახაზში სტატუსი/რჩეული აღარაა (Tasks 3) — ის საიდბარის სექციაა (`?view=`)
  const [panelOpen, setPanelOpen] = useState(false)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('newest')
  const [editing, setEditing] = useState<Video | 'new' | null>(null)
  // ⚠️ სახელი „detail"-ია და არა „playing": §7.2-ის შემდეგ **დაკვრა ქვედა
  // ზოლშია**, მოდალი კი აღწერა/ფაილები/ჩანიშვნები/მსგავსებია.
  const [detail, setDetail] = useState<Video | null>(null)
  const player = usePlayer()

  // ძებნა აკრეფისას (K4) — ჩამორჩენილი 350ms, backend ეძებს ყველა ველში
  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  const filters: VideoFilters = {
    q: term || undefined,
    type_id: types.length ? types.join(',') : undefined,
    tag: tags.length ? tags.join(',') : undefined,
    favorite: view === 'favorite' ? true : undefined,
    // §7.1 — „ჩამოწერილები" საიდბარის სექციაა, ე.ი. `?view=`-ში ზის
    downloaded: view === 'downloaded' ? true : undefined,
    /* §6.4 — დანარჩენი `?view=` ლექსიკონის სტატუსია. ⚠️ „ყველა"/„რჩეული"/
       „ჩამოწერილი" სტატუსები არაა და ფილტრში არ უნდა გადავიდეს. */
    status:
      view !== 'all' && view !== 'favorite' && view !== 'downloaded' ? view : undefined,
    sort: sort === 'newest' ? undefined : sort,
  }

  const { limit, showMore } = useListLimit(JSON.stringify(filters))
  const query = useQuery({
    queryKey: ['videos', filters, limit],
    queryFn: () => fetchVideos({ ...filters, per_page: limit }),
    // „მეტის ჩვენებაზე" ბადე არ უნდა დაიცალოს და თავიდან აეწყოს
    placeholderData: keepPreviousData,
  })
  const typesQ = useQuery({ queryKey: ['video-types'], queryFn: fetchVideoTypes })
  // `?? []` ყოველ რენდერზე ახალ მასივს აბრუნებდა და ქვემოთ useEffect/useMemo-ს ამუშავებდა
  const videos = useMemo(() => query.data?.items ?? [], [query.data])
  /** ⚠️ **გაფილტრული სიის** ჯამი და არა ჩატვირთულის — სათაურიც ამას წერს */
  const total = query.data?.total ?? 0
  const allTypes = useMemo(() => typesQ.data ?? [], [typesQ.data])

  /* §7.2 — დასაკრავი რიგი **გაფილტრული სიაა** და ჩაირთვება რიგრიგობით.
     ტიპის სახელი შიგთავსის ენაზეა, ამიტომ აქ ითარგმნება. */
  const queueItems = useMemo(
    () => videos.map((v) => videoItem(v, v.type ? videoTypeName(v.type, lang) : null)),
    [videos, lang],
  )

  /* ⚠️ დაკვრაზე **მთელი** გაფილტრული სია ჩამოდის და არა ჩატვირთული გვერდი —
     წესი გვერდებად დაყოფამდე ასეთი იყო და უცვლელი რჩება. მოთხოვნა მხოლოდ
     ცხად დაჭერაზე ხდება (და ქეშდება); წყარო თუ არ მოვიდა, ჩატვირთულს ვუკრავთ. */
  const playFrom = async (index: number) => {
    try {
      const full = await qc.fetchQuery({
        queryKey: ['videos', filters, 'queue'],
        queryFn: () => fetchVideos({ ...filters, all: true }),
      })
      player.play(
        full.items.map((v) => videoItem(v, v.type ? videoTypeName(v.type, lang) : null)),
        index,
        t('videos.title'),
      )
    } catch {
      player.play(queueItems, index, t('videos.title'))
    }
  }

  // საიდბარის „დამატება" → `?new=1`
  useEffect(() => {
    if (params.get('new')) {
      setEditing('new')
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['videos'] })
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const favorite = useMutation({ mutationFn: toggleVideoFavorite, onSuccess: invalidate, onError: fail })
  const watched = useMutation({ mutationFn: markVideoWatched, onSuccess: invalidate, onError: fail })
  const remove = useMutation({ mutationFn: deleteVideo, onSuccess: invalidate, onError: fail })

  /* ---------- §7.1 — ლოკალური ჩამოწერა ----------
     ⚠️ `yt-dlp`-ის ყოფნა **ერთხელ** იკითხება და ღილაკს ხსნის/კეტავს: მის
     გარეშე ღილაკი მაინც ჩანს, ოღონდ ამბობს, რომ პროგრამა არ არის — ჩუმად
     გამქრალი ღილაკი „რატომ არ მუშაობს"-ს ტოვებდა. */
  const ytdlpQ = useQuery({
    queryKey: ['videos', 'download-status'],
    queryFn: fetchVideoDownloadStatus,
    staleTime: 5 * 60 * 1000,
  })

  const download = useMutation({ mutationFn: startVideoDownload, onSuccess: invalidate, onError: fail })
  const dropDownload = useMutation({ mutationFn: deleteVideoDownload, onSuccess: invalidate, onError: fail })

  /* ⚠️ ჩამოწერა **ფონურად** მიდის (`artisan serve` ერთნაკადიანია), ე.ი.
     დასრულებას ვერავინ გვატყობინებს — სანამ თუნდაც ერთი `running`-ია,
     სია თვითონ იკითხება. ყველა სხვა დროს polling გამორთულია. */
  /* ⚠️ **გაჭედილი გაშვება polling-ს არ იმსახურებს** (აუდიტი §B1): მკვდარი
     ფონური პროცესის სტატუსი თვითონ ვერასდროს შეიცვლება, ე.ი. ტაიმერი
     სამუდამოდ ურეკავდა სერვერს ყოველ 4 წამში და პასუხი არასდროს იცვლებოდა. */
  const running = videos.some((v) => v.download_status === 'running' && !v.download_stale)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => void qc.invalidateQueries({ queryKey: ['videos'] }), 4000)
    return () => clearInterval(timer)
  }, [running, qc])

  /**
   * ჩამოწერის ახსნა tooltip-ისთვის.
   *
   * ⚠️ ჩავარდნისას **ნამდვილი მიზეზი** ჩანს („Video unavailable") და არა
   * ზოგადი „ვერ მოხერხდა": სწორედ ის ამბობს, თავიდან სცადო თუ აზრი არ აქვს.
   */
  const downloadHint = (v: Video): string => {
    if (v.download_status === 'ready') {
      return [v.download_format, formatBytes(v.download_size)].filter(Boolean).join(' · ')
    }
    // ⚠️ „მიმდინარეობს" და „გაჩერდა" ორი სხვადასხვა ფაქტია: პირველზე ლოდინია
    // საჭირო, მეორეზე — ხელახლა გაშვება. ერთი წარწერა ადამიანს ატყუებდა.
    if (v.download_status === 'running') {
      return v.download_stale ? t('videos.local.stalled') : t('videos.local.running')
    }
    if (v.download_status === 'failed') return v.download_error || t('videos.local.failed')
    // ffmpeg-ის არქონა ხარისხს ჭრის და ეს დაწკაპუნებამდე უნდა ეწეროს
    return ytdlpQ.data && !ytdlpQ.data.ffmpeg
      ? `${t('videos.local.start')} · ${t('videos.local.noFfmpeg')}`
      : t('videos.local.start')
  }

  /** ფორმის ტეგების შემოთავაზებები (L8) — ყველა სექციიდან დანახული ტეგი გროვდება */
  const [knownTags, setKnownTags] = useState<string[]>([])
  useEffect(() => {
    if (!videos.length) return
    setKnownTags((prev) => {
      const merged = new Set([...prev, ...videos.flatMap((v) => v.tags)])
      return merged.size === prev.length ? prev : [...merged].sort((a, b) => a.localeCompare(b))
    })
  }, [videos])

  // პანელის ტეგები: დანახული + უკვე მონიშნული (თორემ ფილტრის მოხსნა ვერ ხდება)
  const tagOptions = useMemo(() => {
    const set = new Set([...knownTags, ...videos.flatMap((v) => v.tags), ...tags])
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [knownTags, videos, tags])

  /* ---------- ფილტრის გაშვება ---------- */

  /** მონახაზის გაშვება = ახალი მისამართი; მიმდინარე სექცია (`?view=`) ინახება */
  const writeFilters = (next: PanelFilters) => {
    const p = new URLSearchParams()
    if (view !== 'all') p.set('view', view)
    if (next.types.length) p.set('type', next.types.join(','))
    if (next.tags.length) p.set('tag', next.tags.join(','))
    setPanelOpen(false)
    navigate({ pathname: '/videos', search: p.toString() })
  }

  /* მონახაზი, „ცვლილებაა?", გასუფთავება და მრიცხველი — ერთი აღწერა
     `lib/filters.ts`-ში. ⚠️ `clear()` **ორივე მხარეს** ასუფთავებს
     (მონახაზსაც და მისამართსაც) — ადრე მხოლოდ მისამართს წერდა და უკვე
     სუფთა მისამართზე დაჭერილი „გასუფთავება" ჩუმად არაფერს აკეთებდა. */
  const { draft, setDraft, dirty, apply, clear, activeCount } = useFilterDraft(
    { types, tags },
    EMPTY_FILTERS,
    writeFilters,
  )

  const toggle = (key: 'types' | 'tags', value: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      [key]: on ? [...d[key], value] : d[key].filter((x) => x !== value),
    }))

  // სათაური მიჰყვება იმას, რაც საიდბარში/პანელში აირჩა
  const onlyType = types.length === 1 ? allTypes.find((x) => String(x.id) === types[0]) : undefined
  const heading =
    view === 'favorite'
      ? t('filter.favorite')
      : view === 'downloaded'
        ? t('videos.downloadedSection')
        : statusByKey(statuses, view)
          ? statusName(statusByKey(statuses, view), lang)
          : onlyType
            ? videoTypeName(onlyType, lang)
            : t('videos.title')

  return (
    <PageContainer>
      <PageHeader
        module="video"
        title={heading}
        subtitle={t('videos.count', { count: total })}
        actions={
          <>
            {/* ძებნა — Tasks 4: განმარტება tooltip-ია და არა `title` */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="w-56 pl-9"
                    placeholder={t('videos.searchPlaceholder')}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  {query.isFetching && term !== '' && (
                    <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                {t('videos.searchHint')}
              </TooltipContent>
            </Tooltip>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`videos.sort.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterTrigger activeCount={activeCount} onClick={() => setPanelOpen(true)} />
            {/* §7.2 — მთელი (გაფილტრული) სია რიგში */}
            {videos.length > 0 && (
              <Button
                variant="outline"
                onClick={() => playFrom(0)}
              >
                <ListVideo className="size-4" />
                {t('playback.playAll')}
              </Button>
            )}
            <Link
              to="/dictionaries/video-types"
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Tags className="size-4" />
              {t('videoTypes.manage')}
            </Link>
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('videos.add')}
            </Button>
          </>
        }
      />

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {query.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {/* ⚠️ §2.4 — ცარიელი სექცია **თავს ხსნის**: ადრე ერთი ნაცრისფერი
              წინადადება ეწერა და არ ჩანდა, ფილტრმა ჩამოჭრა თუ მართლა ცარიელია. */}
          {!query.isLoading && !videos.length && (
            <EmptyState
              title={term ? t('videos.noResults', { q: term }) : t('videos.empty')}
              hint={term || activeCount > 0 ? t('empty.filteredHint') : t('empty.addHint')}
              actions={
                <>
                  {activeCount > 0 && (
                    <Button variant="outline" onClick={clear}>
                      {t('filter.clear')}
                    </Button>
                  )}
                  <Button onClick={() => setEditing('new')}>
                    <Plus className="size-4" />
                    {t('videos.add')}
                  </Button>
                </>
              }
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {videos.map((v, i) => {
              const thumb = storageUrl(v.thumbnail)
              return (
                <div key={v.id} className="overflow-hidden rounded-xl border border-border bg-card">
                  <button
                    onClick={() => {
                      setDetail(v)
                      watched.mutate(v.id)
                    }}
                    className="relative block aspect-video w-full cursor-pointer overflow-hidden bg-muted"
                  >
                    {thumb ? (
                      <img src={thumb} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <span className="grid size-full place-items-center text-muted-foreground">
                        <Play className="size-8" />
                      </span>
                    )}
                    <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity hover:opacity-100">
                      <Play className="size-10 text-white" />
                    </span>
                    {v.duration && (
                      <span className="absolute bottom-2 right-2 rounded-[5px] bg-black/75 px-1.5 py-0.5 text-xs text-white">
                        {formatDuration(v.duration)}
                      </span>
                    )}
                    {/* §7.1 — „ეს ლოკალურად მაქვს". ⚠️ ხატულა **საერთო სიაშიც**
                        ჩანს და არა მარტო „ჩამოწერილების" სექციაში: სწორედ ეს
                        იყო თასქის პირობა — ერთი შეხედვით უნდა იცოდე, რომელია. */}
                    {v.download_status && (
                      <span
                        title={downloadHint(v)}
                        className={cn(
                          'absolute left-2 top-2 inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-xs text-white',
                          v.download_status === 'ready' && 'bg-emerald-600/90',
                          v.download_status === 'running' && !v.download_stale && 'bg-black/75',
                          v.download_status === 'running' && v.download_stale && 'bg-amber-600/90',
                          v.download_status === 'failed' && 'bg-destructive/90',
                        )}
                      >
                        {v.download_status === 'running' && !v.download_stale ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : v.download_status === 'failed' || v.download_stale ? (
                          <TriangleAlert className="size-3" />
                        ) : (
                          <HardDriveDownload className="size-3" />
                        )}
                        {v.download_status === 'ready'
                          ? formatBytes(v.download_size)
                          : /* ⚠️ გაჭედილს **თავისი** წარწერა აქვს: „მიმდინარეობს…"
                               მკვდარ პროცესზე პირდაპირი მოტყუება იყო */
                            t(v.download_stale ? 'videos.local.stalled' : `videos.local.${v.download_status}`)}
                      </span>
                    )}
                  </button>

                  <div className="p-3">
                    <div className="flex items-start gap-2">
                      <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={v.title}>
                        {v.title}
                      </h3>
                      <button
                        onClick={() => favorite.mutate(v.id)}
                        aria-label={t(v.is_favorite ? 'actions.unfavorite' : 'actions.favorite')}
                        className="cursor-pointer text-muted-foreground hover:text-gold"
                      >
                        <Star className={cn('size-4', v.is_favorite && 'fill-gold text-gold')} />
                      </button>
                    </div>

                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {v.type && (
                        <span className="inline-flex items-center gap-1">
                          <ModuleIcon name={v.type.icon} className="size-3" />
                          {videoTypeName(v.type, lang)}
                        </span>
                      )}
                      {/* §6.4 — სტატუსი: ამ მოდულს ის ახლა გაუჩნდა */}
                      <StatusBadge status={v.status} />
                      <span className="capitalize">{v.platform}</span>
                      {v.watch_count > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Eye className="size-3" />
                          {v.watch_count}
                        </span>
                      )}
                      {v.watched_at && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {fmt.date(v.watched_at)}
                        </span>
                      )}
                    </p>

                    {v.tags.length > 0 && (
                      <p className="mt-2 flex flex-wrap gap-1">
                        {v.tags.map((tag) => (
                          <span key={tag} className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]">
                            #{tag}
                          </span>
                        ))}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-1 border-t border-border pt-2">
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" />
                        {t('videos.source')}
                      </a>
                      {/* §7.2 — რიგში ჩართვა: აქედან **გაფილტრული სია** უკრავს
                          რიგრიგობით, ე.ი. დამთავრებისას შემდეგი თავისით ჩაირთვება.
                          ⚠️ სურათზე დაჭერა კვლავ დეტალებს ხსნის — ერთი ვიდეოს
                          ყურება დიდ მოდალში ჯობია, ვიდრე ქვედა ზოლში. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => playFrom(i)}
                        aria-label={t('playback.playFromHere')}
                        title={t('playback.playFromHere')}
                      >
                        <ListVideo className="size-3.5" />
                      </Button>
                      {/* §7.1 — ლოკალური ასლი. სამი სხვადასხვა მდგომარეობა,
                          სამი სხვადასხვა ღილაკი: ჯერ „ჩამოწერა", მიმდინარეზე —
                          დამტრიალებელი, მზაზე — გახსნა + მოშორება. */}
                      {v.download_status === 'ready' ? (
                        <>
                          <a
                            href={videoDownloadUrl(v.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t('videos.local.open')}
                            title={`${t('videos.local.open')}${v.download_format ? ` · ${v.download_format}` : ''}`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <HardDriveDownload className="size-3.5" />
                            {formatBytes(v.download_size)}
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={dropDownload.isPending}
                            aria-label={t('videos.local.remove')}
                            title={t('videos.local.remove')}
                            onClick={async () => {
                              const ok = await confirm({
                                title: t('videos.local.removeTitle'),
                                description: t('videos.local.removeHint', {
                                  name: v.title,
                                  size: formatBytes(v.download_size),
                                }),
                                variant: 'destructive',
                              })
                              if (ok) dropDownload.mutate(v.id)
                            }}
                          >
                            <FileX className="size-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={
                            (v.download_status === 'running' && !v.download_stale) ||
                            download.isPending
                          }
                          aria-label={t('videos.local.start')}
                          title={
                            ytdlpQ.data && !ytdlpQ.data.available
                              ? t('videos.local.unavailable')
                              : downloadHint(v)
                          }
                          onClick={() => {
                            if (ytdlpQ.data && !ytdlpQ.data.available) {
                              toast({ title: t('videos.local.unavailable'), variant: 'error' })
                              return
                            }
                            download.mutate(v.id)
                          }}
                        >
                          {v.download_status === 'running' && !v.download_stale ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : v.download_stale ? (
                            /* ⚠️ დამტრიალებელი აქ ტყუილი იქნებოდა — არაფერი
                               ტრიალებს; ხატულა „ხელახლა სცადე"-ს ამბობს */
                            <RotateCcw className="size-3.5" />
                          ) : (
                            <Download className="size-3.5" />
                          )}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setEditing(v)}>
                        <SquarePen className="size-3.5" />
                        {t('actions.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-destructive"
                        onClick={async () => {
                          const ok = await confirm({
                            title: t('videos.deleteTitle'),
                            description: t('videos.deleteHint', { name: v.title }),
                            variant: 'destructive',
                          })
                          if (ok) remove.mutate(v.id)
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <ShowMore shown={videos.length} total={total} onMore={showMore} loading={query.isFetching} />
        </div>

        {/* ---------- ფილტრები (5.2) ---------- */}
        <FilterPanel
          activeCount={activeCount}
          dirty={dirty}
          onApply={() => apply(draft)}
          onClear={clear}
          open={panelOpen}
          onOpenChange={setPanelOpen}
        >
          {/* „ყველა"/„რჩეული" აქ განზრახ არ არის (Tasks 3) — ისინი საიდბარის სექციებია */}
          <FilterGroup title={t('filter.types')} count={draft.types.length}>
            <FilterOptionList>
              {allTypes.map((type) => (
                <FilterOption
                  key={type.id}
                  label={videoTypeName(type, lang)}
                  count={type.videos_count}
                  checked={draft.types.includes(String(type.id))}
                  onChange={(on) => toggle('types', String(type.id), on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>

          <FilterGroup title={t('filter.tags')} count={draft.tags.length}>
            {tagOptions.length ? (
              <FilterOptionList>
                {tagOptions.map((tag) => (
                  <FilterOption
                    key={tag}
                    label={`#${tag}`}
                    checked={draft.tags.includes(tag)}
                    onChange={(on) => toggle('tags', tag, on)}
                  />
                ))}
              </FilterOptionList>
            ) : (
              <p className="px-1.5 py-1 text-xs text-muted-foreground">{t('videos.noTags')}</p>
            )}
          </FilterGroup>
        </FilterPanel>
      </div>

      {detail && (
        <VideoDetail
          video={detail}
          onClose={() => setDetail(null)}
          // „მსგავსი ვიდეოზე" დაჭერა იმავე მოდალში გადაინაცვლებს (K4)
          onOpen={(v) => {
            setDetail(v)
            watched.mutate(v.id)
          }}
        />
      )}

      {editing && (
        <VideoForm
          video={editing === 'new' ? null : editing}
          allTags={knownTags}
          types={allTypes}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate()
            qc.invalidateQueries({ queryKey: ['video-types'] })
            setEditing(null)
          }}
        />
      )}
    </PageContainer>
  )
}

/* ---------- ფორმა ---------- */

function VideoForm({
  video,
  allTags,
  types,
  onClose,
  onSaved,
}: {
  video: Video | null
  /** არსებული ტეგები შემოთავაზებისთვის (L8) */
  allTags: string[]
  types: VideoType[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  // §6.4 — სტატუსების ლექსიკონი (სექციები, ბეჯი, ფორმა)
  const { data: statuses = [] } = useStatuses('video')
  const { toast } = useToast()

  const [form, setForm] = useState({
    title: video?.title ?? '',
    url: video?.url ?? '',
    description: video?.description ?? '',
    // ახალ ვიდეოს პირველი ტიპი ენიჭება — select ცარიელი არ რჩება
    // ⚠️ აღარ იყენებს პირველ ტიპს ნაგულისხმევად: არჩევანი მომხმარებლისაა
    typeId: video?.type_id ? String(video.type_id) : '',
    // §6.4 — გასაღები; ცარიელი = ნაგულისხმევი (backend დაადებს)
    status: video?.status?.key ?? '',
    tags: video?.tags ?? [],
  })
  // ხანგრძლივობა ავტომატურია (5.5); ხელით შეყვანა არჩევითი ველია (§6, ფაზა 1)
  const [duration, setDuration] = useState<number | null>(video?.duration ?? null)
  // §6 — რომელი ველი ჩანს, რა ჰქვია და სავალდებულოა თუ არა
  const fields = useModuleFields('video')
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [thumbPreview, setThumbPreview] = useState<string | null>(storageUrl(video?.thumbnail))
  const [removeThumb, setRemoveThumb] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [meta, setMeta] = useState<VideoMetadata | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [probing, setProbing] = useState(false)
  // §7.6.3 — SerpApi-ით დეტალების წამოღება (YouTube-ის გასაღების გარეშე)
  const [webLoading, setWebLoading] = useState(false)
  const [newType, setNewType] = useState(false)
  const lastFetched = useRef<string>(video?.url ?? '')

  /**
   * ბმულის ჩასმისთანავე ვცდილობთ სათაურის/thumbnail-ის/ხანგრძლივობის წამოღებას (K2).
   * ივსება **მხოლოდ ცარიელი ველები** — ხელით შეყვანილს არ ვაბათილებთ.
   */
  const loadMeta = async (url: string) => {
    const clean = url.trim()
    if (!clean || clean === lastFetched.current || !/^https?:\/\//i.test(clean)) return
    lastFetched.current = clean
    setMetaLoading(true)
    let fetchedDuration: number | null = null
    try {
      const m = await fetchVideoMetadata(clean)
      setMeta(m)
      fetchedDuration = m.duration
      if (m.duration) setDuration((d) => d ?? m.duration)
      setForm((f) => ({
        ...f,
        title: f.title || (m.title ?? ''),
        description: f.description || (m.description ?? ''),
        tags: f.tags.length ? f.tags : m.tags,
      }))
    } catch {
      setMeta(null)
    } finally {
      setMetaLoading(false)
    }

    // პირდაპირ ფაილზე (.mp4/.webm) oEmbed/API არ არსებობს და ffprobe backend-ზე
    // არ გვაქვს — ხანგრძლივობას ბრაუზერი კითხულობს `<video>`-ით (K2)
    if (!fetchedDuration && isDirectMediaUrl(clean)) {
      setProbing(true)
      const seconds = await probeMediaDuration(clean)
      setProbing(false)
      if (seconds) setDuration((d) => d ?? seconds)
    }
  }

  /**
   * §7.6.3 — ხანგრძლივობისა და სათაურის წამოღება **SerpApi-დან**, როცა
   * უფასო გზამ ვერ მოიტანა (`YOUTUBE_API_KEY` ცარიელია).
   *
   * ⚠️ **ღილაკია და არა ავტომატური probe:** თითო გამოძახება ერთ ძებნას
   * ხარჯავს 250-იდან. ნაგულისხმევად ისევ უფასო oEmbed მუშაობს.
   *
   * ⚠️ **ივსება მხოლოდ ცარიელი ველები** — ხელით შეყვანილს არ ვაბათილებთ
   * (`loadMeta`-ს იგივე წესი).
   */
  const loadFromWeb = async () => {
    setWebLoading(true)
    try {
      const { video: found } = await fetchWebVideoDetails(form.url.trim())
      if (found.duration) setDuration((d) => d ?? found.duration)
      setForm((f) => ({
        ...f,
        title: f.title || (found.title ?? ''),
        description: f.description || (found.description ?? ''),
      }))
      toast({ title: t('videos.metaFromWeb'), variant: 'success' })
    } catch (e) {
      toast({ title: errorMessage(e), variant: 'error' })
    } finally {
      setWebLoading(false)
    }
  }

  const save = useMutation({
    mutationFn: (input: VideoInput) =>
      video ? updateVideo(video.id, input) : createVideo(input),
    onSuccess: () => {
      toast({ title: t('videos.saved'), variant: 'success' })
      onSaved()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })


  /* ⚠️ **დამალულ ველზე წითელი ტექსტი არავის უნახავს** (Tasks §4.1): ბლოკი
     `hidden`-ითაა, ე.ი. შეცდომა DOM-შია და ეკრანზე არა — ღილაკი „შენახვა"
     ვიზუალურად არაფერს აკეთებდა. ამიტომ ასეთი ველი თოსტით სახელდება. */
  const warnHidden = (missing: string[]) => {
    const hidden = hiddenPicks(missing, fields.shows)

    if (hidden.length > 0) {
      toast({
        title: t('validation.hiddenRequired', {
          fields: hidden.map((key) => fields.label(key)).join(', '),
        }),
        variant: 'error',
      })
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()

    /* ⚠️ სტატუსიც და ტიპიც სავალდებულოა — შემოწმება ქსელამდე,
       რათა პასუხი იმავე წამს იყოს; backend-ის 422 მეორე კარიბჭეა. */
    const picked = pickErrors(
      { status: form.status, type_id: form.typeId },
      t('validation.pickOne'),
    )
    if (Object.keys(picked).length > 0) {
      setErrors(picked)
      warnHidden(Object.keys(picked))

      return
    }

    setErrors({})

    // 5.3 — დუბლი submit-ზე იჭრება და user-ს ვატყობინებთ
    const { tags, removed } = dedupeTags(form.tags)
    if (removed > 0) {
      setForm((f) => ({ ...f, tags }))
      toast({ title: t('tags.duplicate', { count: removed }), variant: 'info' })
    }

    save.mutate({
      title: form.title,
      url: form.url,
      type_id: form.typeId ? Number(form.typeId) : null,
      status: form.status || undefined,
      description: form.description || undefined,
      duration,
      tags,
      thumbnail,
      remove_thumbnail: removeThumb,
    })
  }

  return (
    <ModalShell title={t(video ? 'videos.edit' : 'videos.add')} onClose={onClose} wide>
      <form onSubmit={submit} className="mt-4 space-y-4">
        {/* ⚠️ `url` `locked`-ია (§6.5): მისი გამორთვა ჩაწერას გატეხავდა — და
            სწორედ ამიტომ ითხოვს ჩაკეტვის ცხად მოხსნას (§4). ⚠️ `shows()`-ს
            მაინც ეკითხება, თორემ მოხსნის შემდეგ ჩამრთველი ტყუილი იქნებოდა. */}
        <div className={fields.shows('url') ? undefined : 'hidden'}>
          <FieldLabel htmlFor="v-url" required>{fields.label('url')}</FieldLabel>
          <Input
            id="v-url"
            autoFocus
            placeholder="https://www.youtube.com/watch?v=…"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            onBlur={(e) => void loadMeta(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text')
              if (pasted) setTimeout(() => void loadMeta(pasted), 0)
            }}
          />
          {errors.url && <p className="mt-1 text-xs text-destructive">{errors.url}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{t('videos.urlHint')}</p>

          {/* ბმულიდან წამოღებული მონაცემი (K2) */}
          {metaLoading && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t('videos.metaLoading')}
            </p>
          )}
          {!metaLoading && meta && (
            <div className="mt-2 flex items-start gap-3 rounded-lg border border-border bg-card/50 p-2">
              {meta.thumbnail_url && (
                <img src={meta.thumbnail_url} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 text-xs text-muted-foreground">
                <p className="truncate text-foreground">{meta.title ?? t('videos.metaNoTitle')}</p>
                <p className="capitalize">
                  {meta.platform}
                  {meta.author && ` · ${meta.author}`}
                  {duration ? ` · ${formatDuration(duration)}` : ''}
                </p>
                {meta.platform === 'youtube' && !meta.youtube_key && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span>{t('videos.metaNeedsKey')}</span>
                    {/* §7.6.3 — SerpApi ამას გასაღების გარეშე ავსებს, მაგრამ
                        ერთ ძებნას ხარჯავს 250-იდან → **მხოლოდ ღილაკით** */}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void loadFromWeb()}
                      disabled={webLoading}
                    >
                      {webLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />}
                      {t('videos.metaFetchWeb')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
          {/* 5.5 — ხანგრძლივობა ავტომატურად წამოდის… */}
          {probing && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t('videos.durationProbing')}
            </p>
          )}

          {/* …ხელით შეყვანა კი **არჩევითი ველია** (§5 → §6): default-ად
              გამორთულია და ირთვება `/modules/video`-ზე. საჭიროა მაშინ, როცა
              ავტომატიკა ვერ მუშაობს (მაგ. YouTube-ის კლავიშის გარეშე). */}
          {fields.shows('duration') && (
            <div className="mt-3">
              <FieldLabel htmlFor="v-duration" required={fields.required('duration')} hint={fields.hint('duration')}>
                {fields.label('duration')}
              </FieldLabel>
              {/* §2.5 — წუთი + წამი (საათი გადამრთველით); ბაზაში ისევ წამები */}
              <div className="flex flex-wrap items-center gap-2">
                <DurationInput id="v-duration" value={duration} onChange={setDuration} />
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {duration ? formatDuration(duration) : '—'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 2.3 — ველები ორ სვეტად, მოდალის სიმაღლის შესამცირებლად */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={fields.shows('title') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="v-title" required={fields.required('title')} hint={fields.hint('title')}>
              {fields.label('title')}
            </FieldLabel>
            <Input
              id="v-title"
              placeholder={fields.placeholder('title') ?? t('videos.namePlaceholder')}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
          </div>

          {/* ტიპი — მართვადი ლექსიკონიდან, გვერდით „ახალი ტიპი" (5.1, ეტაპი 2) */}
          <div className={fields.shows('type_id') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="v-type" required={fields.required('type_id')} hint={fields.hint('type_id')}>
              {fields.label('type_id')}
            </FieldLabel>
            <div className="flex gap-1">
              <Select
                value={form.typeId}
                onValueChange={(v) => setForm((f) => ({ ...f, typeId: v }))}
              >
                <SelectTrigger
                  id="v-type"
                  className={errors.type_id ? 'border-destructive' : undefined}
                >
                  <SelectValue placeholder={t('validation.choose')} />
                </SelectTrigger>
                <SelectContent>
                  {types.map((type) => (
                    <SelectItem key={type.id} value={String(type.id)}>
                      {videoTypeName(type, lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => setNewType(true)}
                title={t('videoTypes.add')}
                aria-label={t('videoTypes.add')}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            {errors.type_id && <p className="mt-1 text-xs text-destructive">{errors.type_id}</p>}
          </div>

          {/* §6.4 — სტატუსი: ამ მოდულს ის ახლა გაუჩნდა */}
          <div className={fields.shows('status') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="v-status" required={fields.required('status')} hint={fields.hint('status')}>
              {fields.label('status')}
            </FieldLabel>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger
                id="v-status"
                className={errors.status ? 'border-destructive' : undefined}
              >
                <SelectValue placeholder={t('validation.choose')} />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.key}>
                    {statusName(s, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.status && <p className="mt-1 text-xs text-destructive">{errors.status}</p>}
          </div>
        </div>

        {fields.shows('description') && (
          <div>
            <FieldLabel htmlFor="v-desc" required={fields.required('description')} hint={fields.hint('description')}>
              {fields.label('description')}
            </FieldLabel>
            <Textarea
              id="v-desc"
              rows={3}
              placeholder={fields.placeholder('description')}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className={fields.shows('tags') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="v-tags" required={fields.required('tags')} hint={fields.hint('tags')}>
              {fields.label('tags')}
            </FieldLabel>
            {/* multi-select — იგივე ბიბლიოთეკა, რაც ჟანრებზე (L8) */}
            <TagSelect
              inputId="v-tags"
              options={allTags}
              value={form.tags}
              onChange={(tags) => setForm((f) => ({ ...f, tags }))}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('videos.tagsDedupeHint')}</p>
          </div>

          {/* 5.4 — thumbnail იმავე კომპონენტით, რითიც ფილმის პოსტერი */}
          <div className={fields.shows('thumbnail') ? undefined : 'hidden'}>
            <FieldLabel required={fields.required('thumbnail')} hint={fields.hint('thumbnail')}>
              {fields.label('thumbnail')}
            </FieldLabel>
            <PosterUploader
              variant="wide"
              hint={t('videos.thumbnailHint')}
              preview={thumbPreview}
              onSelect={(file) => {
                setThumbnail(file)
                setRemoveThumb(false)
                setThumbPreview(URL.createObjectURL(file))
              }}
              onClear={() => {
                setThumbnail(null)
                setThumbPreview(null)
                setRemoveThumb(true)
              }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
      </form>

      {/* §6 ფაზა 3 — მორგებული ველები (იხ. `CustomFieldsCard`: ბარათი თვითონ ინახავს თავს) */}
      <div className="mt-4">
        <CustomFieldsCard module="video" recordId={video?.id ?? null} />
      </div>

      {/* სწრაფი „ახალი ტიპი" — შენახვისთანავე select-ში ირჩევა */}
      {newType && (
        <VideoTypeDialog
          type={null}
          onClose={() => setNewType(false)}
          onSaved={(saved) => setForm((f) => ({ ...f, typeId: String(saved.id) }))}
        />
      )}
    </ModalShell>
  )
}
