import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react'
import { fetchActor, type Suggestion } from '@/api/media'
import { mediaOf, type MediaType } from '@/lib/media'
import { tmdbSubtitle, tmdbTitle } from '@/lib/display'
import { useContentLang, useSettings } from '@/lib/settings'
import { PageContainer } from '@/components/ui/page'
import { PosterImage } from '@/components/PosterImage'
import { MovieGrid } from '@/components/MovieGrid'
import { ActorGallery } from '@/components/RecordGallery'
import { ActorHero } from '@/components/ActorHero'
import { ActorWebPhotos } from '@/components/ActorWebPhotos'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import { useQueue } from '@/components/ui/queue'
import { AddCardHover } from '@/components/AddCardHover'
import { cn } from '@/lib/utils'

/** TMDB შემოთავაზების ბადე — გვერდებით, თავისი queue-ლოგიკით (movie ან series) */
function SuggestionSection({
  title,
  items,
  mediaType,
  perPage,
}: {
  title: string
  items: Suggestion[]
  mediaType: MediaType
  /** ჩანაწერი გვერდზე — პარამეტრებიდან, ცალკე ფილმებზე/სერიალებზე (E2) */
  perPage: number
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { enqueue, isQueued } = useQueue()
  const { detailBase } = mediaOf(mediaType)
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  // სია შეიძლება შემცირდეს (მაგ. ჩანაწერის დამატების შემდეგ ის შემოთავაზებებიდან ქრება) —
  // მიმდინარე გვერდი დიაპაზონში ვიჭერთ, თორემ ცარიელი ბადე გამოჩნდება
  const current = Math.min(page, pages)

  return (
    <section className="mb-10">
      <h2 className="mb-4 text-lg font-semibold">
        {title} <span className="text-muted-foreground">· {items.length}</span>
      </h2>
      <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {items.slice((current - 1) * perPage, current * perPage).map((s) => {
          const busy = isQueued(s.tmdb_id, mediaType)
          const label = tmdbTitle(s, lang)
          const alt = tmdbSubtitle(s, lang)
          const inner = (
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border bg-muted shadow-sm ring-1 ring-transparent transition-all duration-300 group-hover/sug:-translate-y-1 group-hover/sug:shadow-xl group-hover/sug:ring-primary/40">
              <PosterImage
                src={s.poster}
                alt={label}
                className="h-full w-full transition-transform duration-500 group-hover/sug:scale-105"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
              {s.rating ? (
                <span className="absolute right-2 top-2 rounded-[5px] bg-black/55 px-2 py-0.5 text-xs font-semibold text-amber-300 backdrop-blur-sm">
                  ★ {s.rating}
                </span>
              ) : null}
              {s.owned ? (
                // უკვე დამატებული — სიიდან არ ქრება, უბრალოდ მოინიშნება
                <span className="absolute left-2 top-2 rounded-[5px] bg-status-watched px-2 py-0.5 text-[11px] font-medium text-white">
                  {t('discover.added')}
                </span>
              ) : (
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
              )}
              <div className="absolute inset-x-0 bottom-0 p-3">
                <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-white drop-shadow-sm">
                  {label}
                </h3>
                {/* მეორე ენის სახელიც (ka ↔ en) */}
                {alt && <div className="line-clamp-1 text-xs text-white/80">{alt}</div>}
                <div className="text-xs text-white/70">{s.year ?? '—'}</div>
              </div>
            </div>
          )
          const card =
            s.owned && s.movie_id ? (
              <Link to={`${detailBase}/${s.movie_id}`} className="group/sug block w-full text-left">
                {inner}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => enqueue([{ tmdbId: s.tmdb_id, title: label }], mediaType)}
                className="group/sug block w-full cursor-pointer text-left"
              >
                {inner}
              </button>
            )
          return (
            <Tooltip key={s.tmdb_id} delayDuration={600}>
              <TooltipTrigger asChild>{card}</TooltipTrigger>
              <AddCardHover title={label} genres={s.genres} overview={s.overview} lang={lang} />
            </Tooltip>
          )
        })}
      </div>

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {current} / {pages}
          </span>
          <Button variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </section>
  )
}

