import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePagedList } from '@/lib/paged'
import { usePageSize } from '@/lib/pageSize'
import { useDrillParams } from '@/lib/statsLinks'
import { Pagination } from '@/components/ui/pagination'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Layers,
  Plus,
  Sparkles,
  FilterX,
} from 'lucide-react'
import { fetchGenres, mediaApi, type MediaFilters } from '@/api/media'
import { mediaKey, mediaOf, type MediaType } from '@/lib/media'
import {
  GROUP_BY_OPTIONS,
  useContentLang,
  useSettings,
  type GroupBy,
  type SortDir,
  type SortField,
} from '@/lib/settings'
import { genreName } from '@/lib/display'
import { statusByKey, statusName, useStatuses } from '@/lib/statuses'
import { MovieGrid } from '@/components/MovieGrid'
import { ViewToggle } from '@/components/ui/view-toggle'
import { PageSizePick } from '@/components/ui/page-size-pick'
import { useRecordLayout } from '@/lib/recordLayout'
import { DiscoverModal } from '@/components/DiscoverModal'
import { FilterPanel, FilterTrigger } from '@/components/FilterPanel'
import { LibraryFilterFields } from '@/components/LibraryFilterFields'
import { straightenRanges, useFilterDraft } from '@/lib/filters'
import {
  EMPTY_DRAFT,
  EMPTY_PICK_FILTER,
  GENRE_MODES,
  RANGE_PAIRS,
  pickFilterChips,
  pickFilterParams,
  type LibraryDraft as Draft,
  type LibraryPickFilter,
  type Ranges,
} from '@/lib/libraryFilter'
import { useModuleSetting } from '@/lib/moduleSetting'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { FloatingPick } from '@/components/FloatingPick'
import { SoonView } from '@/components/soon/SoonView'
import { ListSearch } from '@/components/ListSearch'
import { RandomPickDialog } from '@/components/RandomPickDialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** მედიის წელსა და ჩემს ქულას გვერდი თავის ფილტრის პანელში კითხულობს და არა ჭრილის ჩიპად */
const MEDIA_DRILL_EXCEPT = ['year_min', 'year_max', 'my_rating_min', 'my_rating_max']

/* ============================================================
   ბიბლიოთეკა — ბადე + მარჯვენა ფილტრების პანელი.

   ჟანრების ჩიპები (`GenreChips`) მოიხსნა: ჟანრი, სტატუსი, წელი და
   რეიტინგი ერთ პანელშია და **„გაფილტვრაზე"** მოქმედებს. ტულბარში
   მხოლოდ ისეთი კონტროლი რჩება, რაც ფილტრი არაა — ძებნა, დალაგება,
   ფრანჩაიზის დაჯგუფება და „აღმოაჩინე".
   ============================================================ */

/**
 * ⚠️ **„მალე" სიას არ ავიწროებს** — ის ფსევდო-სექციაა, რომელიც თავის ხედს ხატავს
 * (ჩემი გამოუსვლელი სათაურები · TMDB-ზე მალე). ფილტრი, დალაგება და გვერდები მას არ
 * ეხება, ამიტომ ცალკე კომპონენტია და არა კიდევ ერთი განშტოება სიის შიგნით.
 */
export function LibraryPage({ type = 'movie' }: { type?: MediaType }) {
  const [params] = useSearchParams()

  return params.get('view') === 'soon' ? <SoonView type={type} /> : <LibraryList type={type} />
}

