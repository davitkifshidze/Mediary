import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CircleAlert, CircleCheck, DownloadCloud, Loader2, Play, SkipForward, Square } from 'lucide-react'
import { cancelBatch, fetchBatch, startBatch, type BatchItemResult, type BatchStatus } from '@/api/batches'
import { fetchEpisodePlan, type TvType } from '@/api/episodes'
import { errorMessage, translateCode } from '@/lib/errors'
import { mediaKey, type MediaType } from '@/lib/media'
import { useSettings } from '@/lib/settings'
import { safeGet, safeRemove, safeSet } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { SyncDialog } from '@/components/SyncDialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Switch } from '@/components/ui/switch'

/* ============================================================
   **მოდულის სინქრონიზაცია** — `/movies/sync` · `/series/sync` · `/anime/sync`,
   ქვემენიუს „სინქრონიზაცია".

   ორი ბლოკი:
   · **სეზონები და სერიები — ყველა სერიალზე** (სერიალი და ანიმე): აქამდე სეზონები
     მხოლოდ თითო სერიალის გვერდიდან იტვირთებოდა. გაშვება სერვერის ფონური პარტიაა
     (`POST /batches`, `kind: episodes`) — გვერდის დახურვა მას არ აჩერებს;
   · **მონაცემები TMDB-დან** — ის, რაც ინსტრუმენტების „სინქრონიზაციაშია", ამ
     მოდულზე გაფილტრული (`SyncDialog only`). ფილმებს მხოლოდ ეს ბლოკი აქვს.

   ⚠️ **ნაგულისხმევად მხოლოდ დაუსრულებელი სერიალები**: დასრულებულს ახალი სერია
   აღარ ემატება, თითო სეზონი კი TMDB-ის ცალკე მოთხოვნაა. „ყველა" გადამრთველია.

   ⚠️ **შეწყვეტილი გაშვება გრძელდება**: რაც ბოლო საათებში უკვე ჩამოიტვირთა, გეგმაში
   აღარ ბრუნდება (`fresh`) — „დაწყება" დარჩენილებს აგრძელებს.

   ⚠️ **მიმდინარე პარტია ბრაუზერს ახსოვს** (მოდულზე): გვერდის გადატვირთვის ან
   დაბრუნების შემდეგ პროგრესი ისევ ჩანს და შეჩერებაც შეიძლება.
   ============================================================ */

/** მიმდინარე პარტიის id — მოდულზე ცალკე */
const batchKey = (type: TvType) => `episodes-batch.${type}`

/** პარტიის საკუთარი გამოტოვების მიზეზები (`RunBatchItem`) — შეცდომის კოდები არ არის */
const OWN_REASONS = ['sync_paused', 'record_not_found']

/** რამდენ ხანში ერთხელ ვეკითხებით პროგრესს */
const POLL_MS = 2000

export function MediaSyncPage({ type }: { type: MediaType }) {
  const { t } = useTranslation()
  const [dialog, setDialog] = useState(false)

  return (
    <PageContainer>
      <PageHeader module={type} title={t('mediaSync.section')} hint={<InfoHint info={t(mediaKey('mediaSync.hint', type))} />} />

      <div className="space-y-4">
        {type !== 'movie' && <EpisodesBlock type={type} />}

        <section className="rounded-xl border border-border bg-card p-5" data-testid="tmdb-block">
          <h2 className="font-display text-base font-semibold">{t('mediaSync.tmdbTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('mediaSync.tmdbDesc')}</p>
          <Button className="mt-4" onClick={() => setDialog(true)}>
            <DownloadCloud className="size-4" />
            {t('sync.open')}
          </Button>
        </section>
      </div>

      {/* ინსტრუმენტების იგივე ფანჯარა, ამ მოდულზე გაფილტრული */}
      <SyncDialog open={dialog} onOpenChange={setDialog} only={type} />
    </PageContainer>
  )
}

function EpisodesBlock({ type }: { type: TvType }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { settings } = useSettings()
  const qc = useQueryClient()

  /** ყველა სერიალი და არა მხოლოდ დაუსრულებელი */
  const [all, setAll] = useState(false)
  const [batchId, setBatchId] = useState<string | null>(() => safeGet(batchKey(type)))

  const planQ = useQuery({
    queryKey: ['episode-plan', type, all],
    queryFn: () => fetchEpisodePlan(type, { all }),
  })
  const plan = planQ.data

  const batchQ = useQuery({
    queryKey: ['episode-batch', batchId],
    queryFn: () => fetchBatch(batchId!),
    enabled: !!batchId,
    // სანამ მიმდინარეობს — პროგრესს ვეკითხებით; დასრულებული აღარ იკითხება
    refetchInterval: (query) => (query.state.data?.finished ? false : POLL_MS),
  })
  const batch = batchQ.data
  const running = !!batchId && !!batch && !batch.finished

  // დასრულდა ან შეჩერდა — გეგმა თავიდან: რაც ჩამოიტვირთა, მასში აღარ არის
  const finished = batch?.finished
  useEffect(() => {
    if (!finished) return
    safeRemove(batchKey(type))
    qc.invalidateQueries({ queryKey: ['episode-plan', type] })
    qc.invalidateQueries({ queryKey: [type] })
  }, [finished, qc, type])

  // დამახსოვრებული პარტია აღარ არსებობს (404) — ახალს ვიწყებთ სუფთა ფურცლიდან
  useEffect(() => {
    if (!batchQ.isError) return
    safeRemove(batchKey(type))
    setBatchId(null)
  }, [batchQ.isError, type])

  const start = useMutation({
    mutationFn: () =>
      startBatch(
        'episodes',
        (plan?.items ?? []).map((item) => ({ type: item.type, id: item.id })),
        // პაუზა ერთეულებს შორის — იგივე პარამეტრი, რაც „მონაცემების სინქრონიზაციას" აქვს
        { delay_ms: settings.syncDelayMs },
      ),
    onSuccess: (status) => {
      if (!status.id) return
      safeSet(batchKey(type), status.id)
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

  const pending = plan?.items.length ?? 0

  return (
    <section className="rounded-xl border border-border bg-card p-5" data-testid="episodes-block">
      <h2 className="flex items-center gap-1.5 font-display text-base font-semibold">
        {t(mediaKey('mediaSync.episodesTitle', type))}
        <InfoHint info={t('mediaSync.episodesHint', { hours: plan?.resume_hours ?? 6 })} />
      </h2>

      {/* ---------- რა გაეშვება ---------- */}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={all} onCheckedChange={setAll} disabled={running} aria-label={t('mediaSync.all')} />
          {t('mediaSync.all')}
        </label>
        {plan && (
          <p className="text-sm text-muted-foreground" data-testid="episodes-plan">
            {t('mediaSync.planLine', { count: pending })}
            {plan.fresh > 0 && ` · ${t('mediaSync.planFresh', { count: plan.fresh })}`}
            {!all && plan.ended > 0 && ` · ${t('mediaSync.planEnded', { count: plan.ended })}`}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {running ? (
          <Button variant="destructiveOutline" onClick={() => stop.mutate()} disabled={stop.isPending || batch?.cancelled}>
            <Square className="size-4" />
            {t('mediaSync.stop')}
          </Button>
        ) : (
          <Button onClick={() => start.mutate()} disabled={start.isPending || planQ.isLoading || pending === 0}>
            {start.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {t('mediaSync.start')}
          </Button>
        )}
      </div>

      {batch && batch.id && <BatchProgress batch={batch} />}
    </section>
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
          className={cn('h-full rounded-md transition-[width]', batch.failed ? 'bg-amber-500' : 'bg-primary')}
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
