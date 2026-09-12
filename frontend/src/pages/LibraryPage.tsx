import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useListLimit } from '@/lib/paged'
import { ShowMore } from '@/components/ui/show-more'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronLeft,
  ChevronRight,
  Layers,
  Plus,
  Search,
  Sparkles,
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
import { DiscoverModal } from '@/components/DiscoverModal'
import {
  FilterGroup,
  FilterOption,
  FilterOptionList,
  FilterPanel,
  FilterTrigger,
} from '@/components/FilterPanel'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/* ============================================================
   ბიბლიოთეკა — ბადე + მარჯვენა ფილტრების პანელი (Tasks 2.1/2.2).

   ჟანრების ჩიპები (`GenreChips`) მოიხსნა: ჟანრი, სტატუსი, წელი და
   რეიტინგი ერთ პანელშია და **„გაფილტვრაზე"** მოქმედებს. ტულბარში
   მხოლოდ ისეთი კონტროლი რჩება, რაც ფილტრი არაა — ძებნა, დალაგება,
   ფრანჩაიზის დაჯგუფება და „აღმოაჩინე".
   ============================================================ */

interface Ranges {
  yearMin: string
  yearMax: string
  ratingMin: string
  ratingMax: string
}

const EMPTY_RANGES: Ranges = { yearMin: '', yearMax: '', ratingMin: '', ratingMax: '' }

/**
 * პანელის მონახაზი — ჯერ გაუშვებელი მონიშვნები.
 * სტატუსი **აქ არ არის** (Tasks 3): ის სექციიდან/`?view=`-იდან მოდის და
 * პანელში დუბლი იყო.
 */
interface Draft {
  genres: string[]
  ranges: Ranges
}

const rangeCount = (r: Ranges) => Object.values(r).filter((v) => v.trim() !== '').length

