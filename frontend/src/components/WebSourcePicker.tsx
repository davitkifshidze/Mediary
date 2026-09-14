import { useTranslation } from 'react-i18next'
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

   ⚠️ **ყოველი მონიშნული წყარო +1 ძებნაა** და სწორედ აქ ქრება კვოტა
   შეუმჩნევლად. ამიტომ ფასი **ღილაკის გვერდით ცხადად წერია** („დაიხარჯება N,
   დარჩენილია M") და არა დახმარების ტექსტში.

   ⚠️ **უფასო წყარო ხარჯში არ ითვლება** და ტეგითაც ასეა მონიშნული: სწორედ
   ეს განსხვავება წყვეტს, დააჭერ თუ არა „ყველა ერთად"-ს. სია **უფასოთი
   იწყება** (რიგი backend-ისაა) — ე.ი. ნაგულისხმევი არჩევანი ბიუჯეტს არ ეხება.

   ⚠️ **საკუთარი ჩარჩო აღარ აქვს** (ეტაპი 5, 2026-09-13) — ბლოკი ახლა
   `StepSection`-ის შიგნით დგას („სად ვეძებთ") და ორი ერთმანეთში ჩალაგებული
   ბორდერი სწორედ ის ვიზუალია, რომელზეც შენიშვნა იყო. სათაურსაც ნაბიჯი
   ატარებს, ე.ი. აქ მხოლოდ არჩევანი და ფასი რჩება.
   ============================================================ */

export function WebSourcePicker({
  engines,
  selected,
  onChange,
  quota,
  disabled,
}: {
  engines: SerpEngine[]
  selected: string[]
  onChange: (next: string[]) => void
  quota: SerpQuota | null
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
  // ⚠️ ფასი მხოლოდ **ფასიან** წყაროებს ეთვლება — უფასოს ჩათვლა მომხმარებელს
  // ტყუილად შეაშინებდა და „ყველა ერთად"-ს გაუმართლებლად ძვირად აჩვენებდა
  const cost = engines.filter((e) => selected.includes(e.key) && !e.free).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
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
              <Checkbox
                checked={on}
                onCheckedChange={() => toggle(engine.key)}
                disabled={disabled}
              />
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
      </div>

      {/* ⚠️ ფასი ღილაკის გვერდით და არა დახმარებაში — ესაა ის ადგილი,
          სადაც 250-იანი ბიუჯეტი შეუმჩნევლად ქრება (§7.6.4) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          {t('web.cost', { count: cost })}
          {quota?.remaining != null && ` · ${t('web.remaining', { count: quota.remaining })}`}
        </p>

        <Button
          type="button"
          size="sm"
          variant={allSelected ? 'secondary' : 'ghost'}
          disabled={disabled || engines.length === 0}
          onClick={() => onChange(allSelected ? [all[0]] : all)}
        >
          {allSelected ? t('web.onlyFirst') : t('web.allTogether')}
        </Button>
      </div>
    </div>
  )
}