/**
 * 19.3 — „owned შემოთავაზების დუბლი".
 *
 * ბიბლიოთეკაში უკვე არსებული ჩანაწერი ორჯერ ჩანდა: „ჩემს კოლექციაში"
 * სექციაშიც და შემოთავაზებებშიც. backend განზრახ **არ** ჭრის მათ სიიდან
 * (`CastController`) — თუ დამატებისთანავე გაქრებოდა, კარტი თითის ქვეშ
 * გაუჩინარდებოდა და „დაემატა" ნიშანს ვერავინ დაინახავდა.
 *
 * ⚠️ ამიტომ ჭრა **ფრონტზეა და დროზეა მიბმული**: ვმალავთ მხოლოდ იმას, რაც
 * გვერდის გახსნის მომენტისთვის უკვე გვქონდა. ამ სესიაზე დამატებული
 * ჩანაწერი ადგილზე რჩება, „დაემატა" ნიშნით — ე.ი. დუბლიც ქრება და
 * დამატების უკუკავშირიც რჩება.
 */
function useAlreadyOwned(actorId: string | undefined, data: { suggestions: Suggestion[]; series_suggestions: Suggestion[] } | undefined) {
  const owned = useRef<{ actorId?: string; ids: Set<number> }>({ ids: new Set() })

  useEffect(() => {
    if (!data) return
    // ერთხელ, თითო მსახიობზე — refetch-ი (დამატების შემდეგ) სიას აღარ ცვლის
    if (owned.current.actorId === actorId) return
    owned.current = {
      actorId,
      ids: new Set(
        [...data.suggestions, ...data.series_suggestions]
          .filter((s) => s.owned)
          .map((s) => s.tmdb_id),
      ),
    }
  }, [actorId, data])

  return owned.current.actorId === actorId ? owned.current.ids : new Set<number>()
}

export function ActorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { settings } = useSettings()
  const { data, isLoading } = useQuery({ queryKey: ['actor', id], queryFn: () => fetchActor(id!) })

  const alreadyOwned = useAlreadyOwned(id, data)
  const movieSuggestions = useMemo(
    () => (data?.suggestions ?? []).filter((s) => !alreadyOwned.has(s.tmdb_id)),
    [data?.suggestions, alreadyOwned],
  )
  const seriesSuggestions = useMemo(
    () => (data?.series_suggestions ?? []).filter((s) => !alreadyOwned.has(s.tmdb_id)),
    [data?.series_suggestions, alreadyOwned],
  )

  if (isLoading || !data) {
    return <PageContainer><p className="text-muted-foreground">{t('api.loading')}</p></PageContainer>
  }

  const a = data.actor
  const name = lang === 'ka' ? a.name_ka || a.name : a.name

  return (
    <PageContainer>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-5 inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('actions.back')}
      </button>

      {/* §8.1 — **შიდა გვერდის თავი**: ბიოგრაფია, დაბადება, ოფიციალური
          ბმულები (IMDb · Instagram · Wikidata) და TMDB-დან განახლების ღილაკი.
          ⚠️ ადრე აქ მხოლოდ ავატარი და სახელი იდო — ე.ი. „შიდა გვერდი"
          სათაურის მეტს არაფერს ამბობდა. */}
      <ActorHero actor={a} name={name} />

      {/* §7.5 — ტეგები + ვებიდან ძებნა. TMDB-ზე მსახიობს ხშირად სამი ფოტო
          აქვს, ე.ი. „მხოლოდ TMDB არ იკმარებს" სწორედ აქ ხსნება. */}
      <ActorWebPhotos actorId={Number(id)} actorName={name} tags={a.tags ?? []} />

      {/* გალერეა (Tasks 10 → §8) — ფოტოები, ვიდეო-ბმულები და ჩამოტვირთვა
          იმავე დიალოგით, რაც გალერეაშია (ამ მსახიობზე მიბმული). */}
      <div className="mb-10">
        <ActorGallery castId={Number(id)} actorName={name} />
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

      {/* §7.1 — მესამე მედია-დომენი; შემოთავაზება ცალკე არ აქვს (იხ. `CastController`) */}
      {data.animes.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">{t('actor.inCollectionAnime')}</h2>
          <MovieGrid movies={data.animes} type="anime" />
        </section>
      )}

      {/* 19.3 — უკვე კოლექციაში მყოფი ჩანაწერი აქ აღარ მეორდება (იხ. `useAlreadyOwned`) */}
      {movieSuggestions.length > 0 && (
        <SuggestionSection
          title={t('actor.more')}
          items={movieSuggestions}
          mediaType="movie"
          perPage={settings.actorMoviesPerPage}
        />
      )}

      {seriesSuggestions.length > 0 && (
        <SuggestionSection
          title={t('actor.moreSeries')}
          items={seriesSuggestions}
          mediaType="series"
          perPage={settings.actorSeriesPerPage}
        />
      )}
    </PageContainer>
  )
}
