import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleAlert, CircleCheck, CircleMinus, CirclePause, CirclePlay, RefreshCw, Search, SkipForward } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  fetchSyncRun,
  fetchSyncRunItems,
  fetchSyncRuns,
  pauseSyncRunItems,
  SYNC_RUN_RESULTS,
  type SyncRun,
  type SyncRunItem,
  type SyncRunResult,
} from '@/api/syncRuns'
import { useDateFormat } from '@/lib/dates'
import { errorMessage, translateCode } from '@/lib/errors'
import { MEDIA, MEDIA_NAV_KEY } from '@/lib/media'
import { isMediaKey } from '@/lib/modules'
import { usePagedList, usePages } from '@/lib/paged'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Chip, ChipRow } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { QueryErrorState } from '@/components/ui/query-error-state'

/* ============================================================
   **„სინქრონიზაციის შედეგები"** — `/sync/results` (გაშვებების სია) და
   `/sync/results/:key` (ერთი გაშვების ერთეულები).

   გაშვება აქამდე მხოლოდ მანამ ჩანდა, სანამ ფანჯარა ღია იყო. აქ ჩანს: როდის, რა
   სახის (მონაცემები · სეზონები · მსახიობები · თარგმანი), რომელ მოდულებზე, რამდენი
   ერთეული და რა შედეგით; შიგნით — თითო ერთეული: რა დაბრუნდა, რატომ და **რა
   შეიცვალა** (ველების სია, მნიშვნელობების გარეშე — ისინი ჩანაწერის გვერდზეა).

   ⚠️ „აღარ გაეშვას" ჩანაწერის იმავე გადამრთველს წერს, რასაც მისი გვერდი
   („აღარ განაახლო"): მონიშნულებზე ან გაშვების ყველა ჩავარდნილზე ერთად; იქვე
   ბრუნდება („ისევ გაეშვას").
   ⚠️ ისტორია 90 დღე ინახება; ჩაკეტილი ჩანაწერის ერთეული აქ არ ჩანს.
   ============================================================ */

const RESULT_LOOK: Record<SyncRunResult, { icon: LucideIcon; tone: string }> = {
  updated: { icon: CircleCheck, tone: 'text-[var(--icon-ok)]' },
  unchanged: { icon: CircleMinus, tone: 'text-muted-foreground' },
  skipped: { icon: SkipForward, tone: 'text-[var(--icon-warn)]' },
  failed: { icon: CircleAlert, tone: 'text-destructive' },
}

export function SyncResultsPage() {
  const { key } = useParams()

  return key ? <RunDetail runKey={key} /> : <RunList />
}

/** ტიპი → სახელი: მედია-მოდულის სექციის სახელი, მსახიობზე — „მსახიობები" */
function useTypeName() {
  const { t } = useTranslation()

  return (type: string) => (isMediaKey(type) ? t(MEDIA_NAV_KEY[type]) : type === 'actor' ? t('sync.changed.cast') : type)
}

/** გაშვების ერთი ხაზი — სიაშიც და გაშვების გვერდის თავშიც */
function RunSummary({ run }: { run: SyncRun }) {
  const { t } = useTranslation()
  const { dateTime } = useDateFormat()
  const typeName = useTypeName()

  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="min-w-0 flex-1 basis-56">
        <span className="block text-sm font-semibold">
          {t(`syncResults.kind.${run.kind}`)}
          {run.types.length > 0 && <span className="font-normal text-muted-foreground"> · {run.types.map(typeName).join(', ')}</span>}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {[dateTime(run.started_at), t(`syncResults.source.${run.source}`), run.done < run.total ? t('syncResults.partial', { done: run.done, total: run.total }) : t('syncResults.units', { count: run.total })]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-3" data-testid="run-counts">
        {SYNC_RUN_RESULTS.map((result) => {
          const { icon: Icon, tone } = RESULT_LOOK[result]
          const count = run.counts[result] ?? 0

          return (
            <span
              key={result}
              title={t(`syncResults.result.${result}`)}
              className={cn('inline-flex items-center gap-1 text-sm tabular-nums', count === 0 && 'opacity-40')}
            >
              <Icon className={cn('size-4', tone)} aria-label={t(`syncResults.result.${result}`)} />
              {count}
            </span>
          )
        })}
      </span>
    </span>
  )
}