export function LibraryPage({ type = 'movie' }: { type?: MediaType }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  // §6.4 — სექციის სახელისთვის
  const { data: statuses = [] } = useStatuses(type)
  const { settings } = useSettings()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const api = mediaApi(type)
  const { libraryPath, detailBase } = mediaOf(type)
  // `?view=`-ის გარეშე — ნაგულისხმევი სექცია პარამეტრებიდან (E4)
  const view = params.get('view') ?? settings.defaultView
  // ჟანრი URL-იდანაც მოდის (ჩანაწერის გვერდზე ჟანრზე დაჭერა — Tasks K9)
  const genreParam = params.get('genre')

  const [q, setQ] = useState('')
  // ნაგულისხმევი სორტირება პარამეტრებიდან (E4) — შემდეგ ხელით იცვლება
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
  // ფრანჩაიზის დაჯგუფება — მხოლოდ ფილმებს აქვს კოლექცია (Tasks D1)
  const [grouped, setGrouped] = useState(true)
  // ბადის სექციები (18) — სორტირების იმავე ლოგიკით: ხელით შეცვლამდე
  // პარამეტრს ვყვებით, რადგან `settings` პირველი რენდერის შემდეგ მოდის
  const [groupBy, setGroupBy] = useState<GroupBy>(settings.defaultGrouping)
  const [groupTouched, setGroupTouched] = useState(false)
  useEffect(() => {
    if (groupTouched) return
    setGroupBy(settings.defaultGrouping)
  }, [settings.defaultGrouping, groupTouched])
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [page, setPage] = useState(1)

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
    }
  }, [search])

  const [draft, setDraft] = useState<Draft>({ genres, ranges })

  // მისამართის ცვლილება (საიდბარი, „უკან", ჟანრზე დაჭერა) → მონახაზი გასწორდეს
  useEffect(() => {
    setDraft({ genres, ranges })
  }, [genres, ranges])

  const dirty =
    draft.genres.length !== genres.length ||
    draft.genres.some((g) => !genres.includes(g)) ||
    (Object.keys(EMPTY_RANGES) as (keyof Ranges)[]).some((k) => draft.ranges[k] !== ranges[k])

  // სტატუსი მრიცხველში არ ითვლება — ის სექციაა და არა ფილტრი (Tasks 3)
  const activeCount = genres.length + rangeCount(ranges)

  /** მონახაზის გაშვება = ახალი მისამართი; მიმდინარე სექცია (`?view=`) ინახება */
  const applyDraft = (next: Draft) => {
    const q = new URLSearchParams()
    if (view !== 'all') q.set('view', view)
    if (next.genres.length) q.set('genre', next.genres.join(','))
    if (next.ranges.yearMin) q.set('year_min', next.ranges.yearMin)
    if (next.ranges.yearMax) q.set('year_max', next.ranges.yearMax)
    if (next.ranges.ratingMin) q.set('rating_min', next.ranges.ratingMin)
    if (next.ranges.ratingMax) q.set('rating_max', next.ranges.ratingMax)

    setPanelOpen(false)
    navigate({ pathname: libraryPath, search: q.toString() })
  }

  const clearFilters = () => applyDraft({ genres: [], ranges: EMPTY_RANGES })

  const toggleGenre = (slug: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      genres: on ? [...d.genres, slug] : d.genres.filter((g) => g !== slug),
    }))

  const setRange = (key: keyof Ranges, value: string) =>
    setDraft((d) => ({ ...d, ranges: { ...d.ranges, [key]: value } }))

  /* ---------- მონაცემები ---------- */

  const num = (v: string) => (v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined)
  const currentYear = new Date().getFullYear()

  // ველი + მიმართულება → backend sort მნიშვნელობა
  const sortValue = sortField === 'added' ? (sortDir === 'desc' ? 'added' : 'added_asc') : `${sortField}_${sortDir}`

  const filters: MediaFilters = {
    q: q || undefined,
    // მრავალი ჟანრი — backend მძიმით გამოყოფილ სიას იღებს (2.2)
    genre: genres.length ? genres.join(',') : undefined,
    sort: sortValue === 'added' ? undefined : sortValue,
    status: view !== 'all' && view !== 'favorite' ? view : undefined,
    favorite: view === 'favorite' ? true : undefined,
    year_min: num(ranges.yearMin),
    year_max: num(ranges.yearMax),
    rating_min: num(ranges.ratingMin),
    rating_max: num(ranges.ratingMax),
    group: type === 'movie' ? grouped : undefined,
  }

  /* გვერდის ზომა პარამეტრებიდან; 0 = ერთი გრძელი სია (E2).
     ⚠️ **ორივე რეჟიმში სერვერი მხოლოდ საჭიროს აბრუნებს.** დანომრილ
     გვერდებზე ვითხოვთ იმ **პრეფიქსს**, რომელიც მიმდინარე გვერდს ფარავს
     (და არა მარტო მას): ფრანჩაიზის კლასტერი და სექციებად დაჯგუფება
     ჩატვირთულ სიაზე ითვლება, ე.ი. გატეხილი პრეფიქსი ჯგუფის ჯამებს
     სიას ააცდენდა. ერთი გრძელი სიის რეჟიმში ლიმიტი „მეტის ჩვენებით" იზრდება. */
  const pageSize = settings.libraryPageSize
  const { limit, showMore } = useListLimit(JSON.stringify(filters))
  const perPage = pageSize > 0 ? pageSize * page : limit

  const moviesQ = useQuery({
    queryKey: [type, 'list', filters, perPage],
    queryFn: () => api.list({ ...filters, per_page: perPage }),
    // გვერდის გადართვაზე ბადე არ უნდა დაიცალოს და თავიდან აეწყოს
    placeholderData: keepPreviousData,
  })
  const genresQ = useQuery({ queryKey: ['genres', type], queryFn: () => fetchGenres(type) })
  const movies = moviesQ.data?.items ?? []
  /** ⚠️ **გაფილტრული სიის** ჯამი — გვერდების რაოდენობაც ამით ითვლება */
  const total = moviesQ.data?.total ?? 0

  // ჟანრები კონტენტის ენაზე დალაგებული (პანელში სია გრძელია)
  const genreList = useMemo(() => {
    const list = [...(genresQ.data ?? [])]
    return list.sort((a, b) => genreName(a, lang).localeCompare(genreName(b, lang), lang))
  }, [genresQ.data, lang])

  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1
  const current = Math.min(page, pageCount)
  const visible = pageSize > 0 ? movies.slice((current - 1) * pageSize, current * pageSize) : movies

  // ფილტრის/დალაგების ცვლილებაზე პირველ გვერდზე ვბრუნდებით
  useEffect(() => {
    setPage(1)
  }, [q, genres, view, sortValue, ranges, grouped, pageSize])

  const allTitle = t(mediaKey('library.title', type))
  /* §6.4 — სექციის სახელი ლექსიკონიდან: სტატუსი per-user-ია და გადაერქმევა,
     ე.ი. თარგმანის ფიქსირებული გასაღები გადარქმეულს ძველი სახელით დახატავდა. */
  const heading =
    view === 'all'
      ? allTitle
      : view === 'favorite'
        ? t('filter.favorite')
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
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('search.placeholder')}
                className="w-full pl-9 sm:w-56"
              />
            </div>
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
            {/* ბადის სექციები (18) — ჟანრი/წელი/სტატუსი. ფრანჩაიზის ტოგლისგან
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
                Tasks 4 — მინიშნება hover-ზე **ორივე** მდგომარეობაში ჩანს
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
            <FilterTrigger activeCount={activeCount} onClick={() => setPanelOpen(true)} />
            <Button variant="outline" onClick={() => setDiscoverOpen(true)}>
              <Sparkles className="size-4" />
              {t('discover.button')}
            </Button>
          </>
        }
      />

      {/* რას ნიშნავს მიმდინარე დაჯგუფება (Tasks D1/4) — ტექსტი ორივე
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
              <MovieGrid movies={visible} type={type} groupBy={groupBy} />
              {/* ერთი გრძელი სიის რეჟიმი (`libraryPageSize = 0`) — დანომრილი
                  გვერდები არაა, ამიტომ სია „მეტის ჩვენებით" იზრდება */}
              {pageSize === 0 && (
                <ShowMore shown={movies.length} total={total} onMore={showMore} loading={moviesQ.isFetching} />
              )}
              {pageCount > 1 && (
                <div className="mt-8 flex items-center justify-center gap-3">
                  <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {current} / {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={current >= pageCount}
                    onClick={() => setPage(current + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            /* ⚠️ §2.4 — საერთო ბლოკი: ცალკე ითქვას „ფილტრმა ჩამოჭრა" და
               „ჯერ არაფერი გაქვს", თორემ ორივე ერთნაირად ცარიელი იყო. */
            <EmptyState
              title={t(mediaKey('library.empty', type))}
              hint={q || activeCount > 0 ? t('empty.filteredHint') : t('empty.addHint')}
              actions={
                <>
                  {activeCount > 0 && (
                    <Button variant="outline" onClick={clearFilters}>
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
          onApply={() => applyDraft(draft)}
          onClear={clearFilters}
          open={panelOpen}
          onOpenChange={setPanelOpen}
        >
          {/* სტატუსის ჯგუფი აქ განზრახ არ არის (Tasks 3) — სექცია საიდბარშია */}
          <FilterGroup title={t('filter.genres')} count={draft.genres.length}>
            <FilterOptionList>
              {genreList.map((g) => (
                <FilterOption
                  key={g.slug}
                  label={genreName(g, lang)}
                  count={type === 'series' ? g.series_count : g.movies_count}
                  checked={draft.genres.includes(g.slug)}
                  onChange={(on) => toggleGenre(g.slug, on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>

          {/* ⚠️ §1.4 — დიაპაზონები **გაშლილია** (ჯგუფის ნაგულისხმევი მდგომარეობა):
              შეკეცილი ჯგუფი მალავდა იმას, რომ წელი და ქულა საერთოდ იფილტრება.
              შეკეცვა შესაძლებელი რჩება, უბრალოდ ხელით. */}
          <FilterGroup title={t('filter.ranges')} count={rangeCount(draft.ranges)}>
            <div className="space-y-2 px-1.5 pt-1">
              <div>
                <span className="text-xs text-muted-foreground">{t('filter.year')}</span>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1700}
                    max={currentYear + 1}
                    value={draft.ranges.yearMin}
                    onChange={(e) => setRange('yearMin', e.target.value)}
                    placeholder="1700"
                    className="h-9"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1700}
                    max={currentYear + 1}
                    value={draft.ranges.yearMax}
                    onChange={(e) => setRange('yearMax', e.target.value)}
                    placeholder={String(currentYear + 1)}
                    className="h-9"
                  />
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{t('filter.rating')}</span>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={draft.ranges.ratingMin}
                    onChange={(e) => setRange('ratingMin', e.target.value)}
                    placeholder="0.0"
                    className="h-9"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={draft.ranges.ratingMax}
                    onChange={(e) => setRange('ratingMax', e.target.value)}
                    placeholder="10.0"
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          </FilterGroup>
        </FilterPanel>
      </div>

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
