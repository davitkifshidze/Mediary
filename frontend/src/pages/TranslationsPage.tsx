import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Gauge, Languages, Sparkles, Timer } from 'lucide-react'
import { fetchTranslationSummary, fetchTranslationUsage } from '@/api/translations'
import { TRANSLATE_DELAY_OPTIONS, useSettings } from '@/lib/settings'
import { useDateFormat } from '@/lib/dates'
import { CredentialMissingNotice } from '@/components/CredentialMissingNotice'
import { NumberSelect } from '@/components/SettingRow'
import { SettingsSaveBar } from '@/components/SettingsSaveBar'
import { TranslationCards } from '@/components/TranslationCards'
import { InfoHint } from '@/components/ui/info-hint'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { TaskCard } from '@/components/ui/task-card'
import { cn } from '@/lib/utils'

/* ============================================================
   თარგმანები — ცალკე გვერდი, ბარათებად (სინქრონის ანალოგიით).

   ზემოთ — **ნაწილები** (`TranslationCards`): თითო ნაწილს თავისი რიცხვი და გაშვება აქვს,
   „ყველაფერი" ერთი ღილაკია; მოდულის გვერდი (`/movies/translations`…) იმავე ბარათებს
   ხატავს თავის მოდულზე. ქვემოთ — ცალკე ბარათებად ის, რაც მთელ თარგმანს ეხება: **წყაროები**
   (რითი ითარგმნება და რომელი გასაღები აკლია), **ხარჯი** (Gemini-ს დღიური ლიმიტი) და
   **პაუზა** ერთეულებს შორის. ბოლოს — რა რითი ითარგმნა და რა ვერ შეივსო.

   ⚠️ ჩანაწერი მხოლოდ მაშინ ითვლება სათარგმნად, თუ ტექსტი **ერთ ენაზე მაინც არის** —
   თარგმანს წყარო სჭირდება; სრულიად ცარიელი აღწერა `/sync`-ის საქმეა.
   ============================================================ */

