import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, CalendarClock, Check, Layers, Loader2, Plus } from 'lucide-react'
import { fetchFranchises, setFranchiseReminder, type FranchisePartRow, type FranchiseRow } from '@/api/media'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { MEDIA } from '@/lib/media'
import { usePagedList } from '@/lib/paged'
import { cn } from '@/lib/utils'
import { PosterImage } from '@/components/PosterImage'
import { Badge, CountBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Chip, ChipRow } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { useQueue } from '@/components/ui/queue'

/* ============================================================
   **„ფრანჩაიზები"** — `/movies/franchises`, ფილმების ქვემენიუს პუნქტი.

   ერთი ადგილი კითხვისთვის „რა გამომრჩა": ყველა ფრანჩაიზი, რომლის ნაწილიც მაქვს
   და ყველა — არა. თითოზე ჩანს ჩემი ნაწილები (ჩანაწერზე ბმულით) და ნაკლული
   ნაწილები; ნაკლული აქედანვე ემატება — ერთი ან ყველა ერთად („აღმოჩენის" რიგით,
   `useQueue`) — ან ჩუმდება („აღარ შემახსენო" ნაწილზე ან მთელ ფრანჩაიზზე).

   ⚠️ ნაგულისხმევად მხოლოდ დაუსრულებელი ჩანს; სრული და გაჩუმებული — ჩიპებით
   (`?complete=1`, `?muted=1`). `?open=<id>` შეტყობინებიდან მოდის: ის ფრანჩაიზი
   ფილტრის მიუხედავად ჩანს, პირველია და გამოკვეთილია.
   ⚠️ სიის გასაღები `movie`-ით იწყება — დამატების რიგი ყოველი დამატებული ფილმის
   შემდეგ `['movie']`-ს აახლებს, ე.ი. ნაკლული თავისით გადადის „მაქვს"-ში.
   ============================================================ */

