import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'
import type { SerpEngine, SerpQuota } from '@/api/web'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldHint } from '@/components/ui/field-label'
import { cn } from '@/lib/utils'

/* ============================================================
   წყაროს არჩევა ვებძებნისთვის (Tasks §7.6.4).

   ⚠️ **ერთი კომპონენტი ორივე ადგილისთვის** (სურათი და ვიდეო) — §2-ის წესი.
   არჩევანი სამივე ფორმაშია, როგორც თასქშია: ერთი წყარო · რამდენიმე
   მონიშნული · „ყველა ერთად".

   ⚠️ **უფასო წყარო ხარჯში არ ითვლება** და ტეგითაც ასეა მონიშნული: სწორედ
   ეს განსხვავება წყვეტს, დააჭერ თუ არა „ყველა ერთად"-ს. სია **უფასოთი
   იწყება** (რიგი backend-ისაა) — ე.ი. ნაგულისხმევი არჩევანი ბიუჯეტს არ ეხება.

   ⚠️ **საკუთარი ჩარჩო აღარ აქვს** (ეტაპი 5, 2026-09-13) — ბლოკი ახლა
   `StepSection`-ის შიგნით დგას („სად ვეძებთ") და ორი ერთმანეთში ჩალაგებული
   ბორდერი სწორედ ის ვიზუალია, რომელზეც შენიშვნა იყო.

   ## Tasks §19.2 — ფასი სათაურის ზოლშია
   „დაიხარჯება N · დარჩენილია M" ამ ბლოკის ბოლოს იდგა, ე.ი. შედეგების
   გადახვევისას ქრებოდა — ფასი კი სწორედ ძებნის ღილაკზე დაჭერისას უნდა
   ჩანდეს. ის ახლა `WebSearchCost`-ია და მოდალის მიმაგრებულ სათაურში დგას.
   ============================================================ */

export function WebSourcePicker({
  engines,
  selected,
  onChange,
  disabled,
}: {
  engines: SerpEngine[]
  selected: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()

  const toggle = (key: string) => {
    // ⚠️ ბოლო წყაროს მოხსნა არ შეიძლება — ცარიელი არჩევანი backend-ზე
    // ნაგულისხმევზე გადადიოდა, ე.ი. ღილაკი „ვეძებ ვერსად"-ს დაპირდებოდა
    // და მაინც დახარჯავდა ერთ ძებნას.
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
    onChange(next.length ? next : [key])
  }

  const all = engines.map((e) => e.key)
  const allSelected = all.length > 0 && all.every((k) => selected.includes(k))

  return (
    <div className="flex flex-wrap items-center gap-2">
      {engines.map((engine) => {
        const on = selected.includes(engine.key)

        return (
          <label
            key={engine.key}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors',
              on ? 'border-primary bg-secondary' : 'border-border hover:border-primary/40',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <Checkbox checked={on} onCheckedChange={() => toggle(engine.key)} disabled={disabled} />
            {engine.name}
            {engine.free && (
              <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                {t('web.free')}
              </span>
            )}
            {/* ცენზურის გამორთვა მხოლოდ Google-ის engine-ებს აქვს — სხვაგან
                ტეგი ისე მუშაობს, როგორც თვითონ წყარო გადაწყვეტს */}
            {!engine.safe_search && <FieldHint hint={t(engine.free ? 'web.freeHint' : 'web.noSafeToggle')} />}
          </label>
        )
      })}

      {/* ⚠️ ერთ წყაროზე „ყველა ერთად" არაფერს ნიშნავს — ღილაკი მაშინ არ იხატება */}
      {engines.length > 1 && (
        <Button
          type="button"
          size="sm"
          variant={allSelected ? 'secondary' : 'ghost'}
          className="ml-auto"
          disabled={disabled}
          onClick={() => onChange(allSelected ? [all[0]] : all)}
        >
          {allSelected ? t('web.onlyFirst') : t('web.allTogether')}
        </Button>
      )}
    </div>
  )
}

/* ============================================================
   **ხარჯი — ფანჯრის სათაურის ზოლში** (Tasks §19.2).

   შენი მოთხოვნა: „„სად ვეძებთ“-ში „დაიხარჯება… დარჩენილია“ ქვემოთაა — ჯობს
   ზედა თავზე იყოს, სათაურთან ერთად".

   ⚠️ **ორი ბიუჯეტი, ორი ნიშანი.** SerpApi-ის თვიური 250 („დაიხარჯება N ·
   დარჩენილია M") და Serper-ის საკუთარი credit-ები — ცალ-ცალკე. ადრე ხარჯში
   Serper-იც ითვლებოდა (`!free`), ე.ი. „დარჩენილის" გვერდით რიცხვი ზედმეტს
   აჩვენებდა: Serper იმ 250-ს საერთოდ არ ეხება.

   ⚠️ **SerpApi-ისა `uses_quota`-ით ითვლება და არა `!free`-ით** — სერვერი
   სამივე კატეგორიას თვითონ ამბობს.

   ⚠️ **Serper-ის რიცხვი ჭერია** („≤"): ცარიელ გვერდზე ძებნა ჩერდება, ე.ი.
   ფაქტობრივი ხარჯი შეიძლება ნაკლები იყოს — მეტი კი ვერასდროს.

   ⚠️ **უფასო წყაროზე არაფერი იხატება** — „დაიხარჯება 0" ცრუ განგაშია.
   ============================================================ */

export function WebSearchCost({
  engines,
  selected,
  quota,
  credits = 0,
}: {
  engines: SerpEngine[]
  selected: string[]
  quota: SerpQuota | null
  /** Serper-ის (საკუთარი ანგარიშსწორების) credit-ების ჭერი ამ ძებნაზე */
  credits?: number
}) {
  const { t } = useTranslation()

  const searches = engines.filter((e) => selected.includes(e.key) && e.uses_quota).length
  const remaining = quota?.remaining ?? null

  if (searches === 0 && credits === 0) return null

  // ⚠️ ბიუჯეტი ამ ძებნას ვეღარ ფარავს → წითელი; ცოტაღაა დარჩენილი → ყვითელი
  const short = remaining != null && remaining < searches
  const low = remaining != null && !short && remaining <= 10

  return (
    <>
      {searches > 0 && (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs tabular-nums',
            short
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : low
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'border-border bg-muted/40 text-muted-foreground',
          )}
        >
          <Coins className="size-3.5 shrink-0" />
          {t('web.costSerpApi', { count: searches })}
          {remaining != null && ` · ${t('web.remaining', { count: remaining })}`}
        </span>
      )}
      {credits > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs tabular-nums text-muted-foreground">
          <Coins className="size-3.5 shrink-0" />
          {t('web.costSerper', { count: credits })}
        </span>
      )}
    </>
  )
}