function RunList() {
  const { t } = useTranslation()
  const list = usePagedList({
    queryKey: ['sync-runs'],
    fetchPage: (page, perPage) => fetchSyncRuns(page, perPage),
  })

  return (
    <PageContainer>
      <PageHeader
        tool="sync"
        title={t('syncResults.title')}
        hint={<InfoHint wide info={t('syncResults.hint')} />}
        actions={
          <Link to="/sync" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <RefreshCw className="size-3.5" />
            {t('sync.title')}
          </Link>
        }
      />

      {list.isError ? (
        <QueryErrorState error={list.error} onRetry={list.refetch} retrying={list.isFetching} />
      ) : list.isLoading ? null : list.items.length === 0 ? (
        <EmptyState title={t('syncResults.none')} hint={t('syncResults.noneHint')} />
      ) : (
        <>
          <ul className="space-y-2">
            {list.items.map((run) => (
              <li key={run.key}>
                <Link
                  to={`/sync/results/${run.key}`}
                  data-testid="sync-run"
                  className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted"
                >
                  <RunSummary run={run} />
                </Link>
              </li>
            ))}
          </ul>
          <Pagination className="mt-5" {...list.pagination} />
        </>
      )}
    </PageContainer>
  )
}

function RunDetail({ runKey }: { runKey: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [result, setResult] = useState<SyncRunResult | null>(null)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set())

  const run = useQuery({ queryKey: ['sync-run', runKey], queryFn: () => fetchSyncRun(runKey) })
  const items = usePages({
    queryKey: ['sync-run-items', runKey, result, q.trim()],
    fetchPage: (page, perPage) => fetchSyncRunItems(runKey, { result, q: q.trim(), page, per_page: perPage }),
  })

  const pause = useMutation({
    mutationFn: (v: { paused: boolean; target: { items: number[] } | { failed: true } }) => pauseSyncRunItems(runKey, v.paused, v.target),
    onSuccess: (changed, v) => {
      toast({ title: t(v.paused ? 'syncResults.pausedDone' : 'syncResults.resumedDone', { count: changed }), variant: 'success' })
      setPicked(new Set())
      qc.invalidateQueries({ queryKey: ['sync-run-items', runKey] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const pageIds = items.items.map((item) => item.id)
  const allPicked = pageIds.length > 0 && pageIds.every((id) => picked.has(id))
  const chosen = [...picked]

  const togglePage = (on: boolean) =>
    setPicked((current) => {
      const next = new Set(current)
      for (const id of pageIds) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  const toggle = (id: number, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  return (
    <PageContainer>
      <PageHeader
        tool="sync"
        title={t('syncResults.title')}
        hint={<InfoHint wide info={t('syncResults.hint')} />}
        actions={
          <Link to="/sync/results" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <ArrowLeft className="size-3.5" />
            {t('syncResults.allRuns')}
          </Link>
        }
      />

      {run.isError ? (
        <QueryErrorState error={run.error} onRetry={() => void run.refetch()} retrying={run.isFetching} />
      ) : !run.data ? null : (
        <>
          <div className="mb-4 rounded-lg border border-border bg-card p-3" data-testid="sync-run-head">
            <RunSummary run={run.data} />
          </div>

          <ChipRow className="mb-3">
            <Chip active={result === null} count={run.data.done} onClick={() => setResult(null)} data-testid="result-all">
              {t('filter.all')}
            </Chip>
            {SYNC_RUN_RESULTS.map((value) => (
              <Chip key={value} active={result === value} count={run.data.counts[value]} onClick={() => setResult(value)} data-testid={`result-${value}`}>
                {t(`syncResults.result.${value}`)}
              </Chip>
            ))}
          </ChipRow>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('syncResults.search')}
                aria-label={t('syncResults.search')}
                className="h-9 pl-9"
                data-testid="sync-run-search"
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              disabled={chosen.length === 0 || pause.isPending}
              onClick={() => pause.mutate({ paused: true, target: { items: chosen } })}
              data-testid="pause-picked"
            >
              <CirclePause className="size-4" />
              {t('syncResults.pausePicked')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={chosen.length === 0 || pause.isPending}
              onClick={() => pause.mutate({ paused: false, target: { items: chosen } })}
              data-testid="resume-picked"
            >
              <CirclePlay className="size-4" />
              {t('syncResults.resumePicked')}
            </Button>
            {run.data.counts.failed > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={pause.isPending}
                onClick={() => pause.mutate({ paused: true, target: { failed: true } })}
                data-testid="pause-failed"
              >
                <CircleAlert className="size-4" />
                {t('syncResults.pauseFailed')}
              </Button>
            )}
          </div>

          {items.isError ? (
            <QueryErrorState error={items.error} onRetry={items.refetch} retrying={items.isFetching} />
          ) : items.isLoading ? null : items.items.length === 0 ? (
            <EmptyState size="compact" kind="search" title={t('syncResults.noItems')} />
          ) : (
            <>
              <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={allPicked} onCheckedChange={(on) => togglePage(on === true)} data-testid="pick-page" />
                {t('syncResults.pickPage')}
              </label>
              <ul className="space-y-1.5">
                {items.items.map((item) => (
                  <ItemRow key={item.id} item={item} picked={picked.has(item.id)} onPick={(on) => toggle(item.id, on)} />
                ))}
              </ul>
              <Pagination className="mt-4" {...items.pagination} />
            </>
          )}
        </>
      )}
    </PageContainer>
  )
}

/** ჩანაწერის გვერდი; მსახიობს თავისი აქვს */
function recordPath(item: SyncRunItem): string | null {
  if (!item.exists) return null
  if (isMediaKey(item.type)) return `${MEDIA[item.type].detailBase}/${item.record_id}`

  return item.type === 'actor' ? `/actors/${item.record_id}` : null
}

function ItemRow({ item, picked, onPick }: { item: SyncRunItem; picked: boolean; onPick: (on: boolean) => void }) {
  const { t } = useTranslation()
  const typeName = useTypeName()
  const { icon: Icon, tone } = RESULT_LOOK[item.result]
  const path = recordPath(item)
  const title = item.title || `#${item.record_id}`

  /* „შეცვლილი": მედიის ველი (`sync.changed.*`), მსახიობის ჯგუფი (`castSync.field.*`) ან
     რიცხვიანი ფაქტი („სეზონები 8"); უცნობი გასაღები ნედლად ჩანს და არ იკარგება */
  const changes = item.changes
    .map((code) => {
      const [name, amount] = code.split(':')
      const label = t(`sync.changed.${name}`, { defaultValue: t(`castSync.field.${name}`, name) })

      return amount ? `${label} ${amount}` : label
    })
    .join(', ')

  const reason = item.reason ? t(`syncResults.reason.${item.reason}`, { defaultValue: translateCode(item.reason) ?? item.reason }) : null

  return (
    <li
      data-testid="sync-run-item"
      data-result={item.result}
      className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-2.5"
    >
      <Checkbox checked={picked} onCheckedChange={(on) => onPick(on === true)} aria-label={title} />
      <Icon className={cn('size-4 shrink-0', tone)} aria-label={t(`syncResults.result.${item.result}`)} />
      <span className="min-w-0 flex-1 basis-56">
        <span className="block truncate text-sm font-medium">
          {path ? (
            <Link to={path} className="hover:text-primary" data-testid="sync-run-item-link">
              {title}
            </Link>
          ) : (
            title
          )}
          <span className="font-normal text-muted-foreground"> · {typeName(item.type)}</span>
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {[
            t(`syncResults.result.${item.result}`),
            changes ? t('syncResults.changed', { fields: changes }) : null,
            reason,
            !item.exists ? t('syncResults.gone') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      {item.paused && (
        <Badge className="bg-secondary" data-testid="sync-run-item-paused">
          <CirclePause className="size-3.5" />
          {t('syncResults.paused')}
        </Badge>
      )}
    </li>
  )
}