export function FranchisesPage() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()

  const withComplete = params.get('complete') === '1'
  const withMuted = params.get('muted') === '1'
  const open = Number(params.get('open')) || null

  const list = usePagedList({
    queryKey: ['movie', 'franchises', withComplete, withMuted, open],
    fetchPage: (page, perPage) => fetchFranchises({ complete: withComplete, muted: withMuted, open, page, per_page: perPage }),
  })
  const counts = list.first?.counts

  const toggle = (key: 'complete' | 'muted', on: boolean) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (on) next.set(key, '1')
        else next.delete(key)
        next.delete('page')
        return next
      },
      { replace: true },
    )

  const remind = useMutation({
    mutationFn: (v: { collection: number; muted: boolean; tmdbId?: number }) => setFranchiseReminder(v.collection, v.muted, v.tmdbId),
    onSuccess: (_data, v) => {
      toast({ title: t(v.muted ? 'franchise.muted' : 'franchise.unmuted'), variant: 'success' })
      qc.invalidateQueries({ queryKey: ['movie', 'franchises'] })
      // გაჩუმება ამ ფრანჩაიზის / ნაწილის მოსულ შეტყობინებებსაც აშორებს
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-counts'] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <PageContainer>
      <PageHeader module="movie" title={t('franchise.section')} hint={<InfoHint wide info={t('franchise.pageHint')} />} />

      <ChipRow className="mb-5">
        <Chip check active={withComplete} count={counts?.complete} onClick={() => toggle('complete', !withComplete)} data-testid="franchises-complete">
          {t('franchise.withComplete')}
        </Chip>
        <Chip check active={withMuted} count={counts?.muted} onClick={() => toggle('muted', !withMuted)} data-testid="franchises-muted">
          {t('franchise.withMuted')}
        </Chip>
      </ChipRow>

      {list.isError ? (
        <QueryErrorState error={list.error} onRetry={list.refetch} retrying={list.isFetching} />
      ) : list.isLoading ? null : list.items.length === 0 ? (
        <EmptyState title={t('franchise.none')} hint={t('franchise.noneHint')} />
      ) : (
        <>
          <div className="space-y-4">
            {list.items.map((franchise) => (
              <FranchiseCard
                key={franchise.collection_id}
                franchise={franchise}
                focused={franchise.collection_id === open}
                busy={remind.isPending}
                onRemind={(muted, tmdbId) => remind.mutate({ collection: franchise.collection_id, muted, tmdbId })}
              />
            ))}
          </div>
          <Pagination className="mt-5" {...list.pagination} />
        </>
      )}
    </PageContainer>
  )
}

/** ერთი ფრანჩაიზი: სახელი, „მაქვს N / სულ M", მოქმედებები და ნაწილები ყურების რიგით */
function FranchiseCard({
  franchise,
  focused,
  busy,
  onRemind,
}: {
  franchise: FranchiseRow
  /** შეტყობინებიდან გახსნილი — გამოკვეთილია */
  focused: boolean
  busy: boolean
  /** `tmdbId`-ის გარეშე — მთელ ფრანჩაიზზე */
  onRemind: (muted: boolean, tmdbId?: number) => void
}) {
  const { t } = useTranslation()
  const { enqueue, isQueued } = useQueue()

  // „ყველა ნაკლული": გაჩუმებული ნაწილი განზრახ გამორჩეულია და რიგში არ დგება
  const addable = franchise.parts.filter((part) => !part.owned && !part.muted)
  const waiting = addable.filter((part) => !isQueued(part.tmdb_id, 'movie'))

  return (
    <section
      data-testid="franchise"
      data-focused={focused || undefined}
      className={cn('rounded-lg border bg-card p-4', focused ? 'border-[var(--mod)]' : 'border-border')}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto flex min-w-0 items-center gap-2 text-base font-semibold">
          <Layers className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{franchise.name ?? t('franchise.unnamed')}</span>
        </h2>
        <Badge size="row" className="bg-secondary" data-testid="franchise-have">
          {t('franchise.have', { owned: franchise.owned, total: franchise.total })}
        </Badge>
        {addable.length > 0 && (
          <Button
            size="sm"
            disabled={waiting.length === 0}
            onClick={() => enqueue(waiting.map((part) => ({ tmdbId: part.tmdb_id, title: part.title })), 'movie')}
            data-testid="franchise-add-all"
          >
            {waiting.length === 0 ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {t('franchise.addAll')}
            <CountBadge count={addable.length} />
          </Button>
        )}
        {franchise.state !== 'complete' && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onRemind(!franchise.muted)} data-testid="franchise-mute">
            {franchise.muted ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            {t(franchise.muted ? 'franchise.remindOn' : 'franchise.muteFranchise')}
          </Button>
        )}
      </header>

      <ul className="grid gap-2 lg:grid-cols-2">
        {franchise.parts.map((part) => (
          <PartRow key={part.tmdb_id} part={part} busy={busy} onRemind={(muted) => onRemind(muted, part.tmdb_id)} />
        ))}
      </ul>
    </section>
  )
}

/** ნაწილი: ჩემი — ბმული ჩანაწერზე; ნაკლული — წყვეტილი ჩარჩოთი, „დამატება" და „აღარ შემახსენო" */
function PartRow({ part, busy, onRemind }: { part: FranchisePartRow; busy: boolean; onRemind: (muted: boolean) => void }) {
  const { t } = useTranslation()
  const { date } = useDateFormat()
  const { enqueue, isQueued } = useQueue()
  const adding = isQueued(part.tmdb_id, 'movie')

  const poster = (
    <span className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-muted">
      <PosterImage src={part.poster} alt={part.title} className="h-full w-full" />
    </span>
  )

  if (part.owned && part.movie_id) {
    return (
      <li>
        <Link
          to={`${MEDIA.movie.detailBase}/${part.movie_id}`}
          data-testid="franchise-part"
          data-owned
          className="flex items-center gap-3 rounded-md border border-border bg-card p-2 transition-colors hover:bg-muted"
        >
          {poster}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{part.title}</span>
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="size-3.5 text-[var(--icon-ok)]" />
              {[part.year, t('franchise.inLibrary')].filter(Boolean).join(' · ')}
            </span>
          </span>
        </Link>
      </li>
    )
  }

  // გამოუსვლელი: თარიღი, თუ ცნობილია; თორემ — „გამოცხადებულია"
  const when = part.released ? part.year : part.date ? date(part.date) : t('franchise.announced')

  return (
    <li
      data-testid="franchise-part"
      data-missing
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border bg-card/40 p-2',
        part.muted && 'opacity-60',
      )}
    >
      {poster}
      <span className="min-w-0 flex-1 basis-40">
        <span className="block truncate text-sm font-medium">{part.title}</span>
        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          {!part.released && <CalendarClock className="size-3.5" />}
          {[when, part.released ? t('franchise.missing') : t('soon.section')].filter(Boolean).join(' · ')}
        </span>
      </span>
      <Button size="sm" disabled={adding} onClick={() => enqueue([{ tmdbId: part.tmdb_id, title: part.title }], 'movie')} data-testid="franchise-add">
        {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {adding ? t('queue.queued') : t('actor.add')}
      </Button>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => onRemind(!part.muted)} data-testid="franchise-part-mute">
        {part.muted ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        {t(part.muted ? 'franchise.remindOn' : 'franchise.remindOff')}
      </Button>
    </li>
  )
}
