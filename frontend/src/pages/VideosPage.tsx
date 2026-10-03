import { useEffect, useMemo, useRef, useState } from 'react'
import { StatusLabel } from '@/components/StatusBadge'
import { statusByKey, statusName, useStatuses } from '@/lib/statuses'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useListLimit } from '@/lib/paged'
import { ShowMore } from '@/components/ui/show-more'
import {
  Download,
  FileX,
  Globe,
  Link2,
  ListVideo,
  Loader2,
  Plus,
  Search,
  Tags,
} from 'lucide-react'
import {
  createVideo,
  deleteVideo,
  pickRandomVideos,
  setVideoStatus,
  deleteVideoDownload,
  fetchVideoDownloadStatus,
  fetchVideo,
  fetchVideoMetadata,
  fetchVideoTypes,
  fetchVideos,
  startVideoDownload,
  toggleVideoFavorite,
  updateVideo,
  type Video,
  type VideoFilters,
  type VideoInput,
  type VideoMetadata,
  type VideoType,
} from '@/api/videos'
import { fetchWebVideoDetails } from '@/api/web'
import { storageUrl } from '@/lib/api'
import { useModuleFields } from '@/lib/fields'
import { dedupeTags } from '@/lib/tags'
import { errorMessage, fieldErrors, translateCode } from '@/lib/errors'
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { videoTypeName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { formatDuration, isDirectMediaUrl, probeMediaDuration } from '@/lib/videoDuration'
import { usePlayer, videoItem } from '@/lib/player'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { PosterUploader } from '@/components/PosterUploader'
import { TagSelect } from '@/components/TagSelect'
import { DuplicateLinkNotice } from '@/components/DuplicateLinkNotice'
import { FloatingPick } from '@/components/FloatingPick'
import { RandomPickDialog } from '@/components/RandomPickDialog'
import { VideoCard } from '@/components/VideoCard'
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
import { DatePicker } from '@/components/ui/date-picker'
import { DurationInput } from '@/components/ui/duration-input'
import { FieldLabel, joinHints } from '@/components/ui/field-label'
import { FORM_TEXT_ROWS, FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { QuickFill } from '@/components/ui/quick-fill'
import { useRecordExtras } from '@/lib/customFieldDraft'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ModalShell } from '@/components/ui/modal-shell'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { favoriteAction, MENU_ICONS, statusActions, type MenuAction } from '@/components/ui/record-menu'
import { formatBytes } from '@/lib/utils'

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
  // ⚠️ სახელი „detail"-ია და არა „playing": §7.2-ის შემდეგ **დაკვრა
  // დამკვრელშია** (§35: გვერდითა პანელი ან ქვედა ზოლი), მოდალი კი
  // აღწერა/ფაილები/ჩანიშვნები/მსგავსებია და ვიდეოს დამკვრელს გადასცემს.
  const [detail, setDetail] = useState<Video | null>(null)
  /** Tasks §17 (Q4) — „რა ვნახო დღეს" ვიდეოებზეც; ბოლო პასუხის ჩანაწერები „გახსნა"-სთვის */
  const [pickOpen, setPickOpen] = useState(false)
  const picked = useRef<Record<number, Video>>({})
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

  /* Tasks §19.6 — ვებძებნის „უკვე ვიდეოებშია · გახსნა" → `?open=<id>`.
     ⚠️ ჩანაწერი id-ით მოდის და არა ჩატვირთული სიიდან (FEAT-17-ის წესი):
     ის შეიძლება მიმდინარე ფილტრს მიღმა იყოს. პარამეტრი მაშინვე იშლება,
     თორემ მოდალის დახურვა და „უკან" მას ხელახლა გახსნიდა. */
  useEffect(() => {
    const open = Number(params.get('open'))
    if (!open) return

    const next = new URLSearchParams(params)
    next.delete('open')
    setParams(next, { replace: true })

    fetchVideo(open)
      .then(setDetail)
      .catch((e) => toast({ title: errorMessage(e), variant: 'error' }))
  }, [params, setParams, toast])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['videos'] })
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const favorite = useMutation({ mutationFn: toggleVideoFavorite, onSuccess: invalidate, onError: fail })
  const remove = useMutation({ mutationFn: deleteVideo, onSuccess: invalidate, onError: fail })
  // Tasks §7 — სტატუსი კონტექსტური მენიუდან (სიაში ბეჯი მხოლოდ აჩვენებს)
  const status = useMutation({
    mutationFn: ({ id, next }: { id: number; next: string }) => setVideoStatus(id, next),
    onSuccess: invalidate,
    onError: fail,
  })

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

  const askDelete = async (v: Video) => {
    const ok = await confirm({
      title: t('videos.deleteTitle'),
      description: t('videos.deleteHint', { name: v.title }),
      variant: 'destructive',
    })
    if (ok) remove.mutate(v.id)
  }

  const askDropDownload = async (v: Video) => {
    const ok = await confirm({
      title: t('videos.local.removeTitle'),
      description: t('videos.local.removeHint', { name: v.title, size: formatBytes(v.download_size) }),
      variant: 'destructive',
    })
    if (ok) dropDownload.mutate(v.id)
  }

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
    /* GAP-12 — `download_error` ან ჩვენი მანქანური კოდია, ან yt-dlp-ის
       საკუთარი stderr; `translateCode()` პირველს თარგმნის და მეორეს ტოვებს. */
    if (v.download_status === 'failed') return translateCode(v.download_error) || t('videos.local.failed')
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

          {/* §20.4 — სვეტები `main`-ის სიგანეზე (`@container`), არა ეკრანისაზე */}
          <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @7xl:grid-cols-3">
            {videos.map((v, i) => {
              /* Tasks §7 — მარჯვენა ღილაკის მენიუ ბარათზე: გახსნა · დაკვრა · წყარო ·
                 სტატუსი ▸ · რჩეული · (ჩამოტვირთვა) · — · რედაქტირება · წაშლა */
              const actions: MenuAction[] = [
                { key: 'open', label: t('actions.open'), icon: MENU_ICONS.open, run: () => setDetail(v) },
                { key: 'play', label: t('playback.playFromHere'), icon: MENU_ICONS.play, run: () => void playFrom(i) },
                {
                  key: 'source',
                  label: t('videos.source'),
                  icon: MENU_ICONS.link,
                  run: () => window.open(v.url, '_blank', 'noopener,noreferrer'),
                },
                statusActions(t('form.status'), statuses, v.status, lang, (key) => status.mutate({ id: v.id, next: key })),
                favoriteAction(v.is_favorite, () => favorite.mutate(v.id), t),
                ...(!v.download_status || v.download_status === 'failed'
                  ? [{ key: 'download', label: t('videos.local.start'), icon: Download, run: () => download.mutate(v.id) }]
                  : []),
                /* §19.4 — ლოკალური ასლის წაშლა ბარათის ზოლიდან აქ გადმოვიდა: ზოლში ერთი ღილაკი დარჩა */
                ...(v.download_status === 'ready'
                  ? [{ key: 'drop', label: t('videos.local.remove'), icon: FileX, run: () => void askDropDownload(v) }]
                  : []),
                { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing(v) },
                { key: 'delete', label: t('actions.delete'), icon: MENU_ICONS.delete, danger: true, run: () => void askDelete(v) },
              ]
              return (
                <VideoCard
                  key={v.id}
                  video={v}
                  actions={actions}
                  lang={lang}
                  onOpen={() => setDetail(v)}
                  onPlay={() => void playFrom(i)}
                  onEdit={() => setEditing(v)}
                  onDelete={() => void askDelete(v)}
                  onToggleFavorite={() => favorite.mutate(v.id)}
                  favoritePending={favorite.isPending && favorite.variables === v.id}
                  download={{
                    hint: downloadHint(v),
                    available: !ytdlpQ.data || ytdlpQ.data.available,
                    pending: download.isPending,
                    onStart: () => {
                      if (ytdlpQ.data && !ytdlpQ.data.available) {
                        toast({ title: t('videos.local.unavailable'), variant: 'error' })
                        return
                      }
                      download.mutate(v.id)
                    },
                  }}
                />
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

      {/* Tasks §17 (Q4) — მოტივტივე კამათელი და დიალოგი ფილმების იგივე კომპონენტებით;
          „გახსნა" აქ ფანჯარაა (`VideoDetail`) და არა გვერდი. */}
      <FloatingPick module="video" onOpen={() => setPickOpen(true)} />
      {pickOpen && (
        <RandomPickDialog
          source={{
            domain: 'video',
            currentStatus: filters.status ?? null,
            filterKey: JSON.stringify(filters),
            fetch: async (opts) => {
              const list = await pickRandomVideos(filters, opts)
              picked.current = Object.fromEntries(list.map((v) => [v.id, v]))
              return list.map((v) => ({
                id: v.id,
                title: v.title,
                poster: storageUrl(v.thumbnail),
                shape: 'wide',
                year: v.published_at ? Number(v.published_at.slice(0, 4)) || null : null,
                rating: null,
                meta: [v.channel, v.type ? videoTypeName(v.type, lang) : null].filter((x): x is string => !!x),
                description: v.description,
                statusKey: v.status?.key ?? null,
              }))
            },
            setStatus: (id, key) => setVideoStatus(id, key),
            open: (record) => {
              const video = picked.current[record.id]
              if (!video) return
              setPickOpen(false)
              setDetail(video)
            },
            invalidate: [['videos']],
          }}
          onClose={() => setPickOpen(false)}
        />
      )}

      {detail && (
        <VideoDetail
          /* Tasks §8 — სია ახლდება რჩეულის შემდეგ, მოდალს ახალი ობიექტი უნდა მიუვიდეს */
          video={videos.find((v) => v.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
          // „მსგავსი ვიდეოზე" დაჭერა იმავე მოდალში გადაინაცვლებს (K4)
          onOpen={setDetail}
          /* §19.6 — „რედაქტირება" ფანჯრიდან: ფანჯარა იხურება, ფორმა იხსნება */
          onEdit={(v) => {
            setDetail(null)
            setEditing(v)
          }}
          /* §35.6 — სიაში მყოფი ვიდეო **გაფილტრულ სიას** აქედან უშვებს (ისევე,
             როგორც ბარათის „აქედან დაკვრა"); სიის გარეთა — `?open=`, დუბლის
             „გახსნა", „მსგავსი" — მარტო საკუთარ თავს, რიგის ჩანაცვლებით. */
          onPlay={(v) => {
            const at = videos.findIndex((x) => x.id === v.id)
            if (at >= 0) void playFrom(at)
            else player.play([videoItem(v, v.type ? videoTypeName(v.type, lang) : null)], 0, t('videos.title'))
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
          /* FEAT-17 — „ეს უკვე გაქვს → გახსნა". ⚠️ ჩანაწერი id-ით მოაქვს
             და არა ჩატვირთული სიიდან: დუბლი შეიძლება მიმდინარე ფილტრს
             მიღმა იყოს, ე.ი. სიაში მისი ძებნა ხშირად ვერაფერს იპოვიდა. */
          onOpenExisting={async (existingId) => {
            const found = await fetchVideo(existingId)
            setEditing(null)
            setDetail(found)
          }}
        />
      )}
    </PageContainer>
  )
}

/* ---------- ფორმა ---------- */

/** ⚠️ ზოლი `<form>`-ის გარეთაა და ფორმას `form="…"`-ით უშვებს */
const FORM_ID = 'video-form'

function VideoForm({
  video,
  allTags,
  types,
  onClose,
  onSaved,
  onOpenExisting,
}: {
  video: Video | null
  /** არსებული ტეგები შემოთავაზებისთვის (L8) */
  allTags: string[]
  types: VideoType[]
  onClose: () => void
  onSaved: () => void
  /** FEAT-17 — დუბლის გახსნა */
  onOpenExisting: (id: number) => void
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
    // Q52 — არხი და გამოქვეყნების დღე
    channel: video?.channel ?? '',
    publishedAt: video?.published_at ?? '',
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
  const qc = useQueryClient()
  // §26.5 — დამატებითი ველები ახალ ვიდეოზე; ჩავარდნისას შექმნილი რჩება
  const extras = useRecordExtras('video', video)

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
      const m = await fetchVideoMetadata(clean, video?.id)
      setMeta(m)
      fetchedDuration = m.duration
      if (m.duration) setDuration((d) => d ?? m.duration)
      setForm((f) => ({
        ...f,
        title: f.title || (m.title ?? ''),
        description: f.description || (m.description ?? ''),
        // Q52 — oEmbed-ის `author_name` არხია; თარიღს oEmbed არ აბრუნებს
        channel: f.channel || (m.author ?? ''),
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
   * უფასო გზამ ვერ მოიტანა (YouTube-ის შენი გასაღები „მონაცემებში" არ წერია).
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
        channel: f.channel || (found.channel ?? ''),
        publishedAt: f.publishedAt || (found.published ?? ''),
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
      extras.current ? updateVideo(extras.current.id, input) : createVideo(input),
    onSuccess: async (saved) => {
      const done = await extras.afterSave(saved)
      if (!done.ok) {
        qc.invalidateQueries({ queryKey: ['videos'] })
        toast({ title: done.message, variant: 'error' })

        return
      }

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

    // Tasks §13.3 — submit-ზე დუბლი უხმოდ იჭრება: `TagSelect` უკვე გააფრთხილა, აქ მხოლოდ გარანტია
    const { tags } = dedupeTags(form.tags)

    save.mutate({
      title: form.title,
      url: form.url,
      type_id: form.typeId ? Number(form.typeId) : null,
      status: form.status || undefined,
      description: form.description || undefined,
      // ⚠️ ცარიელი `null`-ად მიდის და არა `undefined`-ად — გასუფთავება ასე ინახება
      channel: form.channel.trim() || null,
      published_at: form.publishedAt || null,
      duration,
      tags,
      thumbnail,
      remove_thumbnail: removeThumb,
    })
  }

  /* ⚠️ ხანგრძლივობა ნაგულისხმევად დამალულია (§6) — ჩართვისას რიგი სამ
     სვეტად იყოფა, თორემ ორი ველი რიგის ორ მესამედს დაიკავებდა და ბოლო
     მესამედი ცარიელი დარჩებოდა. */
  const detailSize = fields.shows('duration') ? 'third' : 'half'

  return (
    <ModalShell title={t(video ? 'videos.edit' : 'videos.add')} onClose={onClose} wide>
      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-6">
        {/* §26.2 — ბმულიან მოდულში სწრაფი შევსება თვითონ ბმულის ველია.
            ⚠️ `url` `locked`-ია (§6.5): მისი გამორთვა ჩაწერას გატეხავდა — და
            სწორედ ამიტომ ითხოვს ჩაკეტვის ცხად მოხსნას (§4). ⚠️ `shows()`-ს
            მაინც ეკითხება, თორემ მოხსნის შემდეგ ჩამრთველი ტყუილი იქნებოდა. */}
        <QuickFill
          show={fields.shows('url')}
          title={fields.label('url')}
          htmlFor="v-url"
          required
          hint={t('videos.urlHint')}
          icon={<Link2 className="size-3.5 text-primary" />}
        >
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

          {/* ბმულიდან წამოღებული მონაცემი (K2) */}
          {metaLoading && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t('videos.metaLoading')}
            </p>
          )}
          {/* FEAT-17 — ბმულის დუბლი. ⚠️ `metaLoading`-ის მიღმაც ჩანს:
              ჩანაწერის არსებობა oEmbed-ის პასუხზე არ არის დამოკიდებული. */}
          {!metaLoading && meta?.existing && (
            <DuplicateLinkNotice title={meta.existing.title} onOpen={() => onOpenExisting(meta.existing!.id)} />
          )}
          {!metaLoading && meta && (
            <div className="mt-2 flex items-start gap-3 rounded-lg border border-border bg-card p-2">
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
        </QuickFill>

        {/* §26 — მთავარი ფოტო ზემოთაა, სათაურსა და აღწერასთან ერთად
            (5.4 — იმავე კომპონენტით, რითიც ფილმის პოსტერი) */}
        <FormSection
          title={t('form.sections.basic')}
          media={
            fields.shows('thumbnail') && (
              <>
                <FieldLabel required={fields.required('thumbnail')} hint={fields.hint('thumbnail')}>
                  {fields.label('thumbnail')}
                </FieldLabel>
                <PosterUploader
                  fill
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
              </>
            )
          }
        >
          <FormField {...fields.field('title')} htmlFor="v-title" error={errors.title}>
            <Input
              id="v-title"
              placeholder={fields.placeholder('title') ?? t('videos.namePlaceholder')}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </FormField>

          <FormField {...fields.field('description')} htmlFor="v-desc">
            <Textarea
              id="v-desc"
              rows={FORM_TEXT_ROWS}
              autoGrow
              placeholder={fields.placeholder('description')}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </FormField>
        </FormSection>

        <FormSection title={t('form.sections.classification')}>
          {/* ტიპი — მართვადი ლექსიკონიდან, გვერდით „ახალი ტიპი" (5.1, ეტაპი 2) */}
          <FormField size="half" {...fields.field('type_id')} htmlFor="v-type" error={errors.type_id}>
            <div className="flex gap-1">
              <Select value={form.typeId} onValueChange={(v) => setForm((f) => ({ ...f, typeId: v }))}>
                <SelectTrigger id="v-type" className={errors.type_id ? 'border-destructive' : undefined}>
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
          </FormField>

          {/* §6.4 — სტატუსი: ამ მოდულს ის ახლა გაუჩნდა */}
          <FormField size="half" {...fields.field('status')} htmlFor="v-status" error={errors.status}>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger id="v-status" className={errors.status ? 'border-destructive' : undefined}>
                <SelectValue placeholder={t('validation.choose')} />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.key}>
                    <StatusLabel status={s} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            {...fields.field('tags')}
            hint={joinHints(fields.hint('tags'), t('videos.tagsDedupeHint'))}
            htmlFor="v-tags"
          >
            {/* multi-select — იგივე ბიბლიოთეკა, რაც ჟანრებზე (L8) */}
            <TagSelect
              inputId="v-tags"
              options={allTags}
              value={form.tags}
              onChange={(tags) => setForm((f) => ({ ...f, tags }))}
            />
          </FormField>
        </FormSection>

        {/* Q52 — არხი და გამოქვეყნების დღე: ბმულის ჩასმა არხს ავსებს, ვებძებნა — ორივეს */}
        <FormSection title={t('form.sections.details')}>
          <FormField size={detailSize} {...fields.field('channel')} htmlFor="v-channel">
            <Input
              id="v-channel"
              maxLength={255}
              placeholder={fields.placeholder('channel')}
              value={form.channel}
              onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
            />
          </FormField>

          <FormField size={detailSize} {...fields.field('published_at')} htmlFor="v-published">
            <DatePicker
              id="v-published"
              value={form.publishedAt || null}
              onChange={(value) => setForm((f) => ({ ...f, publishedAt: value ?? '' }))}
            />
          </FormField>

          {/* …ხელით შეყვანა კი **არჩევითი ველია** (§5 → §6): default-ად
              გამორთულია და ირთვება `/modules/video`-ზე. საჭიროა მაშინ, როცა
              ავტომატიკა ვერ მუშაობს (მაგ. YouTube-ის კლავიშის გარეშე).
              §2.5 — წუთი + წამი (საათი გადამრთველით); ბაზაში ისევ წამები */}
          <FormField size={detailSize} {...fields.field('duration')} htmlFor="v-duration">
            <div className="flex flex-wrap items-center gap-2">
              <DurationInput id="v-duration" value={duration} onChange={setDuration} />
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {duration ? formatDuration(duration) : '—'}
              </span>
            </div>
          </FormField>
        </FormSection>
      </form>

      {/* §6 ფაზა 3 → §26.5 — დამატებითი ველები; ახალ ვიდეოზე მონახაზი */}
      <CustomFieldsCard
        module="video"
        recordId={extras.current?.id ?? null}
        draft={extras.draft}
        className="mt-6"
      />

      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />

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
