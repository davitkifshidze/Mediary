import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, History, Loader2, Play, RotateCw, Square, Unplug } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { resumeSyncRun, stopSyncRun, SYNC_RUN_RESULTS, type SyncRun, type SyncRunResult, type SyncRunState } from '@/api/syncRuns'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { modAccent } from '@/lib/modules'
import { useSettings } from '@/lib/settings'
import { SYNC_KIND_LOOK, SYNC_RESULT_LOOK } from '@/lib/syncLook'
import { cn } from '@/lib/utils'
import { Badge, CountBadge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'

/* ============================================================
   **გაშვების წვრილი ნაწილები** — შედეგების გვერდიც და სინქრონიზაციის ბარათებიც
   ერთსა და იმავეს ხატავენ: შედეგის ჯამებს, გაშვების მდგომარეობას, დაუსრულებელი
   გაშვების ზოლს, „ბოლო გაშვების" ხაზს და გაწყვეტილი გაშვების ღილაკებს
   („გაგრძელება" · „ჩავარდნილების თავიდან გაშვება" · „შეჩერება").
   ============================================================ */

/**
 * შედეგის ჯამები ფერადი ნიშნებით — განახლდა · უცვლელი · გამოტოვდა · ჩავარდა.
 * ⚠️ ოთხივე ყოველთვის იხატება (ნული გაუფერულებული), რომ ნიშნები რიგიდან რიგში არ
 * ინაცვლებდეს; სახელი `title`-შია — ნიშანში მხოლოდ აიქონი და რიცხვია.
 */
export function RunCounts({ counts, className }: { counts: Record<SyncRunResult, number>; className?: string }) {
  const { t } = useTranslation()

  return (
    <span className={cn('flex flex-wrap items-center gap-1.5', className)} data-testid="run-counts">
      {SYNC_RUN_RESULTS.map((result) => {
        const { icon: Icon, tone, soft } = SYNC_RESULT_LOOK[result]
        const count = counts[result] ?? 0

        return (
          <Badge
            key={result}
            title={t(`syncResults.result.${result}`)}
            data-result={result}
            className={cn('tabular-nums', soft, count === 0 && 'opacity-40')}
          >
            <Icon className={cn('size-3.5', tone)} aria-label={t(`syncResults.result.${result}`)} />
            {count}
          </Badge>
        )
      })}
    </span>
  )
}

const STATE_LOOK: Record<SyncRunState, { icon: LucideIcon; tone: string; soft: string; spin?: boolean }> = {
  running: { icon: Loader2, tone: 'text-[var(--icon-info)]', soft: 'bg-[color-mix(in_oklab,var(--icon-info)_14%,transparent)]', spin: true },
  interrupted: { icon: Unplug, tone: 'text-[var(--icon-warn)]', soft: 'bg-[color-mix(in_oklab,var(--icon-warn)_14%,transparent)]' },
  finished: { icon: CircleCheck, tone: 'text-[var(--icon-ok)]', soft: 'bg-secondary' },
}

/** გაშვების მდგომარეობა: მიმდინარეობს · გაწყდა · დასრულდა */
export function RunStateBadge({ state }: { state: SyncRunState }) {
  const { t } = useTranslation()
  const { icon: Icon, tone, soft, spin } = STATE_LOOK[state]

  return (
    <Badge className={cn('font-normal', soft)} data-testid="run-state" data-state={state}>
      <Icon className={cn('size-3.5', tone, spin && 'animate-spin')} />
      {t(`syncResults.state.${state}`)}
    </Badge>
  )
}

/** დაუსრულებელი გაშვების ზოლი — რამდენს აქვს შედეგი დაგეგმილიდან; დასრულებულზე არ იხატება */
export function RunProgress({ run, className }: { run: Pick<SyncRun, 'done' | 'total' | 'state'>; className?: string }) {
  if (run.state === 'finished' || run.total <= 0 || run.done >= run.total) return null

  const percent = Math.round((run.done / run.total) * 100)

  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn('block h-1.5 overflow-hidden rounded-md bg-muted', className)}
      data-testid="run-progress"
    >
      <span className="block h-full rounded-md bg-[var(--mod)] transition-[width]" style={{ width: `${percent}%` }} />
    </span>
  )
}

/**
 * ბარათის ქვედა ხაზი: ბოლო გაშვება — როდის და რა შედეგით; მთლიანად ბმულია ამ გაშვების
 * გვერდზე. `kind` — სახეობაც ეწერება (ბარათი, რომელიც ყველა სახეობის ისტორიას ხსნის).
 */
export function LastRun({ run, kind = false }: { run: SyncRun | null | undefined; kind?: boolean }) {
  const { t } = useTranslation()
  const { dateTime } = useDateFormat()

  if (!run) {
    return (
      <span className="text-xs text-muted-foreground" data-testid="last-run-none">
        {t('syncCards.neverRan')}
      </span>
    )
  }

  return (
    <Link
      to={`/sync/results/${run.key}`}
      className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      data-testid="last-run"
    >
      <span>
        {kind && `${t(`syncResults.kind.${run.kind}`)} · `}
        {t('syncCards.lastRun', { date: dateTime(run.last_at ?? run.started_at) })}
      </span>
      <RunCounts counts={run.counts} />
    </Link>
  )
}

