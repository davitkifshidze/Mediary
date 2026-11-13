import { useEffect, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ChartColumn, CircleAlert, CircleCheck, DownloadCloud, Drama, History, Loader2, Play, SkipForward, Square } from 'lucide-react'
import { cancelBatch, fetchBatch, startBatch, type BatchItemResult, type BatchStatus } from '@/api/batches'
import { fetchEpisodePlan, type EpisodePlan, type TvType } from '@/api/episodes'
import { fetchSyncOverview, type SyncRun } from '@/api/syncRuns'
import { errorMessage, translateCode } from '@/lib/errors'
import { mediaKey, type MediaType } from '@/lib/media'
import { useModules } from '@/lib/modules'
import { useSettings } from '@/lib/settings'
import { safeGet, safeRemove, safeSet } from '@/lib/storage'
import { SYNC_KIND_LOOK } from '@/lib/syncLook'
import { cn } from '@/lib/utils'
import { SyncDialog, type SyncFlow } from '@/components/SyncDialog'
import { LastRun } from '@/components/SyncRunBits'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/feedback'
import { Switch } from '@/components/ui/switch'
import { TaskCard } from '@/components/ui/task-card'

/* ============================================================
   **სინქრონიზაციის ბარათები** — ინსტრუმენტების „სინქრონიზაცია" (`/sync`) და მოდულის
   „სინქრონიზაცია" (`/movies/sync`…) ერთსა და იმავე ბარათებს ხატავს; მოდულის გვერდზე
   (`type`) ყველაფერი ამ მოდულზეა დავიწროებული.

   · **მონაცემები TMDB-დან** — ფანჯარა (`SyncDialog`), ციკლი ბრაუზერის რიგში;
   · **სეზონები და სერიები** — სერვერის ფონური პარტია (`POST /batches`,
     `kind: episodes`): გვერდის დახურვა მას არ აჩერებს. ფილმს სეზონი არ აქვს —
     ფილმების გვერდზე ეს ბარათი არ არის;
   · **მსახიობები** — იგივე ფანჯარა, მეორე ნაკადით;
   · **შედეგები** — ყველა გაშვების ისტორია.

   თითო ბარათზე: რამდენია გასაშვები (`GET /sync/overview` — გეგმის იგივე რიცხვი) და
   რა დააბრუნა ამ სახეობის ბოლო გაშვებამ (ბმული მის გვერდზე).

   ⚠️ **სეზონების ბარათი ნაგულისხმევად მხოლოდ დაუსრულებელ სერიალებს უშვებს**:
   დასრულებულს ახალი სერია აღარ ემატება, თითო სეზონი კი TMDB-ის ცალკე მოთხოვნაა.
   „ყველა" გადამრთველია; რიცხვი გეგმას მიჰყვება.
   ⚠️ **შეწყვეტილი გაშვება გრძელდება**: რაც ბოლო საათებში უკვე ჩამოიტვირთა, გეგმაში
   აღარ ბრუნდება (`fresh`) — „დაწყება" დარჩენილებს აგრძელებს.
   ⚠️ **მიმდინარე პარტია ბრაუზერს ახსოვს** (გვერდზე ცალკე): გადატვირთვის ან დაბრუნების
   შემდეგ პროგრესი ისევ ჩანს და შეჩერებაც შეიძლება.
   ============================================================ */

const TV_TYPES: readonly MediaType[] = ['series', 'anime']

const isTv = (type: MediaType): type is TvType => TV_TYPES.includes(type)

/** პარტიის საკუთარი გამოტოვების მიზეზები (`RunBatchItem`) — შეცდომის კოდები არ არის */
const OWN_REASONS = ['sync_paused', 'record_not_found']

/** რამდენ ხანში ერთხელ ვეკითხებით პროგრესს */
const POLL_MS = 2000

/** მიმდინარე პარტიის id: მოდულის გვერდზე — მოდულზე ცალკე, საერთო გვერდზე — ერთი */
const batchKey = (types: TvType[]) => `episodes-batch.${types.length === 1 ? types[0] : 'all'}`