function LibraryList({ type }: { type: MediaType }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  // სექციის სახელისთვის
  const { data: statuses = [] } = useStatuses(type)
  const { settings } = useSettings()
  // ხედი თითო დომენზე (ფილმი/სერიალი/ანიმე); ნაგულისხმევი — ახლანდელი ბარათები
  const [layout, setLayout] = useRecordLayout(type, 'cards')
  // ჟანრების რეჟიმი ფილტრი არ არის, არჩევანია: მაშინვე მოქმედებს და მოდულზე ახსოვს
  const [genreMode, setGenreMode] = useModuleSetting(type, 'genre_mode', GENRE_MODES, 'any')
  const [pageSize, setPageSize, columns] = usePageSize(type, layout, settings.cardSize)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const api = mediaApi(type)
  const { libraryPath, detailBase } = mediaOf(type)
  // `?view=`-ის გარეშე — ნაგულისხმევი სექცია პარამეტრებიდან
  const view = params.get('view') ?? settings.defaultView
  // ჟანრი URL-იდანაც მოდის (ჩანაწერის გვერდზე ჟანრზე დაჭერა)
  const genreParam = params.get('genre')

  const [q, setQ] = useState('')
  // ნაგულისხმევი სორტირება პარამეტრებიდან — შემდეგ ხელით იცვლება
  const [sortField, setSortField] = useState<SortField>(settings.defaultSortField)
  const [sortDir, setSortDir] = useState<SortDir>(settings.defaultSortDir)
  // ხელით შეცვლამდე ვყვებით პარამეტრს: `settings` backend-იდან პირველი
  // რენდერის **შემდეგ** მოდის, ე.ი. მარტო useState-ის საწყისი მნიშვნელობა ცოტაა
  const [sortTouched, setSortTouched] = useState(false)
  useEffect(() => {
    if (sortTouched) return
    setSortField(settings.defaultSortField)
    setSortDir(settings.defaultSortDir)
  }, [settings.defaultSortField, settings.defaultSortDir, sortTouched])
  // ფრანჩაიზის დაჯგუფება — მხოლოდ ფილმებს აქვს კოლექცია
  const [grouped, setGrouped] = useState(true)
  // ბადის სექციები — სორტირების იმავე ლოგიკით: ხელით შეცვლამდე
  // პარამეტრს ვყვებით, რადგან `settings` პირველი რენდერის შემდეგ მოდის
  const [groupBy, setGroupBy] = useState<GroupBy>(settings.defaultGrouping)
  const [groupTouched, setGroupTouched] = useState(false)
  useEffect(() => {
    if (groupTouched) return
    setGroupBy(settings.defaultGrouping)
  }, [settings.defaultGrouping, groupTouched])
  const [discoverOpen, setDiscoverOpen] = useState(false)
  /** „რა ვნახო დღეს" */
  const [pickOpen, setPickOpen] = useState(false)
  /** „ეს სია გაუზიარე" (გაზიარების ბმული მიმდინარე ფილტრით) */
  const [panelOpen, setPanelOpen] = useState(false)

  /* ---------- ფილტრები: მოქმედი (URL) + მონახაზი (state) ---------- */

  // მოქმედი ფილტრი **მისამართშია**, რომ საიდბარი, ბრაუზერის „უკან" და
  // გაზიარებული ბმული ერთსა და იმავეს ხედავდნენ. პანელი მხოლოდ მონახაზს ცვლის.
  const search = params.toString()
  const genres = useMemo(
    () => (genreParam ? genreParam.split(',').filter(Boolean) : []),
    [genreParam],
  )
  const ranges = useMemo<Ranges>(() => {
    const p = new URLSearchParams(search)
    return {
      yearMin: p.get('year_min') ?? '',
      yearMax: p.get('year_max') ?? '',
      ratingMin: p.get('rating_min') ?? '',
      ratingMax: p.get('rating_max') ?? '',
      myRatingMin: p.get('my_rating_min') ?? '',
      myRatingMax: p.get('my_rating_max') ?? '',
    }
  }, [search])

  /** მონახაზის გაშვება = ახალი მისამართი; მიმდინარე სექცია (`?view=`) ინახება */
  const writeFilters = (next: Draft) => {
    const r = straightenRanges(next.ranges, RANGE_PAIRS)
    const q = new URLSearchParams()
    if (view !== 'all') q.set('view', view)
    if (next.genres.length) q.set('genre', next.genres.join(','))
    if (r.yearMin) q.set('year_min', r.yearMin)
    if (r.yearMax) q.set('year_max', r.yearMax)
    if (r.ratingMin) q.set('rating_min', r.ratingMin)
    if (r.ratingMax) q.set('rating_max', r.ratingMax)
    if (r.myRatingMin) q.set('my_rating_min', r.myRatingMin)
    if (r.myRatingMax) q.set('my_rating_max', r.myRatingMax)

    setPanelOpen(false)
    navigate({ pathname: libraryPath, search: q.toString() })
  }

  // მონახაზი, „ცვლილებაა?" და მრიცხველი — ერთი აღწერა რვავე გვერდისთვის.
  // სტატუსი მრიცხველში არ ითვლება: ის სექციაა და არა ფილტრი.
  const applied = useMemo<Draft>(() => ({ genres, ranges }), [genres, ranges])
  const { draft, setDraft, dirty, apply, clear: clearFilters, activeCount } = useFilterDraft<Draft>(
    applied,
    EMPTY_DRAFT,
    writeFilters,
  )

  /* ---------- მონაცემები ---------- */

  const num = (v: string) => (v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined)

  // ველი + მიმართულება → backend sort მნიშვნელობა
  const sortValue = sortField === 'added' ? (sortDir === 'desc' ? 'added' : 'added_asc') : `${sortField}_${sortDir}`

  const drill = useDrillParams(MEDIA_DRILL_EXCEPT)
  const filters: MediaFilters = {
    q: q || undefined,
    // მრავალი ჟანრი — backend მძიმით გამოყოფილ სიას იღებს
    genre: genres.length ? genres.join(',') : undefined,
    // ერთ ჟანრზე ორივე რეჟიმი ერთი და იგივეა — პარამეტრი მხოლოდ რამდენიმეზე მიდის
    genre_mode: genres.length > 1 && genreMode === 'all' ? 'all' : undefined,
    sort: sortValue === 'added' ? undefined : sortValue,
    status: view !== 'all' && view !== 'favorite' && view !== 'locked' ? view : undefined,
    favorite: view === 'favorite' ? true : undefined,
    // „ჩაკეტილები": დამალული ბოქლომიანი ბარათით, გახსნილი — ჩვეულებრივად
    locked: view === 'locked' ? true : undefined,
    year_min: num(ranges.yearMin),
    year_max: num(ranges.yearMax),
    rating_min: num(ranges.ratingMin),
    rating_max: num(ranges.ratingMax),
    my_rating_min: num(ranges.myRatingMin),
    my_rating_max: num(ranges.myRatingMax),
    group: type === 'movie' ? grouped : undefined,
    // სტატისტიკის ზოლიდან მოსული ჭრილი (თვე, წელი, შენი ქულა)
    ...drill,
  }

  /* გვერდზე რამდენი — `usePageSize` (პოსტერების სვეტების ჯერადი, მოდულზე ინახება): ნომრები + „მეტის ჩვენება";
     მიმდინარე გვერდი `?page=`-შია. ⚠️ ფრანჩაიზის კლასტერი სერვერზე იკვრება (`group=`), ე.ი. გვერდი
     მას არ წყვეტს; სექციებად დაჯგუფება ნაჩვენებ ჩანაწერებზე ითვლება. */
  const moviesQ = usePagedList({
    queryKey: [type, 'list', filters],
    fetchPage: (page, per_page) => api.list({ ...filters, page, per_page }),
    pageSize,
  })
  const genresQ = useQuery({ queryKey: ['genres', type], queryFn: () => fetchGenres(type) })
  const movies = moviesQ.items
  /** ⚠️ **გაფილტრული სიის** ჯამი */
  const total = moviesQ.total

  // ჟანრები კონტენტის ენაზე დალაგებული (პანელში სია გრძელია)
  const genreList = useMemo(() => {
    const list = [...(genresQ.data ?? [])]
    return list.sort((a, b) => genreName(a, lang).localeCompare(genreName(b, lang), lang))
  }, [genresQ.data, lang])

  const allTitle = t(mediaKey('library.title', type))
  /* სექციის სახელი ლექსიკონიდან: სტატუსი per-user-ია და გადაერქმევა,
     ე.ი. თარგმანის ფიქსირებული გასაღები გადარქმეულს ძველი სახელით დახატავდა. */
  const heading =
    view === 'all'
      ? allTitle
      : view === 'favorite'
        ? t('filter.favorite')
        : view === 'locked'
          ? t('lock.section')
          : statusName(statusByKey(statuses, view), lang) || view
  const countLabel = t(mediaKey('library.count', type), { count: total })

  return (
    <PageContainer>
      <PageHeader
        module={type}
        title={heading}
        subtitle={countLabel}
        actions={
          <>
            {/* ბარათები · ბადე · სტრიქონები (მოდულზე ინახება) */}
            <ViewToggle value={layout} onChange={setLayout} />
            {/* „გვერდზე რამდენი“ — ხედის სვეტების ჯერადი, მოდულზე ინახება */}
            <PageSizePick value={pageSize} onChange={setPageSize} columns={columns} />
            {/* ეძებს მხოლოდ ამ მოდულში; „სხვაგანაც" იმავე სიტყვით ჯვარედინ ძებნაზე გადადის */}
            <ListSearch value={q} onChange={setQ} placeholder={t(`search.inModule.${type}`)} />
            {/* დალაგება — ერთი ველი + მიმართულების ისარი (DataTable-სტილი) */}
            <div className="flex items-center gap-1">
              <Select
                value={sortField}
                onValueChange={(v) => {
                  setSortTouched(true)
                  setSortField(v as SortField)
                }}
              >
                <SelectTrigger className="w-32 sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="added">{t('sort.added')}</SelectItem>
                  <SelectItem value="year">{t('sort.year')}</SelectItem>
                  <SelectItem value="rating">{t('sort.rating')}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setSortTouched(true)
                  setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
                }}
                title={sortDir === 'desc' ? t('sort.desc') : t('sort.asc')}
                aria-label={sortDir === 'desc' ? t('sort.desc') : t('sort.asc')}
              >
                {sortDir === 'desc' ? (
                  <ArrowDownWideNarrow className="size-4" />
                ) : (
                  <ArrowUpNarrowWide className="size-4" />
                )}
              </Button>
            </div>
            {/* ბადის სექციები — ჟანრი/წელი/სტატუსი. ფრანჩაიზის ტოგლისგან
                დამოუკიდებელია და ორივე ერთდროულადაც მუშაობს. */}
            <Select
              value={groupBy}
              onValueChange={(v) => {
                setGroupTouched(true)
                setGroupBy(v as GroupBy)
              }}
            >
              <SelectTrigger className="w-32 sm:w-36" aria-label={t('sort.groupBy')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_BY_OPTIONS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {t(`sort.groupBy_${g}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* ფრანჩაიზის დაჯგუფების ტოგლი — სერიალებს კოლექცია არ აქვს.
                მინიშნება hover-ზე **ორივე** მდგომარეობაში ჩანს
                (`TooltipProvider delayDuration={0}` — მაშინვე, ლოდინის გარეშე). */}
            {type === 'movie' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setGrouped((g) => !g)}
                    aria-label={t('sort.groupLabel')}
                    aria-pressed={grouped}
                    className={cn(grouped && 'border-primary text-primary')}
                  >
                    <Layers className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm">
                  <p className="font-medium">{grouped ? t('sort.groupOn') : t('sort.groupOff')}</p>
                  <p className="mt-1 text-muted-foreground">
                    {grouped ? t('sort.groupOnHint') : t('sort.groupOffHint')}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
            {/* ვიწრო ეკრანზე ფილტრები უჯრაშია — დესკტოპზე პანელი მარჯვნივ დგას */}
            <FilterTrigger drillExcept={MEDIA_DRILL_EXCEPT} activeCount={activeCount} onClick={() => setPanelOpen(true)} />
            <Button variant="outline" onClick={() => setDiscoverOpen(true)}>
              <Sparkles className="size-4" />
              {t('discover.button')}
            </Button>
          </>
        }
      />

      {/* რას ნიშნავს მიმდინარე დაჯგუფება — ტექსტი ორივე
          მდგომარეობაზე დგას, თორემ „ჩართული" მდგომარეობა აუხსნელი რჩებოდა */}
      {type === 'movie' && (
        <p className="mb-5 flex items-start gap-2 rounded-xl border border-dashed border-border bg-card/40 px-4 py-2.5 text-sm text-muted-foreground">
          <Layers className="mt-0.5 size-4 shrink-0" />
          {grouped ? t('sort.groupOnHint') : t('sort.groupOffHint')}
        </p>
      )}

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {moviesQ.isLoading ? (
            <div className="text-muted-foreground">{t('api.loading')}</div>
          ) : movies.length ? (
            <>
              <MovieGrid movies={movies} type={type} groupBy={groupBy} layout={layout} />
              <Pagination {...moviesQ.pagination} />
            </>
          ) : (
            /* ⚠️ საერთო ბლოკი: ცალკე ითქვას „ფილტრმა ჩამოჭრა" და
               „ჯერ არაფერი გაქვს", თორემ ორივე ერთნაირად ცარიელი იყო. */
            <EmptyState kind={q || activeCount > 0 ? 'search' : 'video'}
              title={t(mediaKey('library.empty', type))}
              hint={q || activeCount > 0 ? t('empty.filteredHint') : t('empty.addHint')}
              actions={
                <>
                  {activeCount > 0 && (
                    <Button variant="outline" onClick={clearFilters}>
                      <FilterX className="size-4" />
                      {t('filter.clear')}
                    </Button>
                  )}
                  <Link to={`${detailBase}/new`} className={buttonVariants()}>
                    <Plus className="size-4" />
                    {t(mediaKey('actions.add', type))}
                  </Link>
                </>
              }
            />
          )}
        </div>

        <FilterPanel
          activeCount={activeCount}
          dirty={dirty}
          onApply={() => apply(draft)}
          onClear={clearFilters}
          open={panelOpen}
          onOpenChange={setPanelOpen}
        >
          {/* ველები ერთია სიისა და „რა ვნახო დღეს" ფანჯრისთვის; ჟანრების რეჟიმი აქ
              მაშინვე მოქმედებს და მოდულზე ახსოვს */}
          <LibraryFilterFields
            type={type}
            genres={genreList}
            draft={draft}
            onChange={setDraft}
            genreMode={genreMode}
            onGenreMode={setGenreMode}
          />
        </FilterPanel>
      </div>

      {/* „რა ვნახო დღეს?": მოტივტივე კამათელი მარჯვენა ქვედა კუთხეში; არჩევანი სერვერზე
          ხდება. ფილტრი სიიდან მოჰყვება, მაგრამ ფანჯარა მის ასლზე მუშაობს — იქ შეცვლილი
          სიას არ ეხება; სტატუსს ფანჯრის ჩიპები წყვეტენ. */}
      <FloatingPick module={type} onOpen={() => setPickOpen(true)} />
      {pickOpen && (
        <RandomPickDialog<LibraryPickFilter>
          source={{
            domain: type,
            currentStatus: filters.status ?? null,
            shape: 'poster',
            filter: {
              initial: { q, genres, genreMode, ranges, favorite: view === 'favorite', drill },
              empty: EMPTY_PICK_FILTER,
              chips: (filter) => pickFilterChips(filter, { genres: genreList, lang, t }),
              fields: (filter, change) => (
                <LibraryFilterFields
                  type={type}
                  genres={genreList}
                  draft={filter}
                  onChange={(update) => change((current) => ({ ...current, ...update(current) }))}
                  genreMode={filter.genreMode}
                  onGenreMode={(mode) => change((current) => ({ ...current, genreMode: mode }))}
                />
              ),
            },
            fetch: async (opts, filter) =>
              (await api.pickRandom(pickFilterParams(filter), opts)).map((m) => ({
                id: m.id,
                title: (lang === 'ka' ? m.title_ka : m.title_en) || m.title_en || m.title_ka || '',
                poster: m.poster,
                shape: 'poster',
                year: m.year,
                rating: m.rating,
                meta: m.genres.map((g) => (lang === 'ka' ? g.name_ka || g.name_en : g.name_en)),
                description: (lang === 'ka' ? m.description_ka : m.description_en) ?? null,
                statusKey: m.status?.key ?? null,
              })),
            setStatus: (id, key) => api.setStatus(id, key),
            open: (record) => {
              setPickOpen(false)
              navigate(`${detailBase}/${record.id}`)
            },
            invalidate: [[type]],
          }}
          onClose={() => setPickOpen(false)}
        />
      )}

      <DiscoverModal
        open={discoverOpen}
        onOpenChange={setDiscoverOpen}
        genres={genresQ.data ?? []}
        initialGenre={genres[0] ?? null}
        type={type}
      />
    </PageContainer>
  )
}
