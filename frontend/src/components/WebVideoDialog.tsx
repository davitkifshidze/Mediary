import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  CopyCheck,
  ExternalLink,
  ListPlus,
  Loader2,
  Play,
  Search,
  VideoOff,
  X,
} from 'lucide-react'
import { updateModuleSettings } from '@/api/account'
import { searchWebVideos, webSearchStatus, type SerpQuota, type SerpSource, type SerpVideo } from '@/api/web'
import { saveGalleryVideo, type GalleryParentKind } from '@/api/gallery'
import { createVideo, fetchVideoTypes } from '@/api/videos'
import { useAuth } from '@/lib/auth'
import { useDateFormat } from '@/lib/dates'
import { videoTypeName } from '@/lib/display'
import { errorMessage } from '@/lib/errors'
import { useModules } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import { statusName, useStatuses } from '@/lib/statuses'
import { formatDuration } from '@/lib/videoDuration'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { Pager } from '@/components/ui/pager'
import { PHOTO_PAGE_ALL, PHOTO_PAGE_DEFAULT, PhotoPageSizePick } from '@/components/ui/photo-grid'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StepSection } from '@/components/ui/step-section'
import { useToast } from '@/components/ui/feedback'
import { WebSearchCost, WebSourcePicker } from '@/components/WebSourcePicker'

/* ============================================================
   **ვიდეოს ძებნა ვებში და ბმულის შენახვა (Tasks §8.4).**

   ⚠️ **არაფერი ჩამოიწერება**: ვიდეო ბმულია, ესკიზი დაშორებული URL — ე.ი.
   კვოტა საერთოდ არ იხარჯება (ბუკმარკის `og:image`-ის წესი).

   ⚠️ **ცენზურა და დაბინდვა არსად არის.** `safe` ისედაც `false`-ია
   (`WebSearchController`-ის ნაგულისხმევი) და ესკიზი ბლარის გარეშე ჩანს.
   კოდში შიგთავსის კლასიფიკაცია **არ იწერება** — შენი პირდაპირი პირობა.

   ⚠️ **ძებნა მხოლოდ ღილაკზე** — 250 ძებნაა თვეში მთელ ანგარიშზე, ე.ი.
   ერთი „ჩუმი" ავტომატური გამოძახება ბიუჯეტს დღეებში აჭმევს.

   ⚠️ **ვიზუალი ფოტოს დიალოგისაა** (ეტაპი 5, 2026-09-13): იგივე
   `StepSection`, იგივე `EmptyState` და იგივე „ძებნა სხვა წყაროთი" ღილაკები.

   ## Tasks §19 (2026-09-27)
   შენი მოთხოვნა: „ვიდეოს შედეგებს „შენახვა“ და „გახსნა“ აქვს — შეიძლებოდეს
   ვიდეოების სექციაში დამატებაც: ან შენახვა მიმდინარე ფილმში, ან დამატება
   ვიდეოებში — სახელით, ბმულით და რაც გაიპარსება — და „გადაუწყვეტელში“
   ჩავარდეს."

   ⚠️ **ორი სხვადასხვა შენახვაა და ორივე სახელით ითქმის.** „გალერეაში" —
   `gallery_videos`-ის ბმული ამ ჩანაწერზე/მსახიობზე; „ვიდეოებში" — ვიდეოების
   მოდულის ახალი ჩანაწერი. ორივე „შენახვა" რომ ერქვას, ღილაკი არ იტყოდა, სად.

   ⚠️ **ტიპი სავალდებულოა და ნაგულისხმევი არ არსებობს** (2026-09-16-ის
   წესი) — ამიტომ ამრჩევი **სათაურის მიმაგრებულ ზოლშია** (Q14) და ბოლო
   არჩევანი `module_user.settings`-ში იწერება: სხვა მოწყობილობაზეც ახსოვს
   და ყოველ დამატებაზე აღარ გკითხავს. ⚠️ დამახსოვრებული ტიპი თუ წაიშალა,
   ამრჩევი ცარიელდება — ძველი id-ით გაგზავნა 422 იქნებოდა.

   ⚠️ **სტატუსი ლექსიკონის ნაგულისხმევია** („გადაუწყვეტელი") და ფანჯარა მას
   სახელით ამბობს. სათაური, აღწერა, ხანგრძლივობა, **არხი და გამოქვეყნების
   თარიღი** (Q52) შედეგიდან მიდის; ცარიელს (მთავარი ფოტო, არხი, თუ შედეგს
   არ ჰქონდა) `POST /videos`-ის ავტოშევსება ავსებს (`metadata`-ს ლოგიკა).

   ⚠️ **„უკვე ვიდეოებშია" სერვერი ამბობს** — ძებნის პასუხში (`existing`,
   FEAT-17-ის `DuplicateLink`), ე.ი. ღილაკი ჯერ „დამატებად" და მერე „უკვე
   გაქვს"-ად არ გადაიხატება. „გახსნა" ახალ ჩანართშია: ძებნის შედეგები აქ რჩება.
   ============================================================ */

