import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { FileUp, Play, Upload, X } from 'lucide-react'
import {
  discardImport,
  fetchImportSources,
  planImport,
  type ImportPlan,
  type ImportPlanItem,
  type ImportPlanModule,
} from '@/api/import'
import { errorMessage, isApiCode } from '@/lib/errors'
import { MODULE_ACCENT_FALLBACK, modAccent, useModules } from '@/lib/modules'
import { cn, formatBytes } from '@/lib/utils'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { InfoHint } from '@/components/ui/info-hint'
import { StepSection } from '@/components/ui/step-section'
import { useQueue } from '@/components/ui/queue'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   „ექსპორტ & იმპორტი"-ს იმპორტის ჩანართი.

   **მხოლოდ შენი მონაცემის ფაილები**: Mediary-ის მოდულის JSON/CSV ან „ჩემი
   სრული ექსპორტის" ZIP. ⚠️ Letterboxd/IMDb/Goodreads/Steam-ის ბარათები
   წაიშალა — ის იმპორტი TMDB-ზე და სხვა საიტებზე ეძებდა.

   ⚠️ **დამატება და არა ჩანაცვლება**: ახალი ემატება, არსებული გამოტოვდება —
   გეგმა ამას ჩაწერამდე ამბობს (`/sync`-ისა და `/purge`-ის ფორმა). ჩანაცვლება
   მხოლოდ სუპერადმინს, „ბაზის" ჩანართში, უსაფრთხოების ასლით.

   ⚠️ **ფაილები მხოლოდ ZIP-ით** — ცალკე JSON/CSV ჩანაწერს ატარებს და არა
   პოსტერს; ეს ცხადად ითქმება, რომ „სურათი სად წავიდა" კითხვად არ დარჩეს.

   ⚠️ **CSV-ს ორაზროვნება** (სერიალი · ანიმე — ერთი და იგივე სვეტები):
   სერვერი შესაძლო მოდულებს აბრუნებს და აქ „წაიკითხე, როგორც …" ჩნდება.
   ============================================================ */

