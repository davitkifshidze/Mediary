import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, CircleAlert, CirclePause, CirclePlay, FileImage, Minus, Plus, RefreshCw, Search } from 'lucide-react'
import {
  fetchSyncRun,
  fetchSyncRunItems,
  fetchSyncRuns,
  pauseSyncRunItems,
  SYNC_RUN_RESULTS,
  type SyncRun,
  type SyncRunDetail,
  type SyncRunItem,
  type SyncRunResult,
} from '@/api/syncRuns'
import { useDateFormat } from '@/lib/dates'
import { errorMessage, translateCode } from '@/lib/errors'
import { MEDIA, MEDIA_NAV_KEY } from '@/lib/media'
import { isMediaKey, modAccent } from '@/lib/modules'
import { usePagedList, usePages } from '@/lib/paged'
import { SYNC_KIND_LOOK, SYNC_RESULT_LOOK } from '@/lib/syncLook'
import { cn } from '@/lib/utils'
import { RunCounts, RunProgress } from '@/components/SyncRunBits'
import { Badge, CountBadge } from '@/components/ui/badge'
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
   ერთეული და რა შედეგით. გაშვება **ბარათია**: სახეობის აიქონი თავისი ფერით, მოდულები
   ნიშნებად, დრო, შედეგის ჯამები ფერადი ნიშნებით და დაუსრულებელზე — ზოლი (რამდენს
   აქვს შედეგი დაგეგმილიდან). შიგნით ერთეულიც ბარათია: რა დაბრუნდა, რატომ და **რა რით
   შეიცვალა**: ერთეული იშლება და ყოველ ველზე ჩანს „იყო → გახდა" (ცარიელიდან
   შევსებულზე — „ახალი"), ჟანრებსა და მსახიობებზე — რა დაემატა და რა მოაკლდა,
   პოსტერსა და ფოტოზე — მხოლოდ ფაქტი, თარგმანზე — რომელმა წყარომ შეავსო. ძველ
   გაშვებებს მნიშვნელობები არ აქვს — იქ ისევ ველების სია ჩანს.

   ⚠️ „აღარ გაეშვას" ჩანაწერის იმავე გადამრთველს წერს, რასაც მისი გვერდი
   („აღარ განაახლო"): მონიშნულებზე ან გაშვების ყველა ჩავარდნილზე ერთად; იქვე
   ბრუნდება („ისევ გაეშვას").
   ⚠️ ისტორია 90 დღე ინახება; ჩაკეტილი ჩანაწერის ერთეული აქ არ ჩანს.
   ============================================================ */

export function SyncResultsPage() {
  const { key } = useParams()

  return key ? <RunDetail runKey={key} /> : <RunList />
}

/** ტიპი → სახელი: მედია-მოდულის სექციის სახელი, მსახიობზე — „მსახიობები" */
function useTypeName() {
  const { t } = useTranslation()

  return (type: string) => (isMediaKey(type) ? t(MEDIA_NAV_KEY[type]) : type === 'actor' ? t('sync.changed.cast') : type)
}

/**
 * გაშვების ბარათის შიგთავსი — სიაშიც და გაშვების გვერდის თავშიც. ფერს (`--mod`) გარსი
 * აყენებს: სიაში ბარათი ბმულია, გაშვების გვერდზე — უბრალო ყუთი.
 */
function RunSummary({ run }: { run: SyncRun }) {
  const { t } = useTranslation()
  const { dateTime } = useDateFormat()
  const typeName = useTypeName()
  const Icon = SYNC_KIND_LOOK[run.kind].icon

  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)] text-[var(--mod)]">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1 basis-56">
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
          {t(`syncResults.kind.${run.kind}`)}
          {run.types.map((type) => (
            <Badge key={type} className="bg-secondary font-normal" data-testid="run-module">
              {typeName(type)}
            </Badge>
          ))}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {[dateTime(run.started_at), t(`syncResults.source.${run.source}`), run.done < run.total ? t('syncResults.partial', { done: run.done, total: run.total }) : t('syncResults.units', { count: run.total })]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <RunProgress run={run} className="mt-2" />
      </span>
      <RunCounts counts={run.counts} />
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
                  style={modAccent(SYNC_KIND_LOOK[run.kind].color)}
                  className="block rounded-lg border border-border bg-card p-3 transition-colors hover:border-[var(--mod)]"
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
  /** რომელი ერთეულებია გაშლილი — „რა რით შეიცვალა" */
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set())

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

  /** ამ გვერდის ერთეულები, რომლებსაც გასაშლელი აქვს */
  const detailed = items.items.filter((item) => item.details.length > 0).map((item) => item.id)
  const allOpened = detailed.length > 0 && detailed.every((id) => opened.has(id))

  const toggleOpened = (ids: number[], on: boolean) =>
    setOpened((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

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
          <div
            className="mb-4 rounded-lg border border-border bg-card p-3"
            style={modAccent(SYNC_KIND_LOOK[run.data.kind].color)}
            data-testid="sync-run-head"
          >
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
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={allPicked} onCheckedChange={(on) => togglePage(on === true)} data-testid="pick-page" />
                  {t('syncResults.pickPage')}
                </label>
                {detailed.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => toggleOpened(detailed, !allOpened)} data-testid="details-all">
                    {allOpened ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    {t(allOpened ? 'syncResults.detail.hideAll' : 'syncResults.detail.showAll')}
                  </Button>
                )}
              </div>
              <ul className="space-y-2">
                {items.items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    picked={picked.has(item.id)}
                    onPick={(on) => toggle(item.id, on)}
                    open={opened.has(item.id)}
                    onOpen={(on) => toggleOpened([item.id], on)}
                  />
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

/** ველის წარწერა: მსახიობის სვეტი · მედიის ველი · (უცნობი გასაღები ნედლად) */
function useFieldName() {
  const { t } = useTranslation()

  return (field: string) => t(`syncResults.field.${field}`, { defaultValue: t(`sync.changed.${field}`, field) })
}

/** გრძელი ტექსტი სამ ხაზად იჭრება; „მეტი" მთლიანად შლის */
function LongText({ text, className }: { text: string; className?: string }) {
  const { t } = useTranslation()
  const [full, setFull] = useState(false)
  const long = text.length > 220

  return (
    <span className={cn('block min-w-0', className)}>
      <span className={cn('block whitespace-pre-line break-words', long && !full && 'line-clamp-3')}>{text}</span>
      {long && (
        <Button variant="outline" size="sm" className="mt-1" onClick={() => setFull((v) => !v)} data-testid="detail-more">
          {full ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {t(full ? 'syncResults.detail.less' : 'syncResults.detail.more')}
        </Button>
      )}
    </span>
  )
}

/** ერთეულის „რა რით შეიცვალა" — ველი · იყო → გახდა */
function ChangeDetails({ details }: { details: SyncRunDetail[] }) {
  const { t } = useTranslation()
  const fieldName = useFieldName()

  return (
    <dl className="mt-3 space-y-2.5 border-t border-border pt-3 text-sm" data-testid="sync-run-item-details">
      {details.map((detail) => (
        <div key={detail.field} className="grid gap-x-4 gap-y-1 sm:grid-cols-[12rem_minmax(0,1fr)]" data-testid="sync-run-detail" data-field={detail.field}>
          <dt className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {fieldName(detail.field)}
            {'by' in detail && detail.by && <Badge className="bg-secondary">{t(`translate.source.${detail.by}`, detail.by)}</Badge>}
          </dt>
          <dd className="min-w-0">
            {'file' in detail ? (
              <span className="inline-flex items-center gap-1.5">
                <FileImage className="size-4 text-[var(--icon-ok)]" />
                {t(detail.replaced ? 'syncResults.detail.fileReplaced' : 'syncResults.detail.fileNew')}
              </span>
            ) : 'added' in detail ? (
              <span className="flex flex-wrap gap-1.5">
                {detail.added.map((name) => (
                  <Badge key={`+${name}`} className="bg-secondary" data-testid="detail-added">
                    <Plus className="size-3.5 text-[var(--icon-ok)]" aria-label={t('syncResults.detail.added')} />
                    {name}
                  </Badge>
                ))}
                {detail.removed.map((name) => (
                  <Badge key={`-${name}`} className="bg-secondary text-muted-foreground" data-testid="detail-removed">
                    <Minus className="size-3.5 text-destructive" aria-label={t('syncResults.detail.removed')} />
                    {name}
                  </Badge>
                ))}
              </span>
            ) : detail.from === null ? (
              // ცარიელი იყო — ძველი მნიშვნელობა არ არსებობს, ჩაიწერა ახალი
              <span className="flex flex-wrap items-start gap-2">
                <Badge className="bg-secondary" data-testid="detail-new">
                  <Plus className="size-3.5 text-[var(--icon-ok)]" />
                  {t('syncResults.detail.new')}
                </Badge>
                <LongText text={detail.to ?? ''} className="flex-1 basis-48" />
              </span>
            ) : (
              <span className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start">
                <LongText text={detail.from} className="text-muted-foreground" />
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={t('syncResults.detail.became')} />
                {detail.to === null ? <span className="text-muted-foreground">{t('syncResults.detail.emptied')}</span> : <LongText text={detail.to} />}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** ერთეულის ბარათი: შედეგი თავისი ფერით, ჩანაწერი და მოდული, რა შეიცვალა ან რატომ არა — და ჩაშლა */
function ItemCard({
  item,
  picked,
  onPick,
  open,
  onOpen,
}: {
  item: SyncRunItem
  picked: boolean
  onPick: (on: boolean) => void
  /** „რა რით შეიცვალა" გაშლილია */
  open: boolean
  onOpen: (on: boolean) => void
}) {
  const { t } = useTranslation()
  const typeName = useTypeName()
  const { icon: Icon, tone, soft } = SYNC_RESULT_LOOK[item.result]
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
    <li data-testid="sync-run-item" data-result={item.result} className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Checkbox checked={picked} onCheckedChange={(on) => onPick(on === true)} aria-label={title} />
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-md', soft)}>
          <Icon className={cn('size-4', tone)} aria-label={t(`syncResults.result.${item.result}`)} />
        </span>
        <span className="min-w-0 flex-1 basis-56">
          <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            <span className="min-w-0 truncate">
              {path ? (
                <Link to={path} className="hover:text-primary" data-testid="sync-run-item-link">
                  {title}
                </Link>
              ) : (
                title
              )}
            </span>
            <Badge className="bg-secondary font-normal">{typeName(item.type)}</Badge>
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
          <Badge size="row" className="bg-secondary" data-testid="sync-run-item-paused">
            <CirclePause className="size-3.5" />
            {t('syncResults.paused')}
          </Badge>
        )}
        {item.details.length > 0 && (
          <Button variant="outline" size="sm" aria-expanded={open} onClick={() => onOpen(!open)} data-testid="sync-run-item-toggle">
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {t('syncResults.detail.show')}
            <CountBadge count={item.details.length} />
          </Button>
        )}
      </div>
      {open && item.details.length > 0 && <ChangeDetails details={item.details} />}
    </li>
  )
}