export function TranslationsPage() {
  const { t } = useTranslation()
  const { dateTime } = useDateFormat()
  const { settings, set, isDirty } = useSettings()

  // რომელი გასაღები მაქვს — წყაროების ბარათისთვის
  const { data } = useQuery({
    queryKey: ['translations', 'summary'],
    queryFn: fetchTranslationSummary,
  })

  /* ხარჯი + ბოლო თარგმანები (შენი მითითება, 2026-09-14).
     ⚠️ ერთი რექვესთი ორივეს — „რამდენი დავხარჯე" და „რა რითი
     ითარგმნა" ერთმანეთში არევდა: ერთი ჩანაწერი = ორი გამოძახება. */
  const usageQ = useQuery({ queryKey: ['translations', 'usage'], queryFn: fetchTranslationUsage })
  const gemini = usageQ.data?.gemini
  const recent = usageQ.data?.recent ?? []
  // ბოლო გაშვებებზე ვერაფერი შეივსო (ცარიელი · ჩავარდნილი)
  const unfilled = usageQ.data?.unfilled ?? []

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

      <TranslationCards />

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {/* რითი ითარგმნება — პატიოსნად, რომ „რატომ არ ითარგმნა" კითხვა არ დარჩეს */}
        <TaskCard
          color="var(--tool-translations)"
          icon={Languages}
          title={t('translate.sources')}
          info={[t('translate.sourceTmdb'), t('translate.sourceGemini'), t('translate.sourceNever'), t('translate.sourceReview')].join(' ')}
          text={t('translate.sourcesText')}
          count={null}
          data-testid="sources-block"
        >
          {/* გასაღები ანგარიშისაა: შეტყობინებას „მონაცემების" ბმულიც ახლავს */}
          {data && !data.translator_configured && (
            <CredentialMissingNotice provider="gemini" className="mt-3">
              {t('translate.noKey')}
            </CredentialMissingNotice>
          )}
          {data && !data.tmdb_configured && (
            <CredentialMissingNotice provider="tmdb" className="mt-3">
              {t('translate.noTmdbKey')}
            </CredentialMissingNotice>
          )}
        </TaskCard>

        {/* ---------- Gemini-ის ხარჯი (შენი მითითება, 2026-09-14) ----------

            ⚠️ **რიცხვი ჩვენია და არა Google-ის, და ეს ცხადად წერია.** Gemini-ს
            ხარჯის API არ აქვს (SerpApi-სგან განსხვავებით, სადაც ნამდვილ
            მრიცხველს ვეკითხებით), ე.ი. ეს `translation_usages`-ის აღრიცხვაა —
            სხვა პროგრამიდან დახარჯულს ვერ დაინახავს. */}
        {gemini?.configured && (
          <TaskCard
            color="var(--gold)"
            icon={Gauge}
            title={t('translate.quotaTitle')}
            info={t('translate.quotaHint')}
            text={gemini.limit > 0 ? t('translate.quotaUsed', { used: gemini.used, limit: gemini.limit }) : t('translate.quotaOff')}
            count={gemini.limit > 0 ? (gemini.remaining ?? 0) : null}
            countLabel={t('translate.quotaLeftLabel')}
            data-testid="quota-block"
          >
            {gemini.limit > 0 && (
              <div className="mt-3 h-2 w-full overflow-hidden rounded-md bg-muted">
                <div
                  className={cn('h-full rounded-md', gemini.exhausted ? 'bg-destructive' : 'bg-[var(--mod)]')}
                  style={{ width: `${Math.min(100, Math.round((gemini.used / gemini.limit) * 100))}%` }}
                />
              </div>
            )}
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {gemini.model && (
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="size-3.5" />
                  <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">{gemini.model}</span>
                </span>
              )}
              {gemini.rpm_limit > 0 && <span>{t('translate.quotaRpm', { used: gemini.rpm_used, limit: gemini.rpm_limit })}</span>}
            </p>
          </TaskCard>
        )}

        {/* პაუზა — თარგმანის პარამეტრია, ამიტომ აქვეა (როგორც `/sync`-ზე).
            `syncDelayMs`-ისგან ცალკეა: Gemini-ის ლიმიტი TMDB-ისას არ ემთხვევა. */}
        <TaskCard
          color="var(--gold)"
          icon={Timer}
          title={t('settings.translateDelay')}
          text={t('settings.translateDelayHint')}
          count={null}
          actions={
            <div className="flex items-center gap-2">
              <div className="w-40">
                <NumberSelect
                  value={settings.translateDelayMs}
                  options={TRANSLATE_DELAY_OPTIONS}
                  onChange={(v) => set('translateDelayMs', v)}
                  labelOf={(v) => (v === 0 ? t('settings.noDelay') : `${v} ms`)}
                />
              </div>
              {/* შეცვლილია და ჯერ არ შენახულა */}
              {isDirty('translateDelayMs') && <span className="size-1.5 shrink-0 rounded-md bg-primary" title={t('settings.translateDelay')} data-testid="pause-dirty" />}
            </div>
          }
          data-testid="pause-block"
        />
      </div>

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

      {/* **ცარიელი და ჩავარდნილი გაშვებებიც ჩანს**: ზემოთა სია ლოგიდან მხოლოდ
          შეცვლილს აჩვენებს, ეს კი ჩანაწერის კვალიდან მოდის — რაც ვერ შეივსო, ყვითელია,
          რაც ჩავარდა — წითელი; ორივე გეგმაში ისევ ზის. */}
      {unfilled.length > 0 && (
        <section className="mt-3 rounded-xl border border-border bg-card p-5" data-testid="unfilled">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            {t('translate.unfilledTitle')}
            <InfoHint info={t('translate.unfilledHint')} />
          </h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {unfilled.map((row) => (
              <li key={`${row.type}:${row.record_id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 truncate font-medium">{row.title ?? `#${row.record_id}`}</span>
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[11px]',
                    row.result === 'failed' ? 'bg-destructive/10 text-destructive' : 'bg-status-towatch/15 text-status-towatch',
                  )}
                >
                  {t(`translate.result.${row.result}`)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{dateTime(row.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SettingsSaveBar />
    </PageContainer>
  )
}
