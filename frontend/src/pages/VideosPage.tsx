import { useEffect, useMemo, useRef, useState } from 'react'
import { StatusLabel } from '@/components/StatusBadge'
import { statusByKey, statusName, useStatuses } from '@/lib/statuses'
import { useDrillParams } from '@/lib/statsLinks'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePagedList } from '@/lib/paged'
import { usePageSize } from '@/lib/pageSize'
import { RICH_TEXT_MAX } from '@/lib/richText'
import { Pagination } from '@/components/ui/pagination'
import { RichText } from '@/components/ui/rich-text'
import {
  Download,
  ExternalLink,
  FileX,
  FolderOpen,
  Globe,
  HardDriveDownload,
  Link2,
  ListVideo,
  Loader2,
  MonitorPlay,
  Play,
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
  fetchVideoFolders,
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
import { fetchCourses } from '@/api/courses'
import { useModules } from '@/lib/modules'
import { Chip, ChipRow } from '@/components/ui/chip'
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
import { LocalVideoPlayer } from '@/components/LocalVideoPlayer'
import { VideoCard } from '@/components/VideoCard'
import { RecordActionBar } from '@/components/RecordActionBar'
import { DictionaryStatusMenu } from '@/components/StatusMenu'
import { useDateFormat } from '@/lib/dates'
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
import { Switch } from '@/components/ui/switch'
import { DatePicker } from '@/components/ui/date-picker'
import { DurationInput } from '@/components/ui/duration-input'
import { FieldLabel, joinHints } from '@/components/ui/field-label'
import { FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { QuickFill } from '@/components/ui/quick-fill'
import { useRecordExtras } from '@/lib/customFieldDraft'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { RecordList, RecordView } from '@/components/RecordView'
import { ViewToggle } from '@/components/ui/view-toggle'
import { PageSizePick } from '@/components/ui/page-size-pick'
import { useRecordLayout } from '@/lib/recordLayout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ModalShell } from '@/components/ui/modal-shell'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { favoriteAction, MENU_ICONS, statusActions, type MenuAction } from '@/components/ui/record-menu'
import { formatBytes } from '@/lib/utils'

/* ============================================================
   ვიდეოების მოდული.

   · ტიპი მართვადი ლექსიკონია (`video_types`), ფორმაში select + „ახალი ტიპი".
   · ფილტრები მარჯვენა პანელში: ტიპები, ტეგები, ძებნა, სორტირება (იგივე
     მოდელი, რაც ბიბლიოთეკაზე).
   · ტეგების დუბლი submit-ზე იჭრება, user-ს შეტყობინება ეძლევა.
   · thumbnail `PosterUploader`-ით (preview, drag&drop, წაშლა).
   · ხანგრძლივობის ხელით ველი მოიხსნა; ავტომატური probe რჩება.
   ============================================================ */

/** ფორმის „საქაღალდის გარეშე" — Radix-ის `Select` ცარიელ მნიშვნელობას არ იღებს */
const NO_COURSE = 'none'

/* `size`/`downloaded` ლოკალური ასლების სექციისთვისაა, მაგრამ ყველგან მუშაობს */
const SORTS = ['newest', 'oldest', 'title', 'watched', 'size', 'downloaded'] as const

/** პანელის ფილტრები — „ცარიელი" და მისი ტიპი ერთ ადგილას (`lib/filters.ts`) */
const EMPTY_FILTERS = { types: [] as string[], tags: [] as string[], downloaded: false }
type PanelFilters = typeof EMPTY_FILTERS

export function VideosPage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  // სტატუსების ლექსიკონი (სექციები, ბეჯი, ფორმა)
  const { data: statuses = [] } = useStatuses('video')
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()

  const [params, setParams] = useSearchParams()
  const search = params.toString()
  const view = params.get('view') ?? 'all'

  // მოქმედი ფილტრი მისამართშია (ბიბლიოთეკის მოდელი): საიდბარი და პანელი ერთსა და იმავეს ხედავს
  const types = useMemo(() => new URLSearchParams(search).get('type')?.split(',').filter(Boolean) ?? [], [search])
  const tags = useMemo(() => new URLSearchParams(search).get('tag')?.split(',').filter(Boolean) ?? [], [search])
  /* „მხოლოდ ჩამოტვირთული" პანელის გადამრთველია (`?downloaded=1`); საიდბარის
     სექცია (`?view=downloaded`) იგივეს აკეთებს სათაურითა და ჯამური ზომით */
  const downloadedParam = useMemo(() => new URLSearchParams(search).get('downloaded') === '1', [search])
  /** კურსის „საქაღალდე" (`?course=`) — სხვა ფილტრებთან ერთად მუშაობს */
  const courseId = Number(params.get('course')) || null

  // მონახაზში სტატუსი/რჩეული აღარაა — ის საიდბარის სექციაა (`?view=`)
  const [panelOpen, setPanelOpen] = useState(false)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('newest')
  const [editing, setEditing] = useState<Video | 'new' | null>(null)
  // ხედი მოდულზე ინახება; ნაგულისხმევი — ახლანდელი ბარათები
  const [layout, setLayout] = useRecordLayout('video', 'cards')
  const [pageSize, setPageSize, columns] = usePageSize('video', layout)
  const fmt = useDateFormat()
  // ⚠️ სახელი „detail"-ია და არა „playing": **დაკვრა
  // დამკვრელშია** (გვერდითა პანელი ან ქვედა ზოლი), მოდალი კი
  // აღწერა/ფაილები/ჩანიშვნები/მსგავსებია და ვიდეოს დამკვრელს გადასცემს.
  const [detail, setDetail] = useState<Video | null>(null)
  /** ლოკალური ასლის ფლეერი (ცალკე მოდალი, არა საერთო დამკვრელი) */
  const [local, setLocal] = useState<Video | null>(null)
  /** „რა ვნახო დღეს" ვიდეოებზეც; ბოლო პასუხის ჩანაწერები „გახსნა"-სთვის */
  const [pickOpen, setPickOpen] = useState(false)
  const picked = useRef<Record<number, Video>>({})
  const player = usePlayer()

  // ძებნა აკრეფისას — ჩამორჩენილი 350ms, backend ეძებს ყველა ველში
  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  const drill = useDrillParams()
  const filters: VideoFilters = {
    q: term || undefined,
    type_id: types.length ? types.join(',') : undefined,
    tag: tags.length ? tags.join(',') : undefined,
    favorite: view === 'favorite' ? true : undefined,
    // „ჩამოწერილები" საიდბარის სექციაა, ე.ი. `?view=`-ში ზის; პანელის გადამრთველიც
    downloaded: view === 'downloaded' || downloadedParam ? true : undefined,
    course: courseId ?? undefined,
    /* დანარჩენი `?view=` ლექსიკონის სტატუსია. ⚠️ „ყველა"/„რჩეული"/
       „ჩამოწერილი" სტატუსები არაა და ფილტრში არ უნდა გადავიდეს. */
    status:
      view !== 'all' && view !== 'favorite' && view !== 'downloaded' ? view : undefined,
    sort: sort === 'newest' ? undefined : sort,
    // სტატისტიკის ზოლიდან მოსული ჭრილი (თვე, წელი, შენი ქულა)
    ...drill,
  }

  // გვერდზე 10: ნომრები + „მეტის ჩვენება"; მიმდინარე გვერდი `?page=`-შია
  const query = usePagedList({
    queryKey: ['videos', filters],
    fetchPage: (page, per_page) => fetchVideos({ ...filters, page, per_page }),
    pageSize,
  })
  const typesQ = useQuery({ queryKey: ['video-types'], queryFn: fetchVideoTypes })
  // კურსების „საქაღალდეები" — ჩიპებად ბადის ზემოთ (კურსები ≥1 ვიდეოთი)
  const foldersQ = useQuery({ queryKey: ['videos', 'folders'], queryFn: fetchVideoFolders })
  const folders = foldersQ.data ?? []
  const folder = courseId ? folders.find((f) => f.id === courseId) : undefined
  const videos = query.items
  /** ⚠️ **გაფილტრული სიის** ჯამი და არა ჩატვირთულის — სათაურიც ამას წერს */
  const total = query.total
  const allTypes = useMemo(() => typesQ.data ?? [], [typesQ.data])

  /* დასაკრავი რიგი **გაფილტრული სიაა** და ჩაირთვება რიგრიგობით.
     ტიპის სახელი შიგთავსის ენაზეა, ამიტომ აქ ითარგმნება. */
  const queueItems = useMemo(
    () => videos.map((v) => videoItem(v, v.type ? videoTypeName(v.type, lang) : null)),
    [videos, lang],
  )

  /* ⚠️ დაკვრაზე **მთელი** გაფილტრული სია ჩამოდის და არა ჩატვირთული გვერდი —
     წესი გვერდებად დაყოფამდე ასეთი იყო და უცვლელი რჩება. მოთხოვნა მხოლოდ
     ცხად დაჭერაზე ხდება (და ქეშდება); წყარო თუ არ მოვიდა, ჩატვირთულს ვუკრავთ.
     ⚠️ საწყისი **id-ით** იძებნება და არა გვერდის ინდექსით: გვერდებად დაყოფის შემდეგ მეორე
     გვერდის პირველი ვიდეო ინდექსით 0 იყო — სრულ სიაში კი ეს პირველი გვერდის
     პირველია. სიის გარეთა ვიდეო (`?open=`, „მსგავსი") მარტო უკრავს. */
  const playFrom = async (video: Video) => {
    const item = (v: Video) => videoItem(v, v.type ? videoTypeName(v.type, lang) : null)
    let list = queueItems
    try {
      const full = await qc.fetchQuery({
        queryKey: ['videos', filters, 'queue'],
        queryFn: () => fetchVideos({ ...filters, all: true }),
      })
      list = full.items.map(item)
    } catch {
      // ჩატვირთული გვერდი რჩება
    }
    const at = list.findIndex((entry) => entry.id === video.id)
    if (at >= 0) player.play(list, at, t('videos.title'))
    else player.play([item(video)], 0, t('videos.title'))
  }

  /* „დაკვრა" ფანჯარას ხსნის და ვიდეო **იქვე** უკრავს
     (ფანჯრის ესკიზზე); „გატანის" შემდეგ — მოტივტივე ჩარჩოში, რიგით. */
  const playHere = (video: Video) => {
    setDetail(video)
    void playFrom(video)
  }

  /* რიგი წინ წავიდა, ფანჯარა კი წინა (ნაკრავ) ვიდეოს აჩვენებს →
     ფანჯარაც მიჰყვება და ვიდეო ფანჯარაში რჩება. ⚠️ მხოლოდ მაშინ, როცა ფანჯარა
     **ნაკრავ** ვიდეოს აჩვენებდა — სხვა ვიდეოს ფანჯარა არ იცვლება; „გატანილზე"
     ვიდეო ისედაც მოტივტივე ჩარჩოშია. */
  const shown = useRef<number | null>(null)
  const playingVideo = player.current?.kind === 'video' ? player.current.id : null
  useEffect(() => {
    if (!detail || playingVideo === null) return
    if (playingVideo === detail.id) {
      shown.current = playingVideo
      return
    }
    if (shown.current !== detail.id || player.popped) return
    shown.current = playingVideo
    const next = videos.find((v) => v.id === playingVideo)
    if (next) setDetail(next)
    else fetchVideo(playingVideo).then(setDetail).catch(() => {})
  }, [playingVideo, detail, player.popped, videos])

  // საიდბარის „დამატება" → `?new=1`
  useEffect(() => {
    if (params.get('new')) {
      setEditing('new')
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  /* ვებძებნის „უკვე ვიდეოებშია · გახსნა" → `?open=<id>`.
     ⚠️ ჩანაწერი id-ით მოდის და არა ჩატვირთული სიიდან:
     ის შეიძლება მიმდინარე ფილტრს მიღმა იყოს. პარამეტრი მაშინვე იშლება,
     თორემ მოდალის დახურვა და „უკან" მას ხელახლა გახსნიდა. */
  useEffect(() => {
    const open = Number(params.get('open'))
    if (!open) return

    // `?open=<id>&local=1` ლოკალურ ფლეერს ხსნის (თუ ასლი მზადაა)
    const wantLocal = params.get('local') === '1'
    const next = new URLSearchParams(params)
    next.delete('open')
    next.delete('local')
    setParams(next, { replace: true })

    fetchVideo(open)
      .then((v) => (wantLocal && v.download_status === 'ready' ? setLocal(v) : setDetail(v)))
      .catch((e) => toast({ title: errorMessage(e), variant: 'error' }))
  }, [params, setParams, toast])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['videos'] })
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const favorite = useMutation({ mutationFn: toggleVideoFavorite, onSuccess: invalidate, onError: fail })
  const remove = useMutation({ mutationFn: deleteVideo, onSuccess: invalidate, onError: fail })
  // სტატუსი კონტექსტური მენიუდან (სიაში ბეჯი მხოლოდ აჩვენებს)
  const status = useMutation({
    mutationFn: ({ id, next }: { id: number; next: string }) => setVideoStatus(id, next),
    onSuccess: invalidate,
    onError: fail,
  })

  /* ---------- ლოკალური ჩამოწერა ----------
     ⚠️ `yt-dlp`-ის ყოფნა **ერთხელ** იკითხება და ღილაკს ხსნის/კეტავს: მის
     გარეშე ღილაკი მაინც ჩანს, ოღონდ ამბობს, რომ პროგრამა არ არის — ჩუმად
     გამქრალი ღილაკი „რატომ არ მუშაობს"-ს ტოვებდა. */
  const ytdlpQ = useQuery({
    queryKey: ['videos', 'download-status'],
    queryFn: fetchVideoDownloadStatus,
    staleTime: 5 * 60 * 1000,
  })

  const download = useMutation({ mutationFn: startVideoDownload, onSuccess: invalidate, onError: fail })
  /* yt-dlp სერვერზე არ არის — მოთხოვნის ნაცვლად ახსნა */
  const startDownload = (v: Video) => {
    if (ytdlpQ.data && !ytdlpQ.data.available) {
      toast({ title: t('videos.local.unavailable'), variant: 'error' })
      return
    }
    download.mutate(v.id)
  }
  const dropDownload = useMutation({ mutationFn: deleteVideoDownload, onSuccess: invalidate, onError: fail })

  /* ⚠️ ჩამოწერა **ფონურად** მიდის (`artisan serve` ერთნაკადიანია), ე.ი.
     დასრულებას ვერავინ გვატყობინებს — სანამ თუნდაც ერთი `running`-ია,
     სია თვითონ იკითხება. ყველა სხვა დროს polling გამორთულია. */
  /* ⚠️ **გაჭედილი გაშვება polling-ს არ იმსახურებს**: მკვდარი
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
    /* `download_error` ან ჩვენი მანქანური კოდია, ან yt-dlp-ის
       საკუთარი stderr; `translateCode()` პირველს თარგმნის და მეორეს ტოვებს. */
    if (v.download_status === 'failed') return translateCode(v.download_error) || t('videos.local.failed')
    // ffmpeg-ის არქონა ხარისხს ჭრის და ეს დაწკაპუნებამდე უნდა ეწეროს
    return ytdlpQ.data && !ytdlpQ.data.ffmpeg
      ? `${t('videos.local.start')} · ${t('videos.local.noFfmpeg')}`
      : t('videos.local.start')
  }

  /** ფორმის ტეგების შემოთავაზებები — ყველა სექციიდან დანახული ტეგი გროვდება */
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
    if (next.downloaded) p.set('downloaded', '1')
    // საქაღალდე პანელის ფილტრი არ არის — მისამართში რჩება
    if (courseId) p.set('course', String(courseId))
    setPanelOpen(false)
    navigate({ pathname: '/videos', search: p.toString() })
  }

  /* მონახაზი, „ცვლილებაა?", გასუფთავება და მრიცხველი — ერთი აღწერა
     `lib/filters.ts`-ში. ⚠️ `clear()` **ორივე მხარეს** ასუფთავებს
     (მონახაზსაც და მისამართსაც) — ადრე მხოლოდ მისამართს წერდა და უკვე
     სუფთა მისამართზე დაჭერილი „გასუფთავება" ჩუმად არაფერს აკეთებდა. */
  const { draft, setDraft, dirty, apply, clear, activeCount } = useFilterDraft(
    { types, tags, downloaded: downloadedParam },
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
  /** საქაღალდის ჩიპი: არჩეულზე დაჭერა მას ხსნის; დანარჩენი ფილტრები რჩება */
  const openFolder = (id: number | null) => {
    const next = new URLSearchParams(params)
    next.delete('page')
    if (id) next.set('course', String(id))
    else next.delete('course')
    setParams(next)
  }

  const heading = folder
    ? folder.title
    : view === 'favorite'
      ? t('filter.favorite')
      : view === 'downloaded'
        ? t('videos.downloadedSection')
        : statusByKey(statuses, view)
          ? statusName(statusByKey(statuses, view), lang)
          : onlyType
            ? videoTypeName(onlyType, lang)
            : t('videos.title')

  /* ერთი მენიუ სამივე განლაგებაზე: გახსნა · დაკვრა · წყარო · სტატუსი ▸ · რჩეული ·
     (ჩამოტვირთვა) · — · რედაქტირება · წაშლა */
  const videoActions = (v: Video): MenuAction[] => [
    { key: 'open', label: t('actions.open'), icon: MENU_ICONS.open, run: () => setDetail(v) },
    { key: 'play', label: t('playback.playFromHere'), icon: MENU_ICONS.play, run: () => playHere(v) },
    {
      key: 'source',
      label: t('videos.source'),
      icon: MENU_ICONS.link,
      run: () => window.open(v.url, '_blank', 'noopener,noreferrer'),
    },
    statusActions(t('form.status'), statuses, v.status, lang, (key) => status.mutate({ id: v.id, next: key })),
    favoriteAction(v.is_favorite, () => favorite.mutate(v.id), t),
    /* ჩამოტვირთვა (გაჭედილისაც — „ხელახლა") და მზა ასლის დაკვრა/წაშლა — ბარათის ზოლიდან აქ
       გადმოვიდა: ბარათზე 2×2-ია, მდგომარეობას ესკიზის ბეჯი ამბობს */
    ...(!v.download_status || v.download_status === 'failed' || v.download_stale
      ? [{ key: 'download', label: t('videos.local.start'), icon: Download, disabled: download.isPending, run: () => startDownload(v) }]
      : []),
    ...(v.download_status === 'ready'
      ? [
          { key: 'local', label: t('videos.local.play'), icon: MonitorPlay, run: () => setLocal(v) },
          { key: 'drop', label: t('videos.local.remove'), icon: FileX, run: () => void askDropDownload(v) },
        ]
      : []),
    { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing(v) },
    { key: 'delete', label: t('actions.delete'), icon: MENU_ICONS.delete, danger: true, run: () => void askDelete(v) },
  ]

  return (
    <PageContainer>
      <PageHeader
        module="video"
        title={heading}
        /* „ჩამოტვირთული" სექციას თავისი სათაური და ჯამური ზომა აქვს */
        subtitle={
          filters.downloaded
            ? t('videos.local.total', { count: total, size: formatBytes(ytdlpQ.data?.downloaded_size ?? 0) })
            : t('videos.count', { count: total })
        }
        actions={
          <>
            {/* მთელი (გაფილტრული) სია რიგში — რიგის პირველი ღილაკი, როგორც სიმღერებში */}
            {videos.length > 0 && (
              <Button variant="outline" onClick={() => playHere(videos[0])}>
                <ListVideo className="size-4" />
                {t('playback.playAll')}
              </Button>
            )}
            {/* ბარათები · ბადე · სტრიქონები (მოდულზე ინახება) */}
            <ViewToggle value={layout} onChange={setLayout} />
            {/* „გვერდზე რამდენი“ — ხედის სვეტების ჯერადი, მოდულზე ინახება */}
            <PageSizePick value={pageSize} onChange={setPageSize} columns={columns} total={total} />
            {/* ძებნა — განმარტება tooltip-ია და არა `title` */}
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
          {/* კურსების „საქაღალდეები" — კურსი, რომლის ვიდეოებიც აქაა; არჩეულზე დაჭერა აბრუნებს ყველას */}
          {folders.length > 0 && (
            <div className="mb-4" data-testid="video-folders">
              <ChipRow>
                {folders.map((f) => (
                  <Chip
                    key={f.id}
                    active={f.id === courseId}
                    icon={<FolderOpen className="size-3.5" />}
                    count={f.videos_count}
                    onClick={() => openFolder(f.id === courseId ? null : f.id)}
                  >
                    {f.title}
                  </Chip>
                ))}
              </ChipRow>
            </div>
          )}
          {query.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {/* ⚠️ ცარიელი სექცია **თავს ხსნის**: ადრე ერთი ნაცრისფერი
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

          {/* ბარათები `VideoCard`-ითაა (ესკიზი, ბეჯები, ტეგები), ბადე და სტრიქონები — `RecordView`-ით;
              მენიუ ერთია (`videoActions`). სვეტები სიის ბარათების წესით (`RecordList` — სიის
              საკუთარი სიგანე, ≤ 3, ტელეფონზე ერთი) */}
          {layout === 'cards' ? (
            <RecordList layout="cards">
              {videos.map((v) => (
                <li key={v.id} data-testid="video-grid-item">
                  <VideoCard
                    video={v}
                    actions={videoActions(v)}
                    lang={lang}
                    onOpen={() => setDetail(v)}
                    onEdit={() => setEditing(v)}
                    onDelete={() => void askDelete(v)}
                    onToggleFavorite={() => favorite.mutate(v.id)}
                    favoritePending={favorite.isPending && favorite.variables === v.id}
                    downloadHint={downloadHint(v)}
                  />
                </li>
              ))}
            </RecordList>
          ) : (
            <RecordList layout={layout}>
              {videos.map((v) => (
                <RecordView
                  key={v.id}
                  title={v.title}
                  onOpen={() => setDetail(v)}
                  openLabel={t('actions.open')}
                  photo={storageUrl(v.thumbnail)}
                  shape="wide"
                  placeholder={<Play className="size-5" />}
                  meta={
                    <>
                      {v.type && <span>{videoTypeName(v.type, lang)}</span>}
                      {v.course && (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <FolderOpen className="size-3 shrink-0" />
                          <span className="truncate">{v.course.title}</span>
                        </span>
                      )}
                      {v.channel && <span className="truncate">{v.channel}</span>}
                      {v.published_at && <span>{fmt.date(v.published_at)}</span>}
                      {v.duration ? <span>{formatDuration(v.duration)}</span> : null}
                      {/* „ეს ლოკალურად მაქვს" სტრიქონშიც ჩანს */}
                      {v.download_status === 'ready' && (
                        <span className="inline-flex items-center gap-1 text-[var(--status-watched)]">
                          <HardDriveDownload className="size-3" />
                          {t('videos.local.ready')}
                        </span>
                      )}
                    </>
                  }
                  tags={v.tags}
                  actions={videoActions(v)}
                  onEdit={() => setEditing(v)}
                  bar={
                    <RecordActionBar
                      link={{ href: v.url, label: t('videos.source'), icon: ExternalLink, title: v.url }}
                      before={
                        /* რიგში ჩართვა: აქედან გაფილტრული სია უკრავს რიგრიგობით */
                        <Button variant="outline" size="sm" className="text-muted-foreground" onClick={() => playHere(v)}>
                          <ListVideo className="size-3.5" />
                          {t('playback.play')}
                        </Button>
                      }
                      status={
                        <DictionaryStatusMenu
                          status={v.status}
                          statuses={statuses}
                          label={t('form.status')}
                          emptyLabel={t('videos.noStatus')}
                          onChange={(key) => status.mutate({ id: v.id, next: key })}
                        />
                      }
                      favorite={{
                        active: v.is_favorite,
                        pending: favorite.isPending && favorite.variables === v.id,
                        onToggle: () => favorite.mutate(v.id),
                      }}
                      onEdit={() => setEditing(v)}
                      onDelete={() => void askDelete(v)}
                    />
                  }
                />
              ))}
            </RecordList>
          )}

          <Pagination {...query.pagination} />
        </div>

        {/* ---------- ფილტრები ---------- */}
        <FilterPanel
          activeCount={activeCount}
          dirty={dirty}
          onApply={() => apply(draft)}
          onClear={clear}
          open={panelOpen}
          onOpenChange={setPanelOpen}
        >
          {/* „მხოლოდ ჩამოტვირთული" (`downloaded=1`); სექციიდან იგივე `?view=downloaded`-ით მოდის */}
          <FilterGroup title={t('videos.local.tab')} count={draft.downloaded ? 1 : 0}>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-sm">
              <span>{t('videos.local.onlyDownloaded')}</span>
              <Switch
                checked={draft.downloaded}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, downloaded: v }))}
                aria-label={t('videos.local.onlyDownloaded')}
              />
            </label>
          </FilterGroup>

          {/* „ყველა"/„რჩეული" აქ განზრახ არ არის — ისინი საიდბარის სექციებია */}
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

      {/* მოტივტივე კამათელი და დიალოგი ფილმების იგივე კომპონენტებით;
          „გახსნა" აქ ფანჯარაა (`VideoDetail`) და არა გვერდი. */}
      <FloatingPick module="video" onOpen={() => setPickOpen(true)} />
      {pickOpen && (
        <RandomPickDialog
          source={{
            domain: 'video',
            currentStatus: filters.status ?? null,
            filterKey: JSON.stringify(filters),
            shape: 'wide',
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

      {/* ლოკალური ასლის ფლეერი; ფაილის წაშლაზე სია თავისით ახლდება */}
      {local && <LocalVideoPlayer video={videos.find((v) => v.id === local.id) ?? local} onClose={() => setLocal(null)} />}

      {detail && (
        <VideoDetail
          /* სია ახლდება რჩეულის შემდეგ, მოდალს ახალი ობიექტი უნდა მიუვიდეს */
          video={videos.find((v) => v.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
          // „მსგავსი ვიდეოზე" დაჭერა იმავე მოდალში გადაინაცვლებს
          onOpen={setDetail}
          /* „რედაქტირება" ფანჯრიდან: ფანჯარა იხურება, ფორმა იხსნება */
          onEdit={(v) => {
            setDetail(null)
            setEditing(v)
          }}
          /* სიაში მყოფი ვიდეო **გაფილტრულ სიას** აქედან უშვებს (ისევე,
             როგორც ბარათის „აქედან დაკვრა"); სიის გარეთა — `?open=`, დუბლის
             „გახსნა", „მსგავსი" — მარტო საკუთარ თავს, რიგის ჩანაცვლებით. */
          onPlay={(v) => void playFrom(v)}
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
          /* „ეს უკვე გაქვს → გახსნა". ⚠️ ჩანაწერი id-ით მოაქვს
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
  /** არსებული ტეგები შემოთავაზებისთვის */
  allTags: string[]
  types: VideoType[]
  onClose: () => void
  onSaved: () => void
  /** დუბლის გახსნა */
  onOpenExisting: (id: number) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  // სტატუსების ლექსიკონი (სექციები, ბეჯი, ფორმა)
  const { data: statuses = [] } = useStatuses('video')
  const { toast } = useToast()

  const [form, setForm] = useState({
    title: video?.title ?? '',
    url: video?.url ?? '',
    description: video?.description ?? '',
    // არხი და გამოქვეყნების დღე
    channel: video?.channel ?? '',
    publishedAt: video?.published_at ?? '',
    // ახალ ვიდეოს პირველი ტიპი ენიჭება — select ცარიელი არ რჩება
    // ⚠️ აღარ იყენებს პირველ ტიპს ნაგულისხმევად: არჩევანი მომხმარებლისაა
    typeId: video?.type_id ? String(video.type_id) : '',
    // კურსი („საქაღალდე"); `NO_COURSE` — საქაღალდის გარეშე
    courseId: video?.course_id ? String(video.course_id) : NO_COURSE,
    // გასაღები; ცარიელი = ნაგულისხმევი (backend დაადებს)
    status: video?.status?.key ?? '',
    tags: video?.tags ?? [],
  })
  // ხანგრძლივობა ავტომატურია; ხელით შეყვანა არჩევითი ველია
  const [duration, setDuration] = useState<number | null>(video?.duration ?? null)
  // რომელი ველი ჩანს, რა ჰქვია და სავალდებულოა თუ არა
  const fields = useModuleFields('video')
  /* კურსები „საქაღალდის" ასარჩევად — მხოლოდ თუ კურსების მოდული ჩართულია
     (თორემ `GET /courses` 403-ს დააბრუნებდა) */
  const { has } = useModules()
  const coursesQ = useQuery({
    queryKey: ['courses', 'video-folder-pick'],
    queryFn: () => fetchCourses({ all: true }).then((p) => p.items),
    enabled: has('course'),
  })
  const courses = coursesQ.data ?? []
  // შენახული კურსი ურნაში შეიძლება იყოს — მაშინ სიაში არ ჩანს, ველი კი მაინც უნდა ჩანდეს
  const hasCourses = courses.length > 0 || !!video?.course_id
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [thumbPreview, setThumbPreview] = useState<string | null>(storageUrl(video?.thumbnail))
  /* ბმულიდან მოსული ფოტო **პირდაპირ ჩარჩოშია** (URL-ით); შენახვისას
     `thumbnail_url`-ად მიდის და სერვერი ზუსტად მას იწერს. ატვირთული და უკვე შენახული
     ფოტო უპირატესია (`thumbPreview`). */
  const [linkThumb, setLinkThumb] = useState<string | null>(null)
  const [removeThumb, setRemoveThumb] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [meta, setMeta] = useState<VideoMetadata | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [probing, setProbing] = useState(false)
  // SerpApi-ით დეტალების წამოღება (YouTube-ის გასაღების გარეშე)
  const [webLoading, setWebLoading] = useState(false)
  const [newType, setNewType] = useState(false)
  const lastFetched = useRef<string>(video?.url ?? '')
  const qc = useQueryClient()
  // დამატებითი ველები ახალ ვიდეოზე; ჩავარდნისას შექმნილი რჩება
  const extras = useRecordExtras('video', video)

  /**
   * ბმულის ჩასმისთანავე ვცდილობთ სათაურის/thumbnail-ის/ხანგრძლივობის წამოღებას.
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
        // oEmbed-ის `author_name` არხია; თარიღი Data API-დან ან yt-dlp-დან
        channel: f.channel || (m.author ?? ''),
        publishedAt: f.publishedAt || (m.published_at ?? ''),
        tags: f.tags.length ? f.tags : m.tags,
      }))
      setLinkThumb(m.image_url)
    } catch {
      setMeta(null)
    } finally {
      setMetaLoading(false)
    }

    // პირდაპირ ფაილზე (.mp4/.webm) oEmbed/API არ არსებობს და ffprobe backend-ზე
    // არ გვაქვს — ხანგრძლივობას ბრაუზერი კითხულობს `<video>`-ით
    if (!fetchedDuration && isDirectMediaUrl(clean)) {
      setProbing(true)
      const seconds = await probeMediaDuration(clean)
      setProbing(false)
      if (seconds) setDuration((d) => d ?? seconds)
    }
  }

  /**
   * ხანგრძლივობისა და სათაურის წამოღება **SerpApi-დან**, როცა
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
      // ნაპოვნი ფოტოც ჩარჩოში (ადრე იკარგებოდა); ბმულისა უპირატესია
      if (found.thumbnail) setLinkThumb((l) => l ?? found.thumbnail)
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


  /* ⚠️ **დამალულ ველზე წითელი ტექსტი არავის უნახავს**: ბლოკი
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

    // submit-ზე დუბლი უხმოდ იჭრება: `TagSelect` უკვე გააფრთხილა, აქ მხოლოდ გარანტია
    const { tags } = dedupeTags(form.tags)

    save.mutate({
      title: form.title,
      url: form.url,
      type_id: form.typeId ? Number(form.typeId) : null,
      // დამალულ ველს არ ვეხებით — თორემ საქაღალდიდან ჩუმად ამოიღებდა
      course_id: fields.shows('course_id') ? (form.courseId === NO_COURSE ? null : Number(form.courseId)) : undefined,
      status: form.status || undefined,
      description: form.description || undefined,
      // ⚠️ ცარიელი `null`-ად მიდის და არა `undefined`-ად — გასუფთავება ასე ინახება
      channel: form.channel.trim() || null,
      published_at: form.publishedAt || null,
      duration,
      tags,
      thumbnail,
      remove_thumbnail: removeThumb,
      // ჩარჩოში ნაჩვენები ბმულის ფოტო (ატვირთული/შენახული თუ არ არის)
      thumbnail_url: !thumbnail && !thumbPreview ? linkThumb : null,
    })
  }

  /* ⚠️ ხანგრძლივობა ნაგულისხმევად დამალულია — ჩართვისას რიგი სამ
     სვეტად იყოფა, თორემ ორი ველი რიგის ორ მესამედს დაიკავებდა და ბოლო
     მესამედი ცარიელი დარჩებოდა. */
  const detailSize = fields.shows('duration') ? 'third' : 'half'

  return (
    <ModalShell title={t(video ? 'videos.edit' : 'videos.add')} onClose={onClose} wide>
      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-6">
        {/* ბმულიან მოდულში სწრაფი შევსება თვითონ ბმულის ველია.
            ⚠️ `url` `locked`-ია: მისი გამორთვა ჩაწერას გატეხავდა — და
            სწორედ ამიტომ ითხოვს ჩაკეტვის ცხად მოხსნას. ⚠️ `shows()`-ს
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

          {/* ბმულიდან წამოღებული მონაცემი */}
          {metaLoading && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t('videos.metaLoading')}
            </p>
          )}
          {/* ბმულის დუბლი. ⚠️ `metaLoading`-ის მიღმაც ჩანს:
              ჩანაწერის არსებობა oEmbed-ის პასუხზე არ არის დამოკიდებული. */}
          {!metaLoading && meta?.existing && (
            <DuplicateLinkNotice title={meta.existing.title} onOpen={() => onOpenExisting(meta.existing!.id)} />
          )}
          {!metaLoading && meta && (
            <div className="mt-2 flex items-start gap-3 rounded-lg border border-border bg-card p-2">
              {meta.image_url && (
                <img src={meta.image_url} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 text-xs text-muted-foreground">
                <p className="truncate text-foreground">{meta.title ?? t('videos.metaNoTitle')}</p>
                {/* აღწერაც ბარათშია, ორ ხაზად */}
                {meta.description && <p className="line-clamp-2">{meta.description}</p>}
                <p className="capitalize">
                  {meta.platform}
                  {meta.author && ` · ${meta.author}`}
                  {duration ? ` · ${formatDuration(duration)}` : ''}
                </p>
                {/* გასაღების გარეშეც სრული ინფო მოდის, თუ yt-dlp დაყენებულია; ვებძებნა მხოლოდ ბოლო საშუალებაა */}
                {meta.platform === 'youtube' && !meta.youtube_key && !meta.ytdlp && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span>{t('videos.metaNeedsKey')}</span>
                    {/* SerpApi ამას გასაღების გარეშე ავსებს, მაგრამ
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
          {/* ხანგრძლივობა ავტომატურად წამოდის… */}
          {probing && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t('videos.durationProbing')}
            </p>
          )}
        </QuickFill>

        {/* მთავარი ფოტო ზემოთაა, სათაურსა და აღწერასთან ერთად
            (5.4 — იმავე კომპონენტით, რითიც ფილმის პოსტერი) */}
        <FormSection
          title={t('form.sections.basic')}
          mediaVariant="wide"
          mediaLabel={
            <FieldLabel required={fields.required('thumbnail')} hint={fields.hint('thumbnail')}>
              {fields.label('thumbnail')}
            </FieldLabel>
          }
          media={
            fields.shows('thumbnail') && (
              <PosterUploader
                fill
                variant="wide"
                hint={t('videos.thumbnailHint')}
                preview={thumbPreview ?? linkThumb}
                onSelect={(file) => {
                  setThumbnail(file)
                  setRemoveThumb(false)
                  setThumbPreview(URL.createObjectURL(file))
                }}
                onClear={() => {
                  setThumbnail(null)
                  setThumbPreview(null)
                  setLinkThumb(null)
                  setRemoveThumb(true)
                }}
              />
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
            <RichText
              id="v-desc"
              label={fields.label('description')}
              maxLength={RICH_TEXT_MAX}
              placeholder={fields.placeholder('description')}
              value={form.description}
              onChange={(v) => setForm((f) => ({ ...f, description: v }))}
            />
          </FormField>
        </FormSection>

        <FormSection title={t('form.sections.classification')}>
          {/* ტიპი — მართვადი ლექსიკონიდან, გვერდით „ახალი ტიპი" */}
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

          {/* სტატუსი: ამ მოდულს ის ახლა გაუჩნდა */}
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

          {/* კურსი — „საქაღალდე" ვიდეოებში (კურსების მოდული თუ ჩართულია) */}
          {hasCourses && (
            <FormField {...fields.field('course_id')} htmlFor="v-course" error={errors.course_id}>
              <Select value={form.courseId} onValueChange={(v) => setForm((f) => ({ ...f, courseId: v }))}>
                <SelectTrigger id="v-course">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_COURSE}>{t('videos.noCourse')}</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}

          <FormField
            {...fields.field('tags')}
            hint={joinHints(fields.hint('tags'), t('videos.tagsDedupeHint'))}
            htmlFor="v-tags"
          >
            {/* multi-select — იგივე ბიბლიოთეკა, რაც ჟანრებზე */}
            <TagSelect
              inputId="v-tags"
              options={allTags}
              value={form.tags}
              onChange={(tags) => setForm((f) => ({ ...f, tags }))}
            />
          </FormField>
        </FormSection>

        {/* არხი და გამოქვეყნების დღე: ბმულის ჩასმა არხს ავსებს, ვებძებნა — ორივეს */}
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

          {/* …ხელით შეყვანა კი **არჩევითი ველია**: default-ად
              გამორთულია და ირთვება `/modules/video`-ზე. საჭიროა მაშინ, როცა
              ავტომატიკა ვერ მუშაობს (მაგ. YouTube-ის კლავიშის გარეშე).
              წუთი + წამი (საათი გადამრთველით); ბაზაში ისევ წამები */}
          {/* ერთი ჩარჩო ერთ ხაზზე, ჯამი შიგნით (ვიწრო ველში თვითონ იმალება) */}
          <FormField size={detailSize} {...fields.field('duration')} htmlFor="v-duration">
            <DurationInput id="v-duration" value={duration} onChange={setDuration} />
          </FormField>
        </FormSection>
      </form>

      {/* დამატებითი ველები; ახალ ვიდეოზე მონახაზი */}
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
