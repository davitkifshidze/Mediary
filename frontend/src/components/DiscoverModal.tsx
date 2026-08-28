import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw, Search } from 'lucide-react'
import { discover, type DiscoverFilters } from '@/api/media'
import { mediaOf, type MediaType } from '@/lib/media'
import type { Genre } from '@/api/types'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/feedback'
import { useQueue } from '@/components/ui/queue'
import { PosterImage } from './PosterImage'
import { AddCardHover } from './AddCardHover'
import { genreName, tmdbSubtitle, tmdbTitle } from '@/lib/display'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'

export function DiscoverModal({
  open,
  onOpenChange,
  genres,
  initialGenre,
  type = 'movie',
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  genres: Genre[]
  initialGenre?: string | null
  type?: MediaType
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { settings } = useSettings()
  const { enqueue, isQueued } = useQueue()
  const { detailBase } = mediaOf(type)
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [genre, setGenre] = useState(initialGenre ?? '')
  const [yearMin, setYearMin] = useState('')
  const [yearMax, setYearMax] = useState('')
  const [ratingMin, setRatingMin] = useState('')
  const [ratingMax, setRatingMax] = useState('')
  const [sort, setSort] = useState('popularity')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (open) {
      setGenre(initialGenre ?? '')
      setPage(1)
    }
  }, [open, initialGenre])

  // debounce სახელით ძებნა
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(queryInput.trim())
      setPage(1)
    }, 400)
    return () => clearTimeout(id)
  }, [queryInput])

  const num = (v: string) => (v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined)
  const searching = query !== ''
  const currentYear = new Date().getFullYear()

  const filters: DiscoverFilters = {
    query: query || undefined,
    genre: searching ? undefined : genre || undefined,
    year_min: searching ? undefined : num(yearMin),
    year_max: searching ? undefined : num(yearMax),
    rating_min: searching ? undefined : num(ratingMin),
    rating_max: searching ? undefined : num(ratingMax),
    sort: searching ? undefined : sort,
    page,
    // E3 — სიღრმე/გვერდის ზომა პარამეტრებიდან
    max_pages: settings.discoverMaxPages,
    per_page: settings.discoverPerPage,
  }

  const q = useQuery({
    queryKey: ['discover', type, filters],
    queryFn: () => discover(filters, type),
    enabled: open,
  })

  // ხელახალი წამოღება TMDB-დან (ქეშის გვერდის ავლით)
  const refreshMut = useMutation({
    mutationFn: () => discover({ ...filters, refresh: true }, type),
    onSuccess: (data) => {
      qc.setQueryData(['discover', type, filters], data)
      toast({ title: t('discover.refreshed'), variant: 'success' })
    },
    onError: () => toast({ title: t('toast.error'), variant: 'error' }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{t('discover.title')}</DialogTitle>

        {/* ძებნა სახელით + განახლება */}
        <div className="mt-4 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder={t('discover.searchPh')}
              className="w-full pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refreshMut.mutate()}
            disabled={refreshMut.isPending || q.isLoading}
            title={t('discover.refresh')}
            aria-label={t('discover.refresh')}
          >
            <RefreshCw className={cn('size-4', refreshMut.isPending && 'animate-spin')} />
          </Button>
        </div>

        {/* ფილტრები (name-search-ისას გამორთული — TMDB search მათ არ იღებს) */}
        <div className={cn('mt-3 flex flex-wrap items-center gap-2', searching && 'pointer-events-none opacity-40')}>
          <Select
            value={genre || 'any'}
            onValueChange={(v) => {
              setGenre(v === 'any' ? '' : v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t('discover.anyGenre')}</SelectItem>
              {genres.map((g) => (
                <SelectItem key={g.slug} value={g.slug}>
                  {genreName(g, i18n.language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">{t('filter.year')}</span>
            <Input
              type="number"
              min={1700}
              max={currentYear + 1}
              className="w-20"
              placeholder="1700"
              value={yearMin}
              onChange={(e) => {
                setYearMin(e.target.value)
                setPage(1)
              }}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              min={1700}
              max={currentYear + 1}
              className="w-20"
              placeholder={String(currentYear + 1)}
              value={yearMax}
              onChange={(e) => {
                setYearMax(e.target.value)
                setPage(1)
              }}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">{t('filter.rating')}</span>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="10"
              className="w-20"
              placeholder="0.0"
              value={ratingMin}
              onChange={(e) => {
                setRatingMin(e.target.value)
                setPage(1)
              }}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="10"
              className="w-20"
              placeholder="10.0"
              value={ratingMax}
              onChange={(e) => {
                setRatingMax(e.target.value)
                setPage(1)
              }}
            />
          </div>

          <Select
            value={sort}
            onValueChange={(v) => {
              setSort(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="popularity">{t('discover.sortPopularity')}</SelectItem>
              <SelectItem value="rating">{t('discover.sortRating')}</SelectItem>
              <SelectItem value="year_desc">{t('discover.sortYearDesc')}</SelectItem>
              <SelectItem value="year_asc">{t('discover.sortYearAsc')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {q.isLoading ? (
            <div className="py-12 text-center text-muted-foreground">{t('api.loading')}</div>
          ) : !q.data?.results.length ? (
            <div className="py-12 text-center text-muted-foreground">{t('discover.empty')}</div>
          ) : (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
              {q.data.results.map((r) => {
                const busy = isQueued(r.tmdb_id, type)
                const title = tmdbTitle(r, i18n.language)
                const alt = tmdbSubtitle(r, i18n.language)
                const inner = (
                  <>
                    <div className="relative overflow-hidden rounded-lg bg-muted ring-1 ring-border">
                      <div className="aspect-[2/3]">
                        <PosterImage src={r.poster} alt={title} className="h-full w-full" />
                      </div>
                      {r.rating ? (
                        <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">
                          ★ {r.rating}
                        </span>
                      ) : null}
                      {r.owned ? (
                        <span className="absolute left-1.5 top-1.5 rounded bg-status-watched px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {t('discover.added')}
                        </span>
                      ) : (
                        <div
                          className={cn(
                            'absolute inset-0 flex items-center justify-center bg-primary/70 text-white transition-opacity',
                            busy ? 'opacity-100' : 'opacity-0 hover:opacity-100',
                          )}
                        >
                          {busy ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur">
                              <Loader2 className="size-3.5 animate-spin" />
                              {t('queue.queued')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur">
                              <Plus className="size-3.5" />
                              {t('actor.add')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="mt-1.5 truncate text-xs font-medium">{title}</div>
                    {/* მეორე ენის სახელიც (ka ↔ en) */}
                    {alt && <div className="truncate text-[11px] text-muted-foreground">{alt}</div>}
                    <div className="text-[11px] text-muted-foreground">{r.year ?? '—'}</div>
                  </>
                )
                const card =
                  r.owned && r.movie_id ? (
                    <Link to={`${detailBase}/${r.movie_id}`} onClick={() => onOpenChange(false)} className="block">
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => enqueue([{ tmdbId: r.tmdb_id, title }], type)}
                      className="block w-full cursor-pointer text-left"
                    >
                      {inner}
                    </button>
                  )
                return (
                  <Tooltip key={r.tmdb_id} delayDuration={600}>
                    <TooltipTrigger asChild>{card}</TooltipTrigger>
                    <AddCardHover title={title} genres={r.genres} overview={r.overview} lang={i18n.language} />
                  </Tooltip>
                )
              })}
            </div>
          )}
        </div>

        {q.data && q.data.total_pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              {q.data.page} / {q.data.total_pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= q.data.total_pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
