import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronLeft, ChevronRight, Layers, Plus, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { fetchGenres, mediaApi, type MediaFilters } from '@/api/media'
import { mediaOf, type MediaType } from '@/lib/media'
import { useSettings } from '@/lib/settings'
import { MovieGrid } from '@/components/MovieGrid'
import { GenreChips } from '@/components/GenreChips'
import { DiscoverModal } from '@/components/DiscoverModal'
import { Input } from '@/components/ui/input'
import { Button, buttonVariants } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export function LibraryPage({ type = 'movie' }: { type?: MediaType }) {
  const { t } = useTranslation()
  const { settings } = useSettings()
  const [params] = useSearchParams()
  const api = mediaApi(type)
  const { detailBase } = mediaOf(type)
  const view = params.get('view') ?? 'all'
  // ჟანრი URL-იდანაც მოდის (ჩანაწერის გვერდზე ჟანრზე დაჭერა — Tasks K9)
  const genreParam = params.get('genre')
  const [genre, setGenre] = useState<string | null>(genreParam)
  const [q, setQ] = useState('')
  const [sortField, setSortField] = useState<'added' | 'year' | 'rating'>('added')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showFilters, setShowFilters] = useState(false)
  // ფრანჩაიზის დაჯგუფება — მხოლოდ ფილმებს აქვს კოლექცია (Tasks D1)
  const [grouped, setGrouped] = useState(true)
  const [yearMin, setYearMin] = useState('')
  const [yearMax, setYearMax] = useState('')
  const [ratingMin, setRatingMin] = useState('')
  const [ratingMax, setRatingMax] = useState('')
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [page, setPage] = useState(1)

  const num = (v: string) => (v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined)

  const currentYear = new Date().getFullYear()

  // ველი + მიმართულება → backend sort მნიშვნელობა
  const sortValue = sortField === 'added' ? (sortDir === 'desc' ? 'added' : 'added_asc') : `${sortField}_${sortDir}`

  const filters: MediaFilters = {
    q: q || undefined,
    genre: genre || undefined,
    sort: sortValue === 'added' ? undefined : sortValue,
    status: view !== 'all' && view !== 'favorite' ? view : undefined,
    favorite: view === 'favorite' ? true : undefined,
    year_min: num(yearMin),
    year_max: num(yearMax),
    rating_min: num(ratingMin),
    rating_max: num(ratingMax),
    group: type === 'movie' ? grouped : undefined,
  }

  const hasRangeFilters = [yearMin, yearMax, ratingMin, ratingMax].some((v) => v.trim() !== '')
  const clearRanges = () => {
    setYearMin('')
    setYearMax('')
    setRatingMin('')
    setRatingMax('')
  }

  const moviesQ = useQuery({ queryKey: [type, 'list', filters], queryFn: () => api.list(filters) })
  const genresQ = useQuery({ queryKey: ['genres', type], queryFn: () => fetchGenres(type) })
  const movies = moviesQ.data ?? []

  // გვერდის ზომა პარამეტრებიდან; 0 = ყველა ერთ გვერდზე (E2)
  const pageSize = settings.libraryPageSize
  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(movies.length / pageSize)) : 1
  const current = Math.min(page, pageCount)
  const visible = pageSize > 0 ? movies.slice((current - 1) * pageSize, current * pageSize) : movies

  // ფილტრის/დალაგების ცვლილებაზე პირველ გვერდზე ვბრუნდებით
  useEffect(() => {
    setPage(1)
  }, [q, genre, view, sortValue, yearMin, yearMax, ratingMin, ratingMax, grouped, pageSize])

  // ?genre=… მისამართიდან (ჟანრზე დაჭერა ჩანაწერის გვერდზე). ჩიპებით შემდგომი
  // ცვლილება ლოკალურ state-შია, ამიტომ მხოლოდ პარამეტრის ცვლილებას ვუსმენთ.
  useEffect(() => {
    if (genreParam) setGenre(genreParam)
  }, [genreParam])

  const allTitle = type === 'series' ? t('library.titleSeries') : t('library.title')
  const heading =
    view === 'all' ? allTitle : view === 'favorite' ? t('filter.favorite') : t(`status.${view}`)
  const countLabel = type === 'series' ? t('library.countSeries', { count: movies.length }) : t('library.count', { count: movies.length })

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{countLabel}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
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
            <Select value={sortField} onValueChange={(v) => setSortField(v as typeof sortField)}>
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
              onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
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
          {/* ფრანჩაიზის დაჯგუფების ტოგლი — სერიალებს კოლექცია არ აქვს */}
          {type === 'movie' && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setGrouped((g) => !g)}
              title={grouped ? t('sort.groupOn') : t('sort.groupOff')}
              aria-label={t('sort.groupLabel')}
              aria-pressed={grouped}
              className={cn(grouped && 'border-primary text-primary')}
            >
              <Layers className="size-4" />
            </Button>
          )}
          {/* ფილტრების გამომჩენი აიქონი */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters((s) => !s)}
            title={t('filter.more')}
            aria-label={t('filter.more')}
            className={cn('relative', showFilters && 'border-primary text-primary')}
          >
            <SlidersHorizontal className="size-4" />
            {hasRangeFilters && (
              <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-primary" />
            )}
          </Button>
          <Button variant="outline" onClick={() => setDiscoverOpen(true)}>
            <Sparkles className="size-4" />
            {t('discover.button')}
          </Button>
          {/* „მედიის ჩამოტვირთვა" გადავიდა პარამეტრების გვერდზე (Tasks J1) */}
        </div>
      </div>

      {/* დაჯგუფება გამორთულია — ვხსნით, რას ნიშნავს (Tasks D1) */}
      {type === 'movie' && !grouped && (
        <p className="mb-5 flex items-start gap-2 rounded-xl border border-dashed border-border bg-card/40 px-4 py-2.5 text-sm text-muted-foreground">
          <Layers className="mt-0.5 size-4 shrink-0" />
          {t('sort.groupOffHint')}
        </p>
      )}

      {/* დიაპაზონის ფილტრები — ჩნდება მხოლოდ ფილტრის აიქონზე დაჭერით */}
      {showFilters && (
        <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-card/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">{t('filter.year')}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1700}
              max={currentYear + 1}
              value={yearMin}
              onChange={(e) => setYearMin(e.target.value)}
              placeholder="1700"
              className="h-9 w-24"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1700}
              max={currentYear + 1}
              value={yearMax}
              onChange={(e) => setYearMax(e.target.value)}
              placeholder={String(currentYear + 1)}
              className="h-9 w-24"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">{t('filter.rating')}</span>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={ratingMin}
              onChange={(e) => setRatingMin(e.target.value)}
              placeholder="0.0"
              className="h-9 w-24"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="10"
              value={ratingMax}
              onChange={(e) => setRatingMax(e.target.value)}
              placeholder="10.0"
              className="h-9 w-24"
            />
          </div>
          {/* გასუფთავება — საერთო `destructiveOutline` ვარიანტი (Tasks K11) */}
          <Button
            variant="destructiveOutline"
            size="sm"
            onClick={clearRanges}
            disabled={!hasRangeFilters}
            className="ml-auto"
          >
            <X className="size-4" />
            {t('filter.clear')}
          </Button>
        </div>
      )}

      <div className="mb-7">
        <GenreChips genres={genresQ.data ?? []} active={genre} onChange={setGenre} type={type} />
      </div>

      {moviesQ.isLoading ? (
        <div className="text-muted-foreground">{t('api.loading')}</div>
      ) : movies.length ? (
        <>
          <MovieGrid movies={visible} type={type} />
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
        <div className="rounded-xl border border-dashed border-border p-16 text-center">
          <p className="text-muted-foreground">{type === 'series' ? t('library.emptySeries') : t('library.empty')}</p>
          <Link to={`${detailBase}/new`} className={`${buttonVariants()} mt-4`}>
            <Plus className="size-4" />
            {type === 'series' ? t('actions.addSeries') : t('actions.add')}
          </Link>
        </div>
      )}

      <DiscoverModal
        open={discoverOpen}
        onOpenChange={setDiscoverOpen}
        genres={genresQ.data ?? []}
        initialGenre={genre}
        type={type}
      />
    </div>
  )
}