export function SyncCards({ type }: { type?: MediaType }) {
  const { t } = useTranslation()
  const { mediaModules } = useModules()
  /** რომელი ნაკადით არის ფანჯარა ღია: ჩანაწერები · მსახიობები */
  const [flow, setFlow] = useState<SyncFlow | null>(null)

  const overviewQ = useQuery({
    queryKey: ['sync-overview', type ?? 'all'],
    queryFn: () => fetchSyncOverview(type),
  })
  const overview = overviewQ.data
  /** `null` — ბარათი ამ ანგარიშს არ აქვს; `undefined` — რიცხვი უცნობია (ვერ ჩაიტვირთა) */
  const pending = overview?.pending

  const tvTypes = type ? (isTv(type) ? [type] : []) : mediaModules.map((m) => m.type).filter(isTv)

  // ბარათები ერთად ჩნდება: რომელი არ ეკუთვნის ამ ანგარიშს, სერვერი ამბობს
  if (overviewQ.isLoading) return null

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2" data-testid="sync-cards">
        {pending?.sync !== null && (
          <TaskCard
            {...SYNC_KIND_LOOK.sync}
            title={t('mediaSync.tmdbTitle')}
            info={t('syncCards.dataInfo')}
            text={t('syncCards.dataText')}
            count={pending?.sync}
            countLabel={t('syncCards.dataCount')}
            actions={
              <Button size="sm" onClick={() => setFlow('records')}>
                <DownloadCloud className="size-4" />
                {t('sync.open')}
              </Button>
            }
            footer={<LastRun run={overview?.last.sync} />}
            data-testid="tmdb-block"
          />
        )}

        {tvTypes.length > 0 && pending?.episodes !== null && (
          <EpisodesCard types={tvTypes} lastRun={overview?.last.episodes} />
        )}

        {pending?.cast !== null && (
          <TaskCard
            {...SYNC_KIND_LOOK.cast}
            title={t('syncResults.kind.cast')}
            info={t('syncCards.castInfo')}
            text={t('syncCards.castText')}
            count={pending?.cast}
            countLabel={t('syncCards.castCount')}
            actions={
              <Button size="sm" onClick={() => setFlow('cast')}>
                <Drama className="size-4" />
                {t('syncCards.castOpen')}
              </Button>
            }
            footer={<LastRun run={overview?.last.cast} />}
            data-testid="cast-block"
          />
        )}

        <TaskCard
          color="var(--tool-stats)"
          icon={ChartColumn}
          title={t('syncCards.resultsTitle')}
          text={t('syncCards.resultsText')}
          count={overview?.runs}
          countLabel={t('syncCards.resultsCount')}
          actions={
            <Link to="/sync/results" className={buttonVariants({ variant: 'outline', size: 'sm' })} data-testid="sync-results-link">
              <History className="size-4" />
              {t('syncResults.open')}
            </Link>
          }
          footer={<LastRun run={overview?.latest} kind />}
          data-testid="results-block"
        />
      </div>

      {/* ერთი ფანჯარა ორი ნაკადით; მოდულის გვერდზე — ამ მოდულზე გაფილტრული */}
      <SyncDialog open={flow !== null} onOpenChange={(open) => !open && setFlow(null)} only={type} flow={flow ?? 'records'} />
    </>
  )
}