export function WebVideoDialog({
  target,
  id,
  initialQuery,
  title,
  onClose,
  onSaved,
}: {
  target: GalleryParentKind | 'cast_member'
  id: number
  initialQuery: string
  title: string
  onClose: () => void
  onSaved?: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { toast } = useToast()
  const { can } = useAuth()
  const { has, all } = useModules()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  /* ⚠️ **თარიღი ერთი წესით იხატება** — `published` ახლა `Y-m-d`-ია
     (`SerpApiClient::publishedDate()`), ე.ი. ის ისევე უნდა გამოჩნდეს,
     როგორც აპლიკაციის დანარჩენი თარიღები. */
  const { date } = useDateFormat()

  const [query, setQuery] = useState(initialQuery)
  const [engines, setEngines] = useState<string[]>([])
  const [items, setItems] = useState<SerpVideo[]>([])
  const [sources, setSources] = useState<SerpSource[]>([])
  const [quota, setQuota] = useState<SerpQuota | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [searched, setSearched] = useState(false)
  /** §19.4 — რამდენი ჩანს ერთ გვერდზე (`0` = ყველა) და რომელი გვერდია */
  const [pageSize, setPageSize] = useState(PHOTO_PAGE_DEFAULT)
  const [page, setPage] = useState(1)
  /** §19.6 — აქვე ვიდეოებში დამატებული: ბმული → ახალი ჩანაწერი */
  const [inVideos, setInVideos] = useState<Record<string, { id: number; title: string | null }>>({})
  /** ამ ფანჯარაში არჩეული ტიპი; `null` = დამახსოვრებული */
  const [typeChoice, setTypeChoice] = useState<number | null>(null)

  /** §19.6 — ღილაკი მხოლოდ მაშინ, როცა ვიდეოების მოდული ჩართულია და შექმნის უფლება გაქვს */
  const canAddVideo = has('video') && can('video', 'create')

  // ⚠️ სტატუსი **კვოტას არ ხარჯავს** (`GET /account`)
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['web', 'status'],
    queryFn: webSearchStatus,
    staleTime: 60_000,
  })
  // ⚠️ იგივე გასაღები, რასაც ვიდეოების გვერდი კითხულობს — ერთი ქეში
  const { data: types = [] } = useQuery({
    queryKey: ['video-types'],
    queryFn: fetchVideoTypes,
    enabled: canAddVideo,
  })
  const { data: statuses = [] } = useStatuses('video', canAddVideo)

  const remembered = Number(all.find((m) => m.key === 'video')?.user_settings?.web_type_id) || null
  /** ⚠️ წაშლილი ტიპი არ ითვლება — ამრჩევი ცარიელდება და ღილაკი მიზეზს ამბობს */
  const chosenType = types.find((type) => type.id === (typeChoice ?? remembered)) ?? null
  /** ლექსიკონის ნაგულისხმევი („გადაუწყვეტელი"); ნაგულისხმევი თუ მოხსნილია — მისი გასაღები, მერე პირველი */
  const defaultStatus =
    statuses.find((s) => s.is_default) ?? statuses.find((s) => s.key === 'undecided') ?? statuses[0] ?? null

  const rememberType = useMutation({
    mutationFn: (typeId: number) => updateModuleSettings('video', { web_type_id: typeId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modules'] }),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const pickType = (typeId: number) => {
    setTypeChoice(typeId)
    rememberType.mutate(typeId)
  }

  const available = status?.sources.videos ?? []
  const selected = engines.length ? engines : available.slice(0, 1).map((e) => e.key)
  const shownQuota =
    quota ?? (status ? { used: status.used, limit: status.limit, remaining: status.remaining } : null)

  /** ⚠️ არჩეული წყარო პარამეტრად მიდის — იხ. `WebImageDialog`-ის იგივე ადგილი */
  const search = useMutation({
    mutationFn: (vars: { q: string; engines?: string[] }) =>
      // §19.4 — ერთი ძახილი ყოველთვის ერთი ძებნაა, რამდენიც არ უნდა ვთხოვოთ;
      // „რამდენი გამოჩნდეს" უკვე ჩამოსულზე იყოფა
      searchWebVideos({ query: vars.q, engines: vars.engines ?? selected, limit: 100 }),
    onSuccess: (data) => {
      setItems(data.items)
      setSources(data.sources)
      setQuota(data.quota)
      setSearched(true)
      setPage(1)
      toast({
        title: data.spent > 0 ? t('web.spent', { count: data.spent }) : t('web.fromCache'),
        variant: data.items.length ? 'success' : 'info',
      })
      qc.invalidateQueries({ queryKey: ['web', 'status'] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const runSearch = (override?: string[]) => {
    const q = query.trim()
    if (q) search.mutate({ q, engines: override })
  }

  const save = useMutation({
    mutationFn: (video: SerpVideo) =>
      saveGalleryVideo({
        target,
        id,
        url: video.link,
        title: video.title,
        channel: video.channel,
        duration: video.duration,
        published_at: video.published,
        thumbnail_url: video.thumbnail,
        source_url: video.link,
        engine: video.engine,
      }),
    onSuccess: (result, video) => {
      setSaved((cur) => new Set(cur).add(video.link))
      toast({
        title: result.duplicate ? t('web.videoAlreadySaved') : t('web.videoSaved'),
        variant: result.duplicate ? 'info' : 'success',
      })
      qc.invalidateQueries({ queryKey: ['gallery-videos'] })
      qc.invalidateQueries({ queryKey: ['gallery-summary'] })
      onSaved?.()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /**
   * §19.6 — ვიდეოების მოდულის ახალი ჩანაწერი.
   *
   * ⚠️ სათაური და აღწერა ძებნის შედეგიდან მიდის; ცარიელ ველებს (მთავარი
   * ფოტო, ხანგრძლივობა) სერვერის ავტოშევსება ავსებს — ზუსტად ისე, როგორც
   * ფორმაში ბმულის ჩასმისას. ⚠️ ტიპი და სტატუსი სავალდებულოა, ღილაკი კი მათ
   * გარეშე არააქტიურია — ე.ი. 422-მდე აქ არაფერი მიდის.
   */
  const addVideo = useMutation({
    mutationFn: (video: SerpVideo) =>
      createVideo({
        title: video.title ?? '',
        url: video.link,
        type_id: chosenType?.id,
        status: defaultStatus?.key,
        description: video.description ?? undefined,
        duration: video.duration,
        // Q52 — ცარიელი არ იგზავნება: სერვერმა არხი oEmbed-იდან შეავსოს
        channel: video.channel ?? undefined,
        published_at: video.published ?? undefined,
      }),
    onSuccess: (created, video) => {
      setInVideos((cur) => ({ ...cur, [video.link]: { id: created.id, title: created.title } }))
      toast({ title: t('web.addedToVideos', { name: created.title }), variant: 'success' })
      qc.invalidateQueries({ queryKey: ['videos'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** ⚠️ ჯერ აქვე დამატებული, მერე სერვერის პასუხი — ორივე ერთსა და იმავეს ნიშნავს */
  const existingOf = (video: SerpVideo) => inVideos[video.link] ?? video.existing ?? null
  const addBlocked = !chosenType || !defaultStatus

  // „იპოვა, მაგრამ გამოუსადეგარი" — ცალკე მდგომარეობა და ცალკე ტექსტი
  const dropped = useMemo(() => sources.reduce((sum, s) => sum + s.dropped, 0), [sources])
  const offline = useMemo(() => sources.filter((s) => !s.ok).map((s) => s.engine), [sources])
  /**
   * რომელი წყაროები დარჩა გამოუყენებელი — ცარიელ პასუხზე სწორედ ისინი გამოსადეგარია.
   * ⚠️ `useMemo` განზრახ არაა: `available` ყოველ რენდერზე ახალი მასივია.
   */
  const others = available.filter((e) => !selected.includes(e.key))

  /** §19.4 — მიმდინარე გვერდი უკვე ჩამოსული შედეგებიდან (ახალი ძებნის გარეშე) */
  const lastPage = pageSize === PHOTO_PAGE_ALL ? 1 : Math.max(1, Math.ceil(items.length / pageSize))
  const current = Math.min(page, lastPage)
  const shown =
    pageSize === PHOTO_PAGE_ALL ? items : items.slice((current - 1) * pageSize, current * pageSize)

  /* ⚠️ **ვიდეოს უფასო წყარო არ არსებობს** — ორივე engine SerpApi-სია, ე.ი.
     გასაღების გარეშე სია ცარიელია და ამას ცხადად ვამბობთ. */
  if (!statusLoading && status && available.length === 0) {
    return (
      <ModalShell title={title} onClose={onClose} wide>
        <p className="mt-4 text-sm text-muted-foreground">{t('errors.serpapi_unavailable')}</p>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </ModalFooter>
      </ModalShell>
    )
  }

  return (
    <ModalShell
      title={title}
      onClose={onClose}
      wide
      hint={t('web.videosHint')}
      aside={
        <>
          <WebSearchCost engines={available} selected={selected} quota={shownQuota} />

          {/* §19.6 / Q14 — ტიპი ერთხელ ირჩევა და ახსოვს; ზოლი მიმაგრებულია,
              ე.ი. შედეგების გადახვევისას ხილული რჩება */}
          {canAddVideo && (
            <span className="inline-flex items-center gap-1.5">
              <Select value={chosenType ? String(chosenType.id) : ''} onValueChange={(v) => pickType(Number(v))}>
                <SelectTrigger
                  aria-label={t('web.videoTypeLabel')}
                  className={cn(
                    'h-8 w-48 text-xs',
                    // ⚠️ შედეგები რომ ჩანს და ტიპი არ არის — სწორედ აქ უნდა შეიხედოს
                    !chosenType && items.length > 0 && 'border-destructive',
                  )}
                >
                  <SelectValue placeholder={t('web.videoTypePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {types.map((type) => (
                    <SelectItem key={type.id} value={String(type.id)}>
                      {videoTypeName(type, lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <InfoHint
                info={t('web.videoTypeHint', {
                  status: defaultStatus ? statusName(defaultStatus, lang) : '—',
                })}
              />
            </span>
          )}
        </>
      }
    >
      <div className="mt-5 space-y-3">
        {/* ---------- 1. რას ვეძებთ ---------- */}
        <StepSection step={1} title={t('web.stepQuery')}>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('web.queryPlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  runSearch()
                }
              }}
            />
            {/* §19.1 — ველი იცლება, ფოკუსი ველში ბრუნდება */}
            <Button
              type="button"
              variant="ghost"
              disabled={!query}
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
            >
              <X className="size-4" />
              {t('actions.clear')}
            </Button>
            <Button
              type="button"
              onClick={() => runSearch()}
              disabled={!query.trim() || search.isPending || available.length === 0}
            >
              {search.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {t('web.search')}
            </Button>
          </div>
        </StepSection>

        {/* ---------- 2. სად ვეძებთ ---------- */}
        <StepSection step={2} title={t('web.stepSources')}>
          <WebSourcePicker engines={available} selected={selected} onChange={setEngines} disabled={search.isPending} />
        </StepSection>

        {/* ---------- 3. შედეგები ---------- */}
        <StepSection
          step={3}
          title={t('web.stepResults')}
          status={items.length > 0 ? t('web.found', { count: items.length }) : undefined}
          action={
            items.length > 0 ? (
              <PhotoPageSizePick
                value={pageSize}
                total={items.length}
                onChange={(size) => {
                  setPageSize(size)
                  setPage(1)
                }}
              />
            ) : null
          }
        >
          {offline.length > 0 && (
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {t('web.sourceOffline', { engines: offline.join(', ') })}
            </p>
          )}

          {/* ⚠️ §19.6 — ღილაკი არააქტიურია და **მიზეზს ამბობს**: ტიპი სავალდებულოა */}
          {canAddVideo && items.length > 0 && !chosenType && (
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {t('web.videoTypeFirst')}
            </p>
          )}

          {items.length === 0 ? (
            /* ⚠️ სამი ცარიელი მდგომარეობა და სამივე სხვადასხვა ამბავია */
            <EmptyState
              icon={searched ? <VideoOff className="size-6" /> : <Search className="size-6" />}
              title={searched ? t('web.nothingFound') : t('web.notSearchedYet')}
              hint={
                searched
                  ? dropped > 0
                    ? t('web.foundUnusable', { count: dropped })
                    : undefined
                  : t('web.notSearchedHint')
              }
              actions={
                // ⚠️ ცარიელი მასივი `EmptyState`-ისთვის „არის" — ღილაკების
                // ცარიელი რიგი ზედმეტ ჰაერს დახატავდა
                searched && query.trim() && others.length > 0
                  ? others.map((engine) => (
                      <Button
                        key={engine.key}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={search.isPending}
                        onClick={() => {
                          setEngines([engine.key])
                          runSearch([engine.key])
                        }}
                      >
                        <Search className="size-3.5" />
                        {t('web.searchWith', { engine: engine.name })}
                      </Button>
                    ))
                  : undefined
              }
            />
          ) : (
            <ul className="fb-scroll grid max-h-[50vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {shown.map((video) => {
                const on = saved.has(video.link)
                const existing = canAddVideo ? existingOf(video) : null
                const adding = addVideo.isPending && addVideo.variables?.link === video.link

                return (
                  <li
                    key={video.link}
                    className={cn(
                      'flex gap-3 rounded-lg border bg-card p-3 transition-colors',
                      on ? 'border-primary' : 'border-border hover:border-primary/50',
                    )}
                  >
                    <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-md bg-muted">
                      {video.thumbnail && (
                        /* ⚠️ **ბლარი არსად** — ესკიზი ისე ჩანს, როგორც წყაროს აქვს */
                        <img
                          src={video.thumbnail}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="size-full object-cover"
                        />
                      )}
                      {video.duration != null && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                          {formatDuration(video.duration)}
                        </span>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="line-clamp-2 text-sm font-medium">{video.title ?? video.link}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {[video.channel, video.published ? date(video.published) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>

                      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={on ? 'outline' : 'default'}
                          disabled={on || save.isPending}
                          onClick={() => save.mutate(video)}
                        >
                          {on ? <Check className="size-3.5" /> : <Play className="size-3.5" />}
                          {on ? t('web.videoSavedShort') : t('web.saveVideo')}
                        </Button>

                        {canAddVideo &&
                          (existing ? (
                            /* ⚠️ ახალ ჩანართში — ძებნის შედეგები აქ რჩება */
                            <a
                              href={`/videos?open=${existing.id}`}
                              target="_blank"
                              rel="noreferrer"
                              title={existing.title ?? undefined}
                              className={buttonVariants({ variant: 'outline', size: 'sm' })}
                            >
                              <CopyCheck className="size-3.5" />
                              {t('web.inVideosOpen')}
                            </a>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={addBlocked || adding}
                              title={addBlocked ? t('web.videoTypeFirst') : undefined}
                              onClick={() => addVideo.mutate(video)}
                            >
                              {adding ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <ListPlus className="size-3.5" />
                              )}
                              {t('web.addToVideos')}
                            </Button>
                          ))}

                        <a
                          href={video.link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <ExternalLink className="size-3.5" />
                          {t('photos.infoOpen')}
                        </a>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {items.length > 0 && lastPage > 1 && (
            <Pager className="mt-4" page={current} lastPage={lastPage} total={items.length} onChange={setPage} />
          )}
        </StepSection>
      </div>

      <ModalFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('actions.close')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
