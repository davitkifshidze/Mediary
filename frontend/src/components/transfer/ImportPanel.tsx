import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, CircleSlash, Clapperboard, FileUp, Film, Gamepad2, Play, Upload } from 'lucide-react'
import {
  IMPORT_SOURCES,
  fetchImportSources,
  planImport,
  type ImportPlan,
  type ImportPlanItem,
  type ImportSourceKey,
} from '@/api/import'
import { errorMessage, isApiCode } from '@/lib/errors'
import { modAccent, useModules } from '@/lib/modules'
import type { CutStyle } from '@/lib/cutStyle'
import { Button } from '@/components/ui/button'
import { CutTabs, type CutOption } from '@/components/ui/cut-tabs'
import { StepSection } from '@/components/ui/step-section'
import { useQueue } from '@/components/ui/queue'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   „ექსპორტ & იმპორტი"-ს იმპორტის ჩანართი (Tasks §31 ← FEAT-07).

   ⚠️ **ეს „ლინკების ბოტი" არ არის** (2026-09-05-ს სამუდამოდ მოხსნილი):
   იქ აპი თვითონ დაეძებდა ყურების ბმულებს უცხო საიტებზე, აქ კი
   მომხმარებელი საკუთარ ფაილს ტვირთავს — სხვა საიტს არავინ ეკითხება.

   ⚠️ **წყაროს ბარათი მიმართულებაა და არა ბრძანება.** აირჩევ — გეტყვი,
   როგორ მიიღო ფაილი იმ სერვისიდან. ფაილს მაინც **სერვერი ცნობს**
   სვეტებით: არჩეული ბარათი რომ „ძალით" გაგვეგზავნა, Letterboxd-ის ფაილი
   IMDb-ის რუკით წაიკითხებოდა და ყველა რიგი „გაუმართავი" გამოვიდოდა.
   ამიტომ წყარო ძალით მხოლოდ მაშინ მიდის, როცა ფორმატი ვერ ვიცანით და
   შენ ცხადად თქვი „წაიკითხე როგორც …". ამოცნობის შემდეგ ბარათი
   ამოცნობილზე გადადის, ხოლო სხვაობა ხმამაღლა ითქმება.

   ⚠️ **ნაბიჯები ფაილი → გეგმა → გაშვებაა და არა ერთი ღილაკი**: იმპორტი
   **ქმნის** ჩანაწერებს, ე.ი. „რამდენი ახალი, რამდენი უკვე მაქვს"
   კითხვას ჩაწერამდე უნდა ჰქონდეს პასუხი (`/sync`-ისა და `/purge`-ის ფორმა).

   ⚠️ **გეგმა გარე წყაროს არ ეკითხება** — 800-რიგიანი ფაილი 800
   TMDB-გამოძახება იქნებოდა მხოლოდ რიცხვის საჩვენებლად. ძებნა რიგშია,
   სადაც `syncDelayMs`-ის პაუზაც მოქმედებს.
   ============================================================ */

/**
 * წყაროს ფერი და ხატულა — ფერები `index.css`-შია, ორივე თემაზე (`--import-*`).
 *
 * ⚠️ **`satisfies` ახალ წყაროს ფერის გარეშე ვერ გაატარებს**: `IMPORT_SOURCES`
 * backend-ის სარკეა (`RegistryConsistencyTest`), ე.ი. ახალი წყარო ჯერ იქ
 * გამოჩნდება და მერე აქ `tsc` მოითხოვს მის ბარათს.
 */
const SOURCE_STYLE = {
  letterboxd: { icon: Clapperboard, color: 'var(--import-letterboxd)' },
  imdb: { icon: Film, color: 'var(--import-imdb)' },
  goodreads: { icon: BookOpen, color: 'var(--import-goodreads)' },
  steam: { icon: Gamepad2, color: 'var(--import-steam)' },
} satisfies Record<ImportSourceKey, CutStyle>

function isKnownSource(key: string): key is ImportSourceKey {
  return (IMPORT_SOURCES as readonly string[]).includes(key)
}

/** უცნობი წყარო (სერვერი SPA-ზე წინ წავიდა) ნეიტრალურად იხატება და არ ქრება */
function sourceStyle(key: string): CutStyle {
  return isKnownSource(key) ? SOURCE_STYLE[key] : { icon: CircleSlash, color: 'var(--muted-foreground)' }
}