export function ImportPanel() {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const { enqueueImport, isBusy } = useQueue()
  const { all: allModules } = useModules()

  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [busy, setBusy] = useState(false)
  /** CSV-ის ორაზროვნება — რომელ მოდულად შეიძლება წავიკითხო */
  const [ambiguous, setAmbiguous] = useState<string[] | null>(null)
  /** რომელი მოდული შემოვა (ნაგულისხმევად — ყველა, სადაც ახალია) */
  const [included, setIncluded] = useState<Set<string>>(new Set())
  /** რომლის რიგები ჩანს ქვემოთ */
  const [open, setOpen] = useState<string | null>(null)

  const { data: sources } = useQuery({
    queryKey: ['import', 'sources'],
    queryFn: fetchImportSources,
    staleTime: 5 * 60_000,
  })

  const moduleName = (key: string | null, fallback?: { name_ka: string | null; name_en: string | null }) => {
    const m = key ? allModules.find((x) => x.key === key) : undefined
    if (m) return i18n.language === 'ka' ? m.name_ka : m.name_en
    const own = i18n.language === 'ka' ? fallback?.name_ka : fallback?.name_en
    return own || key || ''
  }

  const reset = () => {
    setPlan(null)
    setAmbiguous(null)
    setIncluded(new Set())
    setOpen(null)
  }

  const pick = (chosen: File | null) => {
    setFile(chosen)
    reset()
  }

  const build = async (module?: string) => {
    if (!file) return
    setBusy(true)
    try {
      const result = await planImport(file, module)
      setPlan(result)
      setAmbiguous(null)
      const ready = result.modules.filter((m) => m.reason === null && m.counts.new > 0)
      setIncluded(new Set(ready.map((m) => m.source)))
      setOpen(ready[0]?.source ?? result.modules[0]?.source ?? null)
    } catch (e) {
      if (isApiCode(e, 'import_module_ambiguous')) {
        setAmbiguous(modulesOf(e))
        setPlan(null)
      } else {
        toast({ title: errorMessage(e), variant: 'error' })
      }
    } finally {
      setBusy(false)
    }
  }

  const discard = async () => {
    if (plan) await discardImport(plan.token).catch(() => undefined)
    if (fileRef.current) fileRef.current.value = ''
    pick(null)
  }

  const chosen = plan?.modules.filter((m) => included.has(m.source) && m.reason === null) ?? []
  const fresh = chosen.reduce((sum, m) => sum + m.counts.new, 0)

  const run = () => {
    if (!plan) return
    chosen.forEach((m) =>
      enqueueImport(
        plan.token,
        m.source,
        m.module ?? m.source,
        m.items.filter((i) => i.state === 'new'),
      ),
    )
  }

  const totals = (plan?.modules ?? []).reduce(
    (acc, m) => ({
      new: acc.new + m.counts.new,
      duplicate: acc.duplicate + m.counts.duplicate,
      invalid: acc.invalid + m.counts.invalid,
    }),
    { new: 0, duplicate: 0, invalid: 0 },
  )

  const limits = sources?.limits
  const openModule = plan?.modules.find((m) => m.source === open) ?? null

  return (
    <div className="space-y-4">
      {/* ---------- 1. ფაილი ---------- */}
      <StepSection
        step={1}
        title={t('import.stepFile')}
        hint={t('import.stepFileHint')}
        status={
          limits
            ? t('import.limits', { file: formatBytes(limits.file * 1024), archive: formatBytes(limits.archive * 1024) })
            : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv,.zip,application/json,text/csv,application/zip"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" />
            {t('import.choose')}
          </Button>
          <span className="min-w-0 truncate text-sm text-muted-foreground">{file ? file.name : t('import.noFile')}</span>
          <Button type="button" size="sm" disabled={!file || busy} onClick={() => build()}>
            <FileUp className="size-4" />
            {busy ? t('common.loading') : t('import.read')}
          </Button>
        </div>

        {ambiguous && (
          <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm" data-testid="import-ambiguous">
            <p className="mb-3 font-medium">{t('errors.import_module_ambiguous')}</p>
            <div className="flex flex-wrap gap-2">
              {ambiguous.map((key) => (
                <Button key={key} type="button" size="sm" variant="outline" disabled={busy} onClick={() => build(key)}>
                  {t('import.readAs', { module: moduleName(key) })}
                </Button>
              ))}
            </div>
          </div>
        )}
      </StepSection>

      {/* ---------- 2. გეგმა ---------- */}
      {plan && (
        <StepSection
          step={2}
          title={t('import.stepPlan')}
          hint={t('import.stepPlanHint')}
          status={t('import.summary', totals)}
        >
          {plan.kind !== 'zip' && <p className="mb-3 text-xs text-muted-foreground">{t('import.noFiles')}</p>}
          {plan.kind === 'zip' && plan.files > 0 && (
            <p className="mb-3 text-xs text-muted-foreground">{t('import.archiveFiles', { count: plan.files })}</p>
          )}
          {plan.truncated && (
            <p className="mb-3 text-sm text-destructive">{t('import.truncated', { max: plan.max_rows })}</p>
          )}

          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="import-modules">
            {plan.modules.map((m) => (
              <ModuleCard
                key={m.source}
                module={m}
                name={moduleName(m.module ?? m.source, m)}
                icon={allModules.find((x) => x.key === m.module)?.icon ?? null}
                color={allModules.find((x) => x.key === m.module)?.color ?? null}
                included={included.has(m.source)}
                open={open === m.source}
                onInclude={(on) =>
                  setIncluded((cur) => {
                    const next = new Set(cur)
                    if (on) next.add(m.source)
                    else next.delete(m.source)
                    return next
                  })
                }
                onOpen={() => setOpen(m.source)}
              />
            ))}
          </ul>

          {openModule && <Rows items={openModule.items} />}
        </StepSection>
      )}

      {/* ---------- 3. გაშვება ---------- */}
      {plan && (
        <StepSection step={3} title={t('import.stepRun')} hint={t('import.stepRunHint')}>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={isBusy || fresh === 0} onClick={run}>
              <Play className="size-4" />
              {t('import.run', { count: fresh })}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={isBusy} onClick={discard}>
              <X className="size-4" />
              {t('import.discard')}
            </Button>
          </div>
        </StepSection>
      )}
    </div>
  )
}

/** ერთი მოდულის ბარათი — დაემატება · გამოტოვდება · ვერ ჩაიწერება, ან რატომ ვერ შემოვა */
function ModuleCard({
  module: m,
  name,
  icon,
  color,
  included,
  open,
  onInclude,
  onOpen,
}: {
  module: ImportPlanModule
  name: string
  icon: string | null
  color: string | null
  included: boolean
  open: boolean
  onInclude: (on: boolean) => void
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const blocked = m.reason !== null

  return (
    <li
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-card p-4',
        open ? 'border-[var(--mod)]' : 'border-border',
        blocked && 'opacity-60',
      )}
      style={modAccent(color) ?? MODULE_ACCENT_FALLBACK}
      data-module={m.source}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)] [&>svg]:size-5 [&>svg]:text-[var(--mod)]">
          <ModuleIcon name={icon} />
        </span>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <span className="block truncate font-medium">{name}</span>
          <span className="block text-xs text-muted-foreground">{t('import.records', { count: m.total })}</span>
        </button>
        <Checkbox
          checked={included && !blocked}
          disabled={blocked || m.counts.new === 0}
          onCheckedChange={(v) => onInclude(v === true)}
          aria-label={name}
        />
      </div>

      {blocked ? (
        <p className="text-xs text-destructive">{t(`import.reason.${m.reason}`, { name })}</p>
      ) : (
        <dl className="grid grid-cols-3 gap-2 text-center">
          <Count label={t('import.new')} value={m.counts.new} tone="var(--icon-ok)" />
          <Count label={t('import.duplicate')} value={m.counts.duplicate} />
          <Count label={t('import.invalid')} value={m.counts.invalid} />
        </dl>
      )}
    </li>
  )
}

