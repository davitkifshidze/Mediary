import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react'
import { fetchActor, type Suggestion } from '@/api/media'
import type { MediaType } from '@/lib/media'
import { PosterImage } from '@/components/PosterImage'
import { MovieGrid } from '@/components/MovieGrid'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { useQueue } from '@/components/ui/queue'
import { AddCardHover } from '@/components/AddCardHover'
import { cn } from '@/lib/utils'

const PER_PAGE = 10

/** TMDB შემოთავაზების ბადე — გვერდებით, თავისი queue-ლოგიკით (movie ან series) */
function SuggestionSection({
  title,
  items,
  mediaType,
}: {
  title: string
  items: Suggestion[]
  mediaType: MediaType
}) {
  const { t, i18n } = useTranslation()
  const { enqueue, isQueued } = useQueue()
  const [page, setPage] = useState(1)
  const pages = Math.ceil(items.length / PER_PAGE)

  return (
    <section className="mb-10">
      <h2 className="mb-4 text-lg font-semibold">
        {title} <span className="text-muted-foreground">· {items.length}</span>
      </h2>
      <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {items.slice((page - 1) * PER_PAGE, page * PER_PAGE).map((s) => {
          const busy = isQueued(s.tmdb_id, mediaType)
          const label = i18n.language === 'ka' ? s.title_ka || s.title : s.title
          return (
            <Tooltip key={s.tmdb_id} delayDuration={600}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => enqueue([{ tmdbId: s.tmdb_id, title: label }], mediaType)}
                  className="group/sug block w-full cursor-pointer text-left"
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border bg-muted shadow-sm ring-1 ring-transparent transition-all duration-300 group-hover/sug:-translate-y-1 group-hover/sug:shadow-xl group-hover/sug:ring-primary/40">
                    <PosterImage
                      src={s.poster}
                      alt={label}
                      className="h-full w-full transition-transform duration-500 group-hover/sug:scale-105"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                    {s.rating ? (
                      <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-amber-300 backdrop-blur-sm">
                        ★ {s.rating}
                      </span>
                    ) : null}
                    <div
                      className={cn(
                        'absolute inset-0 flex items-center justify-center bg-primary/70 text-white transition-opacity',
                        busy ? 'opacity-100' : 'opacity-0 group-hover/sug:opacity-100',
                      )}
                    >
                      {busy ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-3 py-1.5 text-sm font-medium backdrop-blur">
                          <Loader2 className="size-4 animate-spin" />
                          {t('queue.queued')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-3 py-1.5 text-sm font-medium backdrop-blur">
                          <Plus className="size-4" />
                          {t('actor.add')}
                        </span>
                      )}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-white drop-shadow-sm">
                        {label}
                      </h3>
                      <div className="text-xs text-white/70">{s.year ?? '—'}</div>
                    </div>
                  </div>
                </button>
              </TooltipTrigger>
              <AddCardHover title={label} genres={s.genres} overview={s.overview} lang={i18n.language} />
            </Tooltip>
          )
        })}
      </div>

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </section>
  )
}

export function ActorPage() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const { data, isLoading } = useQuery({ queryKey: ['actor', id], queryFn: () => fetchActor(id!) })

  if (isLoading || !data) {
    return <div className="mx-auto max-w-7xl px-5 py-10 text-muted-foreground">{t('api.loading')}</div>
  }

  const a = data.actor
  const name = i18n.language === 'ka' ? a.name_ka || a.name : a.name

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('actions.back')}
      </Link>

      <div className="mb-8 flex items-center gap-4">
        <PosterImage src={a.photo} alt={name} className="size-24 rounded-full ring-1 ring-border" />
        <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
      </div>

      {data.movies.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">{t('actor.inCollection')}</h2>
          <MovieGrid movies={data.movies} type="movie" />
        </section>
      )}

      {data.series.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">{t('actor.inCollectionSeries')}</h2>
          <MovieGrid movies={data.series} type="series" />
        </section>
      )}

      {data.suggestions.length > 0 && (
        <SuggestionSection title={t('actor.more')} items={data.suggestions} mediaType="movie" />
      )}

      {data.series_suggestions.length > 0 && (
        <SuggestionSection title={t('actor.moreSeries')} items={data.series_suggestions} mediaType="series" />
      )}
    </main>
  )
}
