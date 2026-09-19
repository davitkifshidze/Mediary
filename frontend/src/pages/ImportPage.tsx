import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { FileUp, Import, Play, Upload } from 'lucide-react'
import {
  fetchImportSources,
  planImport,
  type ImportPlan,
  type ImportPlanItem,
} from '@/api/import'
import { errorMessage, isApiCode } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { StepSection } from '@/components/ui/step-section'
import { useQueue } from '@/components/ui/queue'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   იმპორტი გარე სერვისის CSV-იდან (FEAT-07).

   ⚠️ **ეს „ლინკების ბოტი" არ არის** (2026-09-05-ს სამუდამოდ მოხსნილი):
   იქ აპი თვითონ დაეძებდა ყურების ბმულებს უცხო საიტებზე, აქ კი
   მომხმარებელი საკუთარ ფაილს ტვირთავს — სხვა საიტს არავინ ეკითხება.

   ⚠️ **სამი ბიჯი და არა ერთი ღილაკი**: ფაილი → გეგმა → რიგი. შუა ბიჯი
   სწორედ იმიტომაა, რომ იმპორტი **ქმნის** ჩანაწერებს: „რამდენი ახალი,
   რამდენი უკვე მაქვს" კითხვას ჩაწერამდე უნდა ჰქონდეს პასუხი. იგივე
   ფორმა, რაც `/sync`-სა და `/purge`-ს აქვს.

   ⚠️ **გეგმა გარე წყაროს არ ეკითხება** — 800-რიგიანი ფაილი 800
   TMDB-გამოძახება იქნებოდა მხოლოდ რიცხვის საჩვენებლად. ძებნა რიგშია,
   სადაც `syncDelayMs`-ის პაუზაც მოქმედებს.
   ============================================================ */

export function ImportPage() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { enqueueImport, isBusy } = useQueue()

  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [busy, setBusy] = useState(false)
  /** ფაილის სათაურები, როცა ფორმატი ვერ ვიცანით — ხელით არჩევისთვის */
  const [unknown, setUnknown] = useState<string[] | null>(null)

  const { data: sources } = useQuery({
    queryKey: ['import', 'sources'],
    queryFn: fetchImportSources,
    staleTime: 5 * 60_000,
  })

  const pick = (chosen: File | null) => {
    setFile(chosen)
    setPlan(null)
    setUnknown(null)
  }

  const build = async (forced?: string) => {
    if (!file) return
    setBusy(true)
    try {
      const result = await planImport(file, forced)
      setPlan(result)
      setUnknown(null)
    } catch (e) {
      if (isApiCode(e, 'import_source_unknown')) {
        /* ⚠️ „ფორმატი ვერ ვიცანი" ცარიელი სია **არ არის** — ეკრანზე ის
           „ფაილი ცარიელია"-დ იკითხებოდა და მომხმარებელი სხვა ფაილს
           ეძებდა. სერვერი სათაურებს აბრუნებს, რომ წყარო ხელით აირჩიო. */
        setUnknown(headersOf(e))
        setPlan(null)
      } else {
        toast({ title: errorMessage(e), variant: 'error' })
      }
    } finally {
      setBusy(false)
    }
  }

  const run = () => {
    if (!plan) return
    const fresh = plan.items.filter((i) => i.state === 'new')
    if (fresh.length) enqueueImport(fresh, plan.source)
  }

  const label = (key: string) => sources?.data.find((s) => s.key === key)?.label ?? key

  return (
    <PageContainer>
      <PageHeader tool="import" title={t('import.title')} hint={t('import.hint')} />

      {/* ---------- 1. ფაილი ---------- */}
      <StepSection step={1} title={t('import.stepFile')} hint={t('import.stepFileHint')}>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" />
            {t('import.choose')}
          </Button>
          <span className="text-sm text-muted-foreground">{file ? file.name : t('import.noFile')}</span>
          <Button type="button" disabled={!file || busy} onClick={() => build()}>
            <FileUp className="size-4" />
            {busy ? t('common.loading') : t('import.read')}
          </Button>
        </div>

        {/* ცნობადი ფორმატები — „რა შეიძლება ავტვირთო"-ს პასუხი */}
        <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {(sources?.data ?? []).map((s) => (
            <li key={s.key} className="rounded-md border border-border px-2 py-1">
              {s.label}
            </li>
          ))}
        </ul>

        {unknown && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="mb-2 font-medium">{t('errors.import_source_unknown')}</p>
            <p className="mb-3 text-xs text-muted-foreground">{unknown.join(' · ')}</p>
            <div className="flex flex-wrap gap-2">
              {(sources?.data ?? []).map((s) => (
                <Button key={s.key} type="button" size="sm" variant="outline" onClick={() => build(s.key)}>
                  {s.label}
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
          hint={t('import.stepPlanHint', { source: label(plan.source) })}
        >
          <dl className="grid grid-cols-3 gap-3 text-center">
            <Count label={t('import.new')} value={plan.counts.new} tone="var(--icon-ok)" />
            <Count label={t('import.duplicate')} value={plan.counts.duplicate} />
            <Count label={t('import.invalid')} value={plan.counts.invalid} />
          </dl>

          {plan.truncated && (
            <p className="mt-3 text-sm text-destructive">
              {t('import.truncated', { max: sources?.max_rows ?? 0, total: plan.total })}
            </p>
          )}

          {/* რუკა — რომელი სვეტი რას ნიშნავს; ცნობა ავტომატურია, ჩვენება კი საჭირო */}
          <dl className="mt-4 grid gap-x-6 text-sm sm:grid-cols-2">
            {Object.entries(plan.mapping).map(([field, column]) => (
              <div key={field} className="flex items-center justify-between gap-3 border-b border-border/60 py-1">
                <dt className="text-muted-foreground">{t(`import.field.${field}`)}</dt>
                <dd className="truncate font-medium">{column}</dd>
              </div>
            ))}
          </dl>

          <Rows items={plan.items} />
        </StepSection>
      )}

      {/* ---------- 3. გაშვება ---------- */}
      {plan && (
        <StepSection step={3} title={t('import.stepRun')} hint={t('import.stepRunHint')}>
          <Button type="button" disabled={isBusy || plan.counts.new === 0} onClick={run}>
            <Play className="size-4" />
            {t('import.run', { count: plan.counts.new })}
          </Button>
        </StepSection>
      )}

      {!plan && !file && (
        <EmptyState
          icon={<Import className="size-6" />}
          title={t('import.empty')}
          hint={t('import.emptyHint')}
        />
      )}
    </PageContainer>
  )
}

function Count({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums" style={tone ? { color: tone } : undefined}>
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
    <div className="mt-4">
      <ul className="divide-y divide-border rounded-md border border-border">
        {shown.map((item) => (
          <li key={item.line} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{item.line}</span>
            <span className="min-w-0 flex-1 truncate">
              {item.title || <em className="text-muted-foreground">{t('import.noTitle')}</em>}
              {item.year ? <span className="text-muted-foreground"> ({item.year})</span> : null}
            </span>
            <span
              className="text-xs"
              style={item.state === 'new' ? { color: 'var(--icon-ok)' } : undefined}
            >
              {t(`import.state.${item.state}`)}
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

/** 422-ის სხეულიდან სათაურების ამოღება */
function headersOf(e: unknown): string[] {
  const body = (e as { response?: { data?: { headers?: unknown } } })?.response?.data
  return Array.isArray(body?.headers) ? (body.headers as string[]) : []
}