function Count({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums" style={tone ? { color: tone } : undefined}>
        {value}
      </dd>
    </div>
  )
}

/** გეგმის რიგები — „ზუსტად რას ვნახავ" რიცხვის გვერდით */
function Rows({ items }: { items: ImportPlanItem[] }) {
  const { t } = useTranslation()
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, 20)

  if (!items.length) return null

  return (
    <div className="mt-4" data-testid="import-rows">
      <ul className="divide-y divide-border rounded-md border border-border">
        {shown.map((item) => (
          <li key={item.index} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{item.index + 1}</span>
            <span className="min-w-0 flex-1 truncate">
              {item.title || <em className="text-muted-foreground">{t('import.noTitle')}</em>}
              {item.year ? <span className="text-muted-foreground"> ({item.year})</span> : null}
            </span>
            <span className="flex items-center gap-1 text-xs" style={item.state === 'new' ? { color: 'var(--icon-ok)' } : undefined}>
              {t(`import.state.${item.state}`)}
              {item.reason && <InfoHint info={t(`import.why.${item.reason}`)} />}
            </span>
          </li>
        ))}
      </ul>
      {items.length > shown.length && (
        <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setAll(true)}>
          {t('import.showAll', { count: items.length })}
        </Button>
      )}
    </div>
  )
}

/** 422-ის სხეულიდან შესაძლო მოდულები */
function modulesOf(e: unknown): string[] {
  const body = (e as { response?: { data?: { modules?: unknown } } })?.response?.data
  return Array.isArray(body?.modules) ? (body.modules as string[]) : []
}