/**
 * **გაშვების ღილაკები**: მიმდინარეზე — „შეჩერება"; გაწყვეტილზე — „გაგრძელება" (მხოლოდ
 * ის, რასაც შედეგი არ აქვს); ჩავარდნილებზე — „ჩავარდნილების თავიდან გაშვება". ორივე
 * იმავე პარამეტრებით და იმავე გაშვებაში ეშვება, სერვერზე ფონურად — ჩანართის დახურვა
 * მას აღარ წყვეტს.
 *
 * ⚠️ `one` — ვიწრო ადგილი (გაშვებების სია, სინქრონიზაციის ბარათი): ერთი ღილაკი, ის,
 * რომელიც ახლა ყველაზე საჭიროა; გაშვების გვერდზე ორივე ვარიანტი ჩანს.
 * ⚠️ პაუზა ერთეულებს შორის პარამეტრებიდანაა — თარგმანს თავისი აქვს (Gemini-ს ლიმიტი).
 */
export function RunActions({ run, one = false }: { run: SyncRun; one?: boolean }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { settings } = useSettings()
  const qc = useQueryClient()

  const refresh = () => {
    for (const key of ['sync-run', 'sync-run-items', 'sync-runs', 'sync-overview']) {
      qc.invalidateQueries({ queryKey: [key] })
    }
  }

  const resume = useMutation({
    mutationFn: (only?: 'failed') =>
      resumeSyncRun(run.key, {
        only,
        delay_ms: run.kind === 'translate' ? settings.translateDelayMs : settings.syncDelayMs,
      }),
    onSuccess: (_, only) => {
      toast({ title: t(only === 'failed' ? 'syncResults.retried' : 'syncResults.resumed'), variant: 'success' })
      refresh()
    },
    onError: (e) => {
      toast({ title: errorMessage(e), variant: 'error' })
      refresh()
    },
  })

  const stop = useMutation({
    mutationFn: () => stopSyncRun(run.key),
    onSuccess: refresh,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const busy = resume.isPending || stop.isPending

  if (run.state === 'running') {
    // ბრაუზერის რიგით მიმდინარე გაშვებას სერვერი ვერ აჩერებს — მას რიგის საკუთარი ღილაკი აქვს
    return !run.stoppable ? null : (
      <Button size="sm" variant="destructiveOutline" disabled={busy} onClick={() => stop.mutate()} data-testid="run-stop">
        <Square className="size-4" />
        {t('mediaSync.stop')}
      </Button>
    )
  }

  if (!run.resumable && !run.retryable) {
    // გაწყდა, მაგრამ ღილაკი არ აქვს: ძველი გაშვებაა — რაზე და რით გაეშვა, მასზე არ ინახება
    return run.state === 'interrupted' ? (
      <span data-testid="run-old">
        <InfoHint info={t('errors.sync_run_not_resumable')} />
      </span>
    ) : null
  }

  return (
    <span className="flex flex-wrap items-center gap-2" data-testid="run-actions">
      {run.resumable && (
        <Button size="sm" disabled={busy} onClick={() => resume.mutate(undefined)} data-testid="run-resume">
          {resume.isPending && resume.variables === undefined ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {t('syncResults.resume')}
          <CountBadge count={run.left} />
        </Button>
      )}
      {run.retryable && !(one && run.resumable) && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => resume.mutate('failed')} data-testid="run-retry">
          {resume.isPending && resume.variables === 'failed' ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
          {t('syncResults.retryFailed')}
          <CountBadge count={run.counts.failed} />
        </Button>
      )}
    </span>
  )
}

/**
 * **დაუსრულებელი გაშვება** — სინქრონიზაციისა და თარგმანის გვერდები მას ბარათების ზემოთ
 * თვითონ აჩვენებენ: რა სახის იყო, რამდენი გაკეთდა და მისი შედეგების გვერდი. გაწყვეტილზე —
 * „გაგრძელება", სერვერზე მიმდინარეზე — „შეჩერება".
 */
export function UnfinishedRun({ run }: { run: SyncRun }) {
  const { t } = useTranslation()
  const { dateTime } = useDateFormat()
  const { icon: Icon, color } = SYNC_KIND_LOOK[run.kind]

  return (
    <li
      style={modAccent(color)}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--mod)] bg-card p-3"
      data-testid="unfinished-run"
      data-state={run.state}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)] text-[var(--mod)]">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1 basis-56">
        <span className="block text-sm font-semibold">
          {t(run.state === 'running' ? 'syncCards.running' : 'syncCards.interrupted', { kind: t(`syncResults.kind.${run.kind}`) })}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {dateTime(run.last_at ?? run.started_at)} · {t('syncResults.partial', { done: run.done, total: run.total })}
        </span>
        <RunProgress run={run} className="mt-2" />
      </span>
      <RunActions run={run} one />
      <Link to={`/sync/results/${run.key}`} className={buttonVariants({ variant: 'outline', size: 'sm' })} data-testid="unfinished-run-link">
        <History className="size-4" />
        {t('syncResults.open')}
      </Link>
    </li>
  )
}
