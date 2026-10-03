import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { fetchDashboard } from '@/api/dashboard'
import { bulkCustomStatus, fetchCustomRecords } from '@/api/customRecords'
import { mediaApi, type BulkStatusInput } from '@/api/media'
import type { StatusDomainKey } from '@/api/statuses'
import { isCustomModuleKey, type CustomModuleKey } from '@/lib/customModules'
import { movieTitle } from '@/lib/display'
import { mediaKey, type MediaType } from '@/lib/media'
import { moduleName, useModules } from '@/lib/modules'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ModuleIcon } from '@/components/ModuleIcon'
import { IdMultiSelect } from '@/components/MovieMultiSelect'
import { ScopeCard, ScopeGroup } from '@/components/ui/scope-card'
import { VideoBulkPanel } from '@/components/VideoBulkPanel'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'
import { statusName, useStatuses } from '@/lib/statuses'
import { useContentLang } from '@/lib/settings'
import { StatusLabel } from '@/components/StatusBadge'

type Mode = 'by_status' | 'specific'
/**
 * დომენი: მედია-ტიპი, ვიდეოები (ვიდეოს თავისი პანელი აქვს — ტიპი და ტეგებიც)
 * ან (Tasks §37.5) **პირადი მოდული**.
 */
type Domain = MediaType | 'video' | CustomModuleKey

/* ============================================================
   მასობრივი ოპერაციები (Tasks 4).
   ერთი გვერდი ყველა დომენზე — გადამრთველი გვერდზევეა:
   · მედია (ფილმები/სერიალები/ანიმე) → სტატუსის შეცვლა
   · ვიდეოები → სტატუსი, ტიპი და ტეგები (19.9 → §6.4: სტატუსი ვიდეოსაც აქვს)
   ============================================================ */

export function StatusBulkPage() {
  const { t, i18n } = useTranslation()
  const { mediaModules, enabled, customModules } = useModules()

  // ჩართული დომენები; ერთის შემთხვევაში გადამრთველი არ ჩანს
  const domains = useMemo(
    () => [
      ...mediaModules.map((m) => ({ ...m, label: moduleName(m, i18n.language), domain: m.type as Domain })),
      ...enabled
        .filter((m) => m.key === 'video')
        .map((m) => ({ ...m, label: moduleName(m, i18n.language), domain: 'video' as Domain })),
      // §37.5 — პირადი მოდულიც: სტატუსი მისი ლექსიკონიდან, ჩანაწერები — მისი ცხრილიდან
      ...customModules.map((m) => ({ ...m, label: moduleName(m, i18n.language), domain: m.key as Domain })),
    ],
    [mediaModules, enabled, customModules, i18n.language],
  )

  /* ⚠️ **რიცხვი დეშბორდის იმავე endpoint-იდან მოდის და არა ცალკე დათვლიდან**:
     ბარათს რიცხვი სჭირდება (თორემ იგივე უფერო პილულაა), ჩამონათვალი კი
     მხოლოდ **აქტიური** დომენისთვის იტვირთება — ე.ი. დანარჩენ სამ ბარათს
     საკუთარი წყარო არ აქვს. `GET /dashboard` ერთი მოკლე რექვესთია და
     დეშბორდიდან ისედაც ქეშშია. */
  const { data: cards } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })
  const countOf = (key: string) => cards?.find((c) => c.key === key)?.count ?? undefined

  const [domain, setDomain] = useState<Domain>(domains[0]?.domain ?? 'movie')
  // მოდულების ჩატვირთვამდე `domains` ცარიელია — პირველივე ხელმისაწვდომზე გადავდივართ
  const active = domains.some((d) => d.domain === domain) ? domain : (domains[0]?.domain ?? domain)

  return (
    <PageContainer>
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('actions.back')}
      </Link>

      <PageHeader
        tool="bulk"
        title={t('bulkStatus.title')}
        hint={
          <InfoHint
            info={t(
              active === 'video'
                ? 'bulkVideo.subtitle'
                : isCustomModuleKey(active)
                  ? 'bulkStatus.subtitleRecords'
                  : mediaKey('bulkStatus.subtitle', active),
            )}
          />
        }
      />

      {/* ---------- დომენის არჩევა — ყველა ჩართული მოდული ერთ გვერდზეა (Tasks 4) ----------
          ⚠️ **ბარათები აუდიტ-ლოგის იმავე კომპონენტისაა** (`ui/scope-card.tsx`,
          შენი მითითება 2026-09-15): ერთნაირი ჩარჩოიანი ღილაკები მხოლოდ
          წარწერით განსხვავდებოდნენ, ე.ი. „რომელ ბიბლიოთეკაში ვცვლი სტატუსს"
          წაკითხვას მოითხოვდა. ფერი და ხატულა **მოდულის საკუთარია**
          (`modules.color`) — იგივე, რასაც საიდბარი და გვერდის ჰედერი ხატავს. */}
      {domains.length > 1 && (
        <div className="mb-5">
          <ScopeGroup>
            {domains.map((d) => (
              <ScopeCard
                key={d.key}
                active={active === d.domain}
                color={d.color}
                icon={<ModuleIcon name={d.icon} className="size-4 text-[var(--mod)]" />}
                label={d.label}
                count={countOf(d.key)}
                onClick={() => setDomain(d.domain)}
              />
            ))}
          </ScopeGroup>
        </div>
      )}

      {active === 'video' ? (
        <VideoBulkPanel />
      ) : isCustomModuleKey(active) ? (
        <CustomBulkPanel moduleKey={active} key={active} />
      ) : (
        <MediaBulkPanel type={active} key={active} />
      )}
    </PageContainer>
  )
}