function EpisodesCard({ types, lastRun }: { types: TvType[]; lastRun: SyncRun | null | undefined }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { settings } = useSettings()
  const qc = useQueryClient()
  const memory = batchKey(types)

  /** ყველა სერიალი და არა მხოლოდ დაუსრულებელი */
  const [all, setAll] = useState(false)
  const [batchId, setBatchId] = useState<string | null>(() => safeGet(memory))

  // გეგმა მოდულზე ცალკე მოდის; საერთო გვერდზე ერთ გაშვებად იკრიბება
  const planQs = useQueries({
    queries: types.map((type) => ({
      queryKey: ['episode-plan', type, all],
      queryFn: () => fetchEpisodePlan(type, { all }),
    })),
  })
  const plans = planQs.map((q) => q.data).filter((plan): plan is EpisodePlan => !!plan)
  const planned = plans.length === types.length
  const items = plans.flatMap((plan) => plan.items)
  const fresh = plans.reduce((sum, plan) => sum + plan.fresh, 0)
  const ended = plans.reduce((sum, plan) => sum + plan.ended, 0)

  const batchQ = useQuery({
    queryKey: ['episode-batch', batchId],
    queryFn: () => fetchBatch(batchId!),
    enabled: !!batchId,
    // სანამ მიმდინარეობს — პროგრესს ვეკითხებით; დასრულებული აღარ იკითხება
    refetchInterval: (query) => (query.state.data?.finished ? false : POLL_MS),
  })
  const batch = batchQ.data
  const running = !!batchId && !!batch && !batch.finished

  // დასრულდა ან შეჩერდა — გეგმა და ბარათების რიცხვები თავიდან: რაც ჩამოიტვირთა, გეგმაში აღარ არის
  const finished = batch?.finished
  // `types` ყოველ რენდერზე ახალი მასივია — ეფექტი მის შიგთავსს უყურებს
  const typesKey = types.join(',')
  useEffect(() => {
    if (!finished) return
    safeRemove(memory)
    for (const key of ['episode-plan', 'sync-overview', 'sync-runs', ...typesKey.split(',')]) {
      qc.invalidateQueries({ queryKey: [key] })
    }
  }, [finished, qc, memory, typesKey])

  // დამახსოვრებული პარტია აღარ არსებობს (404) — ახალს ვიწყებთ სუფთა ფურცლიდან
  useEffect(() => {
    if (!batchQ.isError) return
    safeRemove(memory)
    setBatchId(null)
  }, [batchQ.isError, memory])

  const start = useMutation({
    mutationFn: () =>
      startBatch(
        'episodes',
        items.map((item) => ({ type: item.type, id: item.id })),
        // პაუზა ერთეულებს შორის — იგივე პარამეტრი, რაც „მონაცემების სინქრონიზაციას" აქვს
        { delay_ms: settings.syncDelayMs },
      ),
    onSuccess: (status) => {
      if (!status.id) return
      safeSet(memory, status.id)
      qc.setQueryData(['episode-batch', status.id], status)
      setBatchId(status.id)
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const stop = useMutation({
    mutationFn: () => cancelBatch(batchId!),
    onSuccess: (status) => qc.setQueryData(['episode-batch', batchId], status),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <TaskCard
      {...SYNC_KIND_LOOK.episodes}
      title={types.length === 1 ? t(mediaKey('mediaSync.episodesTitle', types[0])) : t('mediaSync.episodesTitle')}
      info={t('mediaSync.episodesHint', { hours: plans[0]?.resume_hours ?? 6 })}
      text={t('syncCards.episodesText')}
      count={planned ? items.length : undefined}
      countLabel={t('syncCards.episodesCount')}
      actions={
        running ? (
          <Button size="sm" variant="destructiveOutline" onClick={() => stop.mutate()} disabled={stop.isPending || batch?.cancelled}>
            <Square className="size-4" />
            {t('mediaSync.stop')}
          </Button>
        ) : (
          <Button size="sm" onClick={() => start.mutate()} disabled={start.isPending || !planned || items.length === 0}>
            {start.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {t('mediaSync.start')}
          </Button>
        )
      }
      footer={<LastRun run={lastRun} />}
      data-testid="episodes-block"
    >
      {/* ---------- რა გაეშვება ---------- */}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={all} onCheckedChange={setAll} disabled={running} aria-label={t('mediaSync.all')} />
          {t('mediaSync.all')}
        </label>
        {planned && (fresh > 0 || (!all && ended > 0)) && (
          <p className="text-sm text-muted-foreground" data-testid="episodes-plan">
            {[fresh > 0 ? t('mediaSync.planFresh', { count: fresh }) : null, !all && ended > 0 ? t('mediaSync.planEnded', { count: ended }) : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>

      {batch && batch.id && <BatchProgress batch={batch} />}
    </TaskCard>
  )
}

/** პროგრესი და შედეგი: რამდენი განახლდა, რამდენი გამოტოვდა, რამდენი ჩავარდა და რატომ */
function BatchProgress({ batch }: { batch: BatchStatus }) {
  const { t } = useTranslation()
  const items = batch.items ?? []
  const count = (status: BatchItemResult['status']) => items.filter((item) => item.status === status).length
  const problems = items.filter((item) => item.status === 'failed' || item.status === 'skipped')
  /** რატომ: პარტიის საკუთარი მიზეზები აქ ითარგმნება, წყაროს კოდები — `lib/errors.ts`-ით */
  const reason = (code: string | null) =>
    code && OWN_REASONS.includes(code) ? t(`mediaSync.reason.${code}`) : (translateCode(code) ?? t('mediaSync.reasonUnknown'))
  const current = items.find((item) => item.status === 'running')

  return (
    <div className="mt-4" data-testid="episodes-progress">
      <div className="h-2 overflow-hidden rounded-md bg-muted">
        <div
          className={cn('h-full rounded-md transition-[width]', batch.failed ? 'bg-amber-500' : 'bg-[var(--mod)]')}
          style={{ width: `${batch.progress ?? 0}%` }}
        />
      </div>

      <p className="mt-2 text-sm">
        {batch.finished
          ? batch.cancelled
            ? t('mediaSync.stopped')
            : t('mediaSync.done')
          : t('mediaSync.running', { done: (batch.total ?? 0) - (batch.pending ?? 0), total: batch.total ?? 0 })}
        {current?.title && !batch.finished && <span className="text-muted-foreground"> · {current.title}</span>}
      </p>

      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground" data-testid="episodes-result">
        <span className="inline-flex items-center gap-1">
          <CircleCheck className="size-4 text-status-watched" />
          {t('mediaSync.updated', { count: count('ok') })}
        </span>
        <span className="inline-flex items-center gap-1">
          <SkipForward className="size-4" />
          {t('mediaSync.skipped', { count: count('skipped') })}
        </span>
        <span className="inline-flex items-center gap-1">
          <CircleAlert className={cn('size-4', count('failed') > 0 && 'text-destructive')} />
          {t('mediaSync.failed', { count: count('failed') })}
        </span>
      </p>

      {/* რომელი ჩავარდა ან გამოტოვდა — და რატომ */}
      {problems.length > 0 && (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-md border border-border text-sm">
          {problems.map((item) => (
            <li key={`${item.type}-${item.id}`} className="flex flex-wrap items-baseline gap-x-2 px-3 py-2">
              <span className={cn('font-medium', item.status === 'failed' && 'text-destructive')}>{item.title ?? `#${item.id}`}</span>
              <span className="text-muted-foreground">{reason(item.error)}</span>
            </li>
          ))}
        </ul>
      )}

      {batch.finished && items.length === 0 && <EmptyState size="line" title={t('mediaSync.nothingRan')} className="mt-2" />}
    </div>
  )
}
