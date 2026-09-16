import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Languages, Sparkles } from 'lucide-react'
import { fetchTranslationSummary, fetchTranslationUsage } from '@/api/translations'
import { TRANSLATE_DELAY_OPTIONS, useSettings } from '@/lib/settings'
import { useDateFormat } from '@/lib/dates'
import { TranslateDialog } from '@/components/TranslateDialog'
import { NumberSelect, SettingRow } from '@/components/SettingRow'
import { SettingsSaveBar } from '@/components/SettingsSaveBar'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/utils'

/* ============================================================
   თარგმანები (Tasks 7) — ცალკე გვერდი, სინქრონის ანალოგიით.

   რიცხვები „რამდენი ჩანაწერია ნაკლული თარგმანით" და არა „რამდენი ჩანაწერია".
   ⚠️ ჩანაწერი მხოლოდ მაშინ ითვლება, თუ ტექსტი **ერთ ენაზე მაინც არის** —
   თარგმანს წყარო სჭირდება; სრულიად ცარიელი აღწერა `/sync`-ის საქმეა.
   ============================================================ */

export function TranslationsPage() {
  const { t } = useTranslation()
  const { dateTime } = useDateFormat()
  const { settings, set, isDirty } = useSettings()
  const [open, setOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['translations', 'summary'],
    queryFn: fetchTranslationSummary,
  })

  /* ხარჯი + ბოლო თარგმანები (შენი მითითება, 2026-09-14).
     ⚠️ ერთი რექვესთი ორივეს — „რამდენი დავხარჯე" და „რა რითი
     ითარგმნა" ერთმანეთში არევდა: ერთი ჩანაწერი = ორი გამოძახება. */
  const usageQ = useQuery({ queryKey: ['translations', 'usage'], queryFn: fetchTranslationUsage })
  const gemini = usageQ.data?.gemini
  const recent = usageQ.data?.recent ?? []

  const rows: { key: string; label: string; count: number }[] = [
    { key: 'movie', label: t('nav.movies'), count: data?.movie ?? 0 },
    { key: 'series', label: t('nav.series'), count: data?.series ?? 0 },
    { key: 'genres', label: t('genres.title'), count: data?.genres ?? 0 },
  ]

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
        tool="translations"
        title={t('translate.title')}
        hint={<InfoHint info={t('translate.pageHint')} />}
      />

      <section className="rounded-xl border border-border bg-card p-5">
        <dl className="grid gap-3 sm:grid-cols-3">
          {rows.map((r) => (
            <div key={r.key} className="rounded-lg border border-border p-3">
              <dt className="text-sm text-muted-foreground">{r.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{isLoading ? '—' : r.count}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-sm text-muted-foreground">
          {data?.total === 0 ? t('translate.allDone') : t('translate.desc')}
        </p>

        {/* ⚠️ **გადასამოწმებელი ჯამში არ შედის** (ის ნაკლული თარგმანი არაა),
            ამიტომ აქ ცალკე ითქმება — თორემ „ყველაფერი ნათარგმნია" ერთადერთი
            წარწერა იქნებოდა და რეჟიმამდე მისვლა შეუძლებელი. */}
        {(data?.reviewable ?? 0) > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t('translate.reviewablePending', { count: data?.reviewable ?? 0 })}
          </p>
        )}

        {/* ღილაკი გადამოწმებაზეც უნდა იხსნებოდეს — თორემ სრულად ნათარგმნ
            ბიბლიოთეკაზე დიალოგი საერთოდ აღარ გაიხსნებოდა */}
        <Button
          className="mt-4"
          onClick={() => setOpen(true)}
          disabled={!data?.total && !data?.reviewable}
        >
          <Languages className="size-4" />
          {t('translate.open')}
        </Button>

        <p className="mt-4 text-xs text-muted-foreground">{t('sync.runsInQueue')}</p>
      </section>

      {/* რითი ითარგმნება — პატიოსნად, რომ „რატომ არ ითარგმნა" კითხვა არ დარჩეს */}
      <section className="mt-3 rounded-xl border border-border bg-card p-5 text-sm">
        <h2 className="font-medium">{t('translate.sources')}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{t('translate.sourceTmdb')}</li>
          <li>{t('translate.sourceGemini')}</li>
          <li>{t('translate.sourceNever')}</li>
          <li>{t('translate.sourceReview')}</li>
        </ul>
        {data && !data.translator_configured && (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
            {t('translate.noKey')}
          </p>
        )}
        {data && !data.tmdb_configured && (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
            {t('translate.noTmdbKey')}
          </p>
        )}
      </section>

      {/* ---------- Gemini-ის ხარჯი (შენი მითითება, 2026-09-14) ----------

          ⚠️ **რიცხვი ჩვენია და არა Google-ის, და ეს ცხადად წერია.** Gemini-ს
          ხარჯის API არ აქვს (SerpApi-სგან განსხვავებით, სადაც ნამდვილ
          მრიცხველს ვეკითხებით), ე.ი. ეს `translation_usages`-ის აღრიცხვაა —
          სხვა პროგრამიდან დახარჯულს ვერ დაინახავს. ავტორიტეტულად
          წაკითხული რიცხვი ამ შემთხვევაში ტყუილი იქნებოდა. */}
      {gemini?.configured && (
        <section className="mt-3 rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-muted-foreground" />
            {t('translate.quotaTitle')}
            {gemini.model && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {gemini.model}
              </span>
            )}
          </h2>

          {gemini.limit > 0 ? (
            <>
              <div className="mt-3 flex items-baseline justify-between gap-2 text-sm">
                <span className={gemini.exhausted ? 'text-destructive' : 'text-muted-foreground'}>
                  {t('translate.quotaUsed', { used: gemini.used, limit: gemini.limit })}
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {t('translate.quotaLeft', { count: gemini.remaining ?? 0 })}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-md bg-muted">
                <div
                  className={cn('h-full rounded-md', gemini.exhausted ? 'bg-destructive' : 'bg-primary')}
                  style={{ width: `${Math.min(100, Math.round((gemini.used / gemini.limit) * 100))}%` }}
                />
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{t('translate.quotaOff')}</p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">{t('translate.quotaHint')}</p>
          {gemini.rpm_limit > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('translate.quotaRpm', { used: gemini.rpm_used, limit: gemini.rpm_limit })}
            </p>
          )}
        </section>
      )}

      {/* ---------- „რა რითი ითარგმნა" (შენი მითითება, 2026-09-14) ----------

          ⚠️ **სია `audit_logs`-იდან მოდის და არა ცალკე ცხრილიდან** — იგივე
          ჩანაწერები, რასაც `/audit` ხატავს, ე.ი. ორი წყარო ვერ აცდება. */}
      {recent.length > 0 && (
        <section className="mt-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-medium">{t('translate.recentTitle')}</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {recent.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 truncate font-medium">{row.title ?? `#${row.record_id}`}</span>
                <span className="flex flex-wrap gap-1">
                  {Object.entries(row.fields).map(([field, provider]) => (
                    <span
                      key={field}
                      className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      title={field}
                    >
                      {t(`translate.field.${field}`, field)} · {t(`translate.source.${provider}`)}
                    </span>
                  ))}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{dateTime(row.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* პაუზა — თარგმანის პარამეტრია, ამიტომ აქვეა (როგორც `/sync`-ზე).
          `syncDelayMs`-ისგან ცალკეა: Gemini-ის ლიმიტი TMDB-ისას არ ემთხვევა. */}
      <section className="mt-3 rounded-xl border border-border bg-card p-5">
        <SettingRow
          label={t('settings.translateDelay')}
          hint={t('settings.translateDelayHint')}
          dirty={isDirty('translateDelayMs')}
        >
          <NumberSelect
            value={settings.translateDelayMs}
            options={TRANSLATE_DELAY_OPTIONS}
            onChange={(v) => set('translateDelayMs', v)}
            labelOf={(v) => (v === 0 ? t('settings.noDelay') : `${v} ms`)}
          />
        </SettingRow>
      </section>

      <SettingsSaveBar />

      <TranslateDialog open={open} onOpenChange={setOpen} />
    </PageContainer>
  )
}