/** ერთი ჩანაწერი ამრჩევისთვის — სახელი ეკრანის ენაზე და მისი სტატუსი */
interface BulkItem {
  id: number
  label: string
  statusId: number | null
  statusKey: string | null
}

/** სტატუსის მასობრივი შეცვლა — ფილმები, სერიალები, ანიმე */
function MediaBulkPanel({ type }: { type: MediaType }) {
  const { i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const api = mediaApi(type)

  // ⚠️ `all` — მასობრივი სტატუსი მთელ სიაზე მოქმედებს
  const moviesQ = useQuery({ queryKey: [type, 'bulk'], queryFn: () => api.list({ all: true }).then((p) => p.items) })
  const items = useMemo(
    () =>
      (moviesQ.data ?? []).map((m) => {
        const title = movieTitle(m, lang)
        return { id: m.id, label: m.year ? `${title} (${m.year})` : title, statusId: m.status?.id ?? null, statusKey: m.status?.key ?? null }
      }),
    [moviesQ.data, lang],
  )

  return (
    <BulkStatusPanel
      domain={type}
      items={items}
      loading={moviesQ.isLoading}
      apply={api.bulkStatus}
      onApplied={() => {
        qc.invalidateQueries({ queryKey: [type] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
      }}
      text={(base) => mediaKey(base, type)}
    />
  )
}

/**
 * პირადი მოდულის ტექსტები — „ჩანაწერებს" ამბობს და არა „ფილმებს".
 * ⚠️ გასაღებები **ცხადადაა** და არა `${base}Records`-ით აწყობილი: i18n-ის
 * აუდიტი ლიტერალს ხედავს, შაბლონს — არა, ე.ი. აწყობილი გასაღები „გამოუყენებლად"
 * ჩაითვლებოდა.
 */
const RECORD_TEXT: Record<string, string> = {
  'bulkStatus.whichLabel': 'bulkStatus.whichLabelRecords',
  'bulkStatus.modeSpecific': 'bulkStatus.modeSpecificRecords',
  'bulkStatus.moviesPick': 'bulkStatus.moviesPickRecords',
  'bulkStatus.affected': 'bulkStatus.affectedRecords',
  'bulkStatus.confirmDesc': 'bulkStatus.confirmDescRecords',
  'bulkStatus.done': 'bulkStatus.doneRecords',
}

/**
 * **პირადი მოდული (Tasks §37.5)** — იგივე პანელი, თავისი წყაროთი.
 * ⚠️ ტექსტი „ჩანაწერებს" ამბობს (`…Records`) — „ფილმები" აქ ტყუილი იქნებოდა.
 */
function CustomBulkPanel({ moduleKey }: { moduleKey: CustomModuleKey }) {
  const qc = useQueryClient()

  const recordsQ = useQuery({
    queryKey: ['custom-records', moduleKey, 'bulk'],
    queryFn: () => fetchCustomRecords(moduleKey, { all: true }).then((p) => p.items),
  })
  const items = useMemo(
    () =>
      (recordsQ.data ?? []).map((r) => ({
        id: r.id,
        label: r.title,
        statusId: r.status?.id ?? null,
        statusKey: r.status?.key ?? null,
      })),
    [recordsQ.data],
  )

  return (
    <BulkStatusPanel
      domain={moduleKey}
      items={items}
      loading={recordsQ.isLoading}
      apply={(input) => bulkCustomStatus(moduleKey, input)}
      onApplied={() => {
        qc.invalidateQueries({ queryKey: ['custom-records', moduleKey] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
      }}
      text={(base) => RECORD_TEXT[base] ?? base}
    />
  )
}

/**
 * **ერთი სხეული ყველა დომენზე** — „რომლებს" (ერთი სტატუსის ყველა ან კონკრეტულები)
 * და „რა გახდეს". ⚠️ ტექსტის გასაღებს გამომძახებელი არჩევს (`text`): მედიაზე
 * `mediaKey()`, პირად მოდულზე `…Records` — ერთი პანელი, სწორი სიტყვით.
 */
function BulkStatusPanel({
  domain,
  items,
  loading,
  apply: send,
  onApplied,
  text,
}: {
  domain: StatusDomainKey
  items: BulkItem[]
  loading: boolean
  apply: (input: BulkStatusInput) => Promise<number>
  onApplied: () => void
  text: (base: string) => string
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  // §6.4 — სია ლექსიკონიდან; ორივე გადამრჩევი (საიდან/სად) იმავეს ხატავს
  const { data: statuses = [] } = useStatuses(domain)
  const { toast } = useToast()
  const confirm = useConfirm()

  const [mode, setMode] = useState<Mode>('by_status')
  const [fromStatus, setFromStatus] = useState('')
  const [ids, setIds] = useState<number[]>([])
  const [target, setTarget] = useState('')

  const affectedCount =
    mode === 'by_status'
      ? fromStatus
        ? items.filter((m) => m.statusKey === fromStatus).length
        : 0
      : ids.length

  const canApply =
    !!target &&
    ((mode === 'by_status' && !!fromStatus && affectedCount > 0) ||
      (mode === 'specific' && ids.length > 0))

  const mut = useMutation({
    mutationFn: () =>
      send(
        mode === 'by_status'
          ? { status: target, from_status: fromStatus }
          : { status: target, ids },
      ),
    onSuccess: (updated) => {
      onApplied()
      toast({ title: t(text('bulkStatus.done'), { count: updated }), variant: 'success' })
      setIds([])
      setFromStatus('')
      setTarget('')
    },
    onError: () => toast({ title: t('toast.error'), variant: 'error' }),
  })

  const apply = async () => {
    if (!canApply) return
    const ok = await confirm({
      title: t('bulkStatus.confirmTitle'),
      /* §9.7 — ⚠️ ტექსტები სიტყვასიტყვით „ფილმს" ამბობდა იმ პანელზე,
         რომელიც სერიალსაც და ანიმესაც ემსახურება. `mediaKey()` სწორედ
         ამისთვის არსებობს (`lib/media.ts`). */
      description: t(text('bulkStatus.confirmDesc'), {
        count: affectedCount,
        status: statusName(statuses.find((s) => s.key === target), lang),
      }),
      confirmText: t('confirm.confirm'),
      cancelText: t('confirm.cancel'),
    })
    if (ok) mut.mutate()
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-5">
      {/* რას ვცვლით */}
      <div>
        <Label className="mb-2 block">{t(text('bulkStatus.whichLabel'))}</Label>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-3">
          <div
            className={cn(
              'rounded-lg border p-3 transition-colors',
              mode === 'by_status' ? 'border-primary bg-secondary/50' : 'border-border',
            )}
          >
            <label className="flex cursor-pointer items-center gap-3">
              <RadioGroupItem value="by_status" />
              <span className="text-sm font-medium">{t('bulkStatus.modeByStatus')}</span>
            </label>
            {mode === 'by_status' && (
              <div className="mt-3 pl-8">
                <Select value={fromStatus} onValueChange={setFromStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('bulkStatus.fromStatusPick')} />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s.id} value={s.key}>
                        {statusName(s, lang)} ({items.filter((m) => m.statusId === s.id).length})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div
            className={cn(
              'rounded-lg border p-3 transition-colors',
              mode === 'specific' ? 'border-primary bg-secondary/50' : 'border-border',
            )}
          >
            <label className="flex cursor-pointer items-center gap-3">
              <RadioGroupItem value="specific" />
              <span className="text-sm font-medium">{t(text('bulkStatus.modeSpecific'))}</span>
            </label>
            {mode === 'specific' && (
              <div className="mt-3 pl-8">
                <IdMultiSelect
                  items={items}
                  value={ids}
                  onChange={setIds}
                  placeholder={loading ? t('api.loading') : t(text('bulkStatus.moviesPick'))}
                />
              </div>
            )}
          </div>
        </RadioGroup>
      </div>

      {/* ახალი სტატუსი */}
      <div>
        <Label className="mb-2 block">{t('bulkStatus.targetLabel')}</Label>
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger>
            <SelectValue placeholder={t('bulkStatus.targetPick')} />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.key}>
                <StatusLabel status={s} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-sm text-muted-foreground">
          {t(text('bulkStatus.affected'), { count: affectedCount })}
        </span>
        <Button onClick={apply} disabled={!canApply || mut.isPending}>
          {mut.isPending ? t('actions.saving') : t('bulkStatus.apply')}
        </Button>
      </div>
    </div>
  )
}
