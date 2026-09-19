import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, DownloadCloud, ListVideo } from 'lucide-react'
import {
  fetchEpisodes,
  markEpisodes,
  syncEpisodes,
  type Season,
  type TvType,
} from '@/api/episodes'
import { useAuth } from '@/lib/auth'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   სეზონები და ეპიზოდები (FEAT-09).

   ⚠️ **`series.seasons`/`episodes` მხოლოდ რაოდენობაა**, ე.ი. სტატუსი
   „ვუყურებ" ვერ ამბობდა, სად გავჩერდი. ეს ბლოკი სწორედ ამას ასწორებს.

   ⚠️ **ჩამოტანა ცხადი ღილაკია და არა ავტომატური.** ეპიზოდების სია
   სეზონზე ერთი TMDB-გამოძახებაა (`/tv/{id}/season/{n}`), ე.ი. გვერდის
   გახსნაზე ავტომატური გაშვება ბიუჯეტს იმ ჩანაწერებზეც დახარჯავდა,
   რომლებსაც ეპიზოდები არასდროს დასჭირდებოდათ.

   ⚠️ **სეზონები დაკეცილია, გარდა იმისა, სადაც გავჩერდი.** ათსეზონიანი
   სერიალი გაშლილი მთელ გვერდს იკავებს; „შემდეგი ეპიზოდი" კი სწორედ ის
   ერთადერთი ადგილია, რომელსაც ეძებ.
   ============================================================ */

export function EpisodeTracker({ type, id }: { type: TvType; id: number }) {
  const { t } = useTranslation()
  const { can } = useAuth()
  const { toast } = useToast()
  const { date } = useDateFormat()
  const qc = useQueryClient()

  const [open, setOpen] = useState<number | null>(null)
  const editable = can(type, 'update')

  const key = ['episodes', type, id]
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => fetchEpisodes(type, id),
  })

  const refresh = (payload: unknown) => {
    qc.setQueryData(key, payload)
    /* სტატუსი პროგრესმა შეიძლება გადაანაცვლოს (`doing`/`done`), ე.ი.
       ჩანაწერიც უნდა განახლდეს — ბეჯი სხვაგვარად ძველი დარჩებოდა */
    qc.invalidateQueries({ queryKey: [type] })
  }

  const pull = useMutation({
    mutationFn: () => syncEpisodes(type, id),
    onSuccess: (res) => {
      refresh(res)
      toast({ title: t('episodes.synced', { episodes: res.synced.episodes, seasons: res.synced.seasons }) })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const mark = useMutation({
    mutationFn: (body: { watched: boolean; episode_ids?: number[]; season?: number }) =>
      markEpisodes(type, id, body),
    onSuccess: refresh,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (isLoading) return null

  const overview = data
  const busy = pull.isPending || mark.isPending

  /* ⚠️ ცარიელ მდგომარეობაში ბლოკი მაინც ჩანს — სწორედ აქ არის ის ერთი
     ღილაკი, რომელიც ეპიზოდებს ჩამოიტანს; დამალვა მას მიუწვდომელს ხდიდა. */
  const empty = !overview || overview.total === 0

  // ⚠️ გაშლილია ის სეზონი, სადაც გავჩერდი; თუ ყველაფერი ნანახია — პირველი
  const defaultOpen = overview?.next?.season ?? overview?.seasons[0]?.season ?? null
  const expanded = open ?? defaultOpen

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-muted-foreground">
          <ListVideo className="size-4" />
          {t('episodes.title')}
          <InfoHint info={t('episodes.hint')} />
        </h2>
        {editable && (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => pull.mutate()}>
            <DownloadCloud className="size-4" />
            {empty ? t('episodes.fetch') : t('episodes.refetch')}
          </Button>
        )}
      </div>

      {empty ? (
        <p className="text-sm text-muted-foreground">{t('episodes.empty')}</p>
      ) : (
        <>
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('episodes.progress', { watched: overview.watched, total: overview.total })}
              </span>
              <span className="font-medium tabular-nums">{overview.percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-md bg-muted">
              <div className="h-full rounded-md bg-primary" style={{ width: `${overview.percent}%` }} />
            </div>
            {overview.next && (
              <p className="mt-2 text-sm">
                <span className="text-muted-foreground">{t('episodes.next')} </span>
                <span className="font-medium">
                  S{overview.next.season}E{overview.next.episode}
                  {overview.next.name ? ` · ${overview.next.name}` : ''}
                </span>
              </p>
            )}
          </div>

          <ul className="divide-y divide-border rounded-md border border-border">
            {overview.seasons.map((season) => (
              <SeasonRow
                key={season.season}
                season={season}
                open={expanded === season.season}
                editable={editable}
                busy={busy}
                onToggle={() => setOpen(expanded === season.season ? -1 : season.season)}
                onSeason={(watched) => mark.mutate({ watched, season: season.season })}
                onEpisode={(episodeId, watched) => mark.mutate({ watched, episode_ids: [episodeId] })}
                formatDate={date}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function SeasonRow({
  season,
  open,
  editable,
  busy,
  onToggle,
  onSeason,
  onEpisode,
  formatDate,
}: {
  season: Season
  open: boolean
  editable: boolean
  busy: boolean
  onToggle: () => void
  onSeason: (watched: boolean) => void
  onEpisode: (id: number, watched: boolean) => void
  formatDate: (value: string | null | undefined) => string
}) {
  const { t } = useTranslation()
  const done = season.watched >= season.total && season.total > 0

  return (
    <li>
      <div className="flex items-center gap-3 px-3 py-2">
        {/* ⚠️ სათაურივე ღილაკია — ცალკე პატარა ისარი სენსორულ ეკრანზე პრაქტიკულად მიუწვდომელია */}
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm">
          <ChevronDown className={open ? 'size-4 transition-transform' : 'size-4 -rotate-90 transition-transform'} />
          <span className="font-medium">{t('episodes.season', { number: season.season })}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {season.watched}/{season.total}
          </span>
        </button>

        {editable && (
          <Button
            type="button"
            variant={done ? 'secondary' : 'outline'}
            size="sm"
            disabled={busy}
            onClick={() => onSeason(!done)}
          >
            <Check className="size-4" />
            {done ? t('episodes.unmarkSeason') : t('episodes.markSeason')}
          </Button>
        )}
      </div>

      {open && (
        <ul className="border-t border-border/60 bg-background/40">
          {season.episodes.map((episode) => (
            <li key={episode.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
              <button
                type="button"
                disabled={!editable || busy}
                onClick={() => onEpisode(episode.id, !episode.watched)}
                className={
                  episode.watched
                    ? 'flex size-5 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground'
                    : 'flex size-5 shrink-0 items-center justify-center rounded-md border border-border'
                }
                aria-label={t(episode.watched ? 'episodes.unmark' : 'episodes.mark')}
              >
                {episode.watched && <Check className="size-3.5" />}
              </button>
              <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
                {season.season}×{episode.episode}
              </span>
              <span className="min-w-0 flex-1 truncate">{episode.name || '—'}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {episode.air_date ? formatDate(episode.air_date) : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