export function ImportPanel() {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const { enqueueImport, isBusy } = useQueue()
  const { all: allModules, has } = useModules()

  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [busy, setBusy] = useState(false)
  /** არჩეული წყაროს ბარათი — მხოლოდ მიმართულება, ფაილს სერვერი ცნობს */
  const [chosen, setChosen] = useState<string | null>(null)
  /** ფაილი სხვა წყაროსი აღმოჩნდა, ვიდრე ბარათზე ეწერა */
  const [mismatch, setMismatch] = useState<{ chosen: string; detected: string } | null>(null)
  /** ფაილის სათაურები, როცა ფორმატი ვერ ვიცანით — ხელით არჩევისთვის */
  const [unknown, setUnknown] = useState<string[] | null>(null)

  const { data: sources } = useQuery({
    queryKey: ['import', 'sources'],
    queryFn: fetchImportSources,
    staleTime: 5 * 60_000,
  })

  const label = (key: string) => sources?.data.find((s) => s.key === key)?.label ?? key

  const moduleName = (key: string) => {
    const m = allModules.find((x) => x.key === key)
    if (!m) return key
    return i18n.language === 'ka' ? m.name_ka : m.name_en
  }

  const pick = (chosenFile: File | null) => {
    setFile(chosenFile)
    setPlan(null)
    setUnknown(null)
    setMismatch(null)
  }

  const build = async (forced?: string) => {
    if (!file) return
    setBusy(true)
    try {
      const result = await planImport(file, forced)
      setPlan(result)
      setUnknown(null)
      /* ⚠️ ბარათი ამოცნობილზე გადადის — სხვაგვარად ეკრანზე ერთი წყარო
         იქნებოდა მონიშნული და გეგმა მეორით წაკითხული */
      setMismatch(!forced && chosen && chosen !== result.source ? { chosen, detected: result.source } : null)
      setChosen(result.source)
    } catch (e) {
      if (isApiCode(e, 'import_source_unknown')) {
        /* ⚠️ „ფორმატი ვერ ვიცანი" ცარიელი სია **არ არის** — ეკრანზე ის
           „ფაილი ცარიელია"-დ იკითხებოდა და მომხმარებელი სხვა ფაილს
           ეძებდა. სერვერი სათაურებს აბრუნებს, რომ წყარო ხელით აირჩიო. */
        setUnknown(headersOf(e))
        setPlan(null)
        setMismatch(null)
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

  /* ⚠️ ჩაურთველ მოდულზე ბარათი გამორთულია და ამბობს რატომ — სერვერი
     გეგმას მაინც 403-ით უპასუხებდა, ოღონდ ფაილის არჩევის შემდეგ */
  const options: CutOption[] = (sources?.data ?? []).map((s) => {
    const style = sourceStyle(s.key)
    const enabled = has(s.module)
    return {
      key: s.key,
      label: s.label,
      icon: style.icon,
      color: style.color,
      hint: enabled ? moduleName(s.module) : t('transfer.moduleOff', { module: moduleName(s.module) }),
      disabled: !enabled,
    }
  })

  const guide = chosen && isKnownSource(chosen) ? chosen : null
  const GuideIcon = guide ? SOURCE_STYLE[guide].icon : null

  return (
    <div className="space-y-4">
      {/* ---------- 1. წყარო ---------- */}
      <StepSection step={1} title={t('transfer.stepSource')} hint={t('transfer.stepSourceHint')}>
        <CutTabs
          layout="inline"
          value={chosen ?? ''}
          // აქტიურზე მეორე დაჭერა არჩევანს მოხსნის — ჭრილის ბარათების წესი
          onChange={(key) => setChosen((current) => (current === key ? null : key))}
          options={options}
        />

        {guide && GuideIcon && (
          <div
            className="mt-3 rounded-xl border border-[var(--mod)] bg-[var(--mod-soft)] p-4 text-sm"
            style={modAccent(SOURCE_STYLE[guide].color)}
          >
            <p className="mb-1 flex items-center gap-2 font-medium">
              <GuideIcon className="size-4 text-[var(--mod)]" />
              {t('transfer.howTitle', { source: label(guide) })}
            </p>
            <p className="leading-relaxed text-muted-foreground">{t(`transfer.how.${guide}`)}</p>
          </div>
        )}
      </StepSection>

      {/* ---------- 2. ფაილი ---------- */}
      <StepSection step={2} title={t('import.stepFile')} hint={t('import.stepFileHint')}>
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

        {unknown && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="mb-2 font-medium">{t('errors.import_source_unknown')}</p>
            <p className="mb-3 text-xs text-muted-foreground">{unknown.join(' · ')}</p>
            <div className="flex flex-wrap gap-2">
              {(sources?.data ?? []).map((s) => {
                const Icon = sourceStyle(s.key).icon
                return (
                  <Button
                    key={s.key}
                    type="button"
                    size="sm"
                    // ბარათზე არჩეული წყარო — ის, რაც თვითონ თქვი, რომ ფაილია
                    variant={chosen === s.key ? 'default' : 'outline'}
                    disabled={busy || !has(s.module)}
                    onClick={() => build(s.key)}
                  >
                    <Icon className="size-4" />
                    {t('transfer.readAs', { source: s.label })}
                  </Button>
                )
              })}
            </div>
          </div>
        )}
      </StepSection>

      {/* ---------- 3. გეგმა ---------- */}
      {plan && (
        <StepSection
          step={3}
          title={t('import.stepPlan')}
          hint={t('import.stepPlanHint', { source: label(plan.source) })}
        >
          {mismatch && (
            <p className="mb-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
              {t('transfer.detectedOther', { detected: label(mismatch.detected), chosen: label(mismatch.chosen) })}
            </p>
          )}

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

      {/* ---------- 4. გაშვება ---------- */}
      {plan && (
        <StepSection step={4} title={t('import.stepRun')} hint={t('import.stepRunHint')}>
          <Button type="button" disabled={isBusy || plan.counts.new === 0} onClick={run}>
            <Play className="size-4" />
            {t('import.run', { count: plan.counts.new })}
          </Button>
        </StepSection>
      )}
    </div>
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
