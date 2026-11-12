import { useTranslation } from 'react-i18next'
import { Check, CheckCheck, Coins, Gift, KeyRound, X } from 'lucide-react'
import type { SerpEngine, SerpQuota } from '@/api/web'
import { Button } from '@/components/ui/button'
import { FieldHint } from '@/components/ui/field-label'
import { cn } from '@/lib/utils'

/* ============================================================
   წყაროს არჩევა ვებძებნისთვის — **ბარათებად**.

   ⚠️ **ერთი კომპონენტი ორივე ადგილისთვის** (სურათი და ვიდეო).

   ⚠️ **ბარათი ამბობს ფასს**: აიქონი და წარწერა წყაროს კატეგორიისაა — უფასო (Wikimedia) ·
   საკუთარი გასაღები (Serper, თავისი კრედიტებით) · SerpApi (თვიური ბიუჯეტი, „დარჩენილია N").
   სწორედ ეს განსხვავება წყვეტს, მონიშნავ თუ არა კიდევ ერთ წყაროს. სია **უფასოთი იწყება**
   (რიგი backend-ისაა) — ე.ი. ნაგულისხმევი არჩევანი ბიუჯეტს არ ეხება.

   ⚠️ **თავიდან ერთი (პირველი) წყაროა მონიშნული**; გვერდით ორი ღილაკია — „ყველას მონიშვნა" და
   „გასუფთავება", რომელიც პირველს ტოვებს: ცარიელი არჩევანი backend-ზე ნაგულისხმევზე გადადიოდა,
   ე.ი. ღილაკი „ვეძებ ვერსად"-ს დაპირდებოდა და მაინც დახარჯავდა ერთ ძებნას. იმავე მიზეზით
   ბოლო მონიშნული ბარათი არ იხსნება.

   ⚠️ **მინიშნების `i` ბარათის გვერდით დგას და არა შიგნით** — ბარათი ღილაკია, ღილაკში ღილაკი
   კი არასწორი HTML-ია.

   ⚠️ **საკუთარი ჩარჩო არ აქვს** — ბლოკი `StepSection`-ის შიგნით დგას („სად ვეძებთ").

   ## ფასი სათაურის ზოლშია
   „დაიხარჯება N · დარჩენილია M" `WebSearchCost`-ია და მოდალის მიმაგრებულ სათაურში დგას —
   ფასი ძებნის ღილაკზე დაჭერისას უნდა ჩანდეს და არა შედეგების გადახვევისას ქრებოდეს.
   ============================================================ */

/** წყაროს კატეგორია — აიქონი და ფასის წარწერა */
function engineKind(engine: SerpEngine): 'free' | 'quota' | 'own' {
  return engine.free ? 'free' : engine.uses_quota ? 'quota' : 'own'
}

const KIND_ICON = { free: Gift, quota: Coins, own: KeyRound } as const

export function WebSourcePicker({
  engines,
  selected,
  onChange,
  disabled,
  quota,
}: {
  engines: SerpEngine[]
  selected: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  /** SerpApi-ის თვიური ბიუჯეტი — ბარათზე „დარჩენილია N" */
  quota?: SerpQuota | null
}) {
  const { t } = useTranslation()

  const toggle = (key: string) => {
    // ⚠️ ბოლო წყაროს მოხსნა არ შეიძლება (იხ. ზემოთ)
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
    onChange(next.length ? next : [key])
  }

  const all = engines.map((e) => e.key)
  const allSelected = all.length > 0 && all.every((k) => selected.includes(k))
  /** მხოლოდ პირველია მონიშნული — გასასუფთავებელი არაფერია */
  const onlyFirst = selected.length === 1 && selected[0] === all[0]

  return (
    <div>
      {/* ⚠️ ერთ წყაროზე ორივე ღილაკი უაზროა — მაშინ არ იხატება */}
      {engines.length > 1 && (
        <div className="mb-2.5 flex flex-wrap items-center justify-end gap-2">
          <Button type="button" size="sm" variant="outline" disabled={disabled || allSelected} onClick={() => onChange(all)} data-testid="sources-all">
            <CheckCheck className="size-4" />
            {t('web.selectAllSources')}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled || onlyFirst} onClick={() => onChange([all[0]])} data-testid="sources-clear">
            <X className="size-4" />
            {t('actions.clear')}
          </Button>
        </div>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" data-testid="web-sources">
        {engines.map((engine) => {
          const on = selected.includes(engine.key)
          const kind = engineKind(engine)
          const Icon = KIND_ICON[kind]
          // ცენზურის გამორთვა მხოლოდ Google-ის engine-ებს აქვს — სხვაგან წყარო თვითონ წყვეტს
          const hint = engine.safe_search ? null : t(engine.free ? 'web.freeHint' : 'web.noSafeToggle')

          return (
            <div key={engine.key} className="relative">
              <button
                data-kind="card"
                data-source={engine.key}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggle(engine.key)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  hint && 'pr-9',
                  on ? 'border-primary bg-secondary/60' : 'border-border hover:border-primary/40 hover:bg-muted/50',
                )}
              >
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-md',
                    kind === 'free' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-primary/10 text-primary',
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{engine.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {kind === 'free' ? t('web.sourceFree') : kind === 'own' ? t('web.sourceOwnKey') : t('web.sourceCredit')}
                    {/* დარჩენილი ბიუჯეტი მხოლოდ SerpApi-ის წყაროზე — Serper იმ ბიუჯეტს არ ეხება */}
                    {kind === 'quota' && quota?.remaining != null && ` · ${t('web.remaining', { count: quota.remaining })}`}
                  </span>
                </span>
                {on && <Check className="size-4 shrink-0 text-primary" />}
              </button>
              {hint && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <FieldHint hint={hint} />
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================
   **ხარჯი — ფანჯრის სათაურის ზოლში**.

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
