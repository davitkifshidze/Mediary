import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Languages } from 'lucide-react'
import { fetchTranslationSummary } from '@/api/translations'
import { TRANSLATE_DELAY_OPTIONS, useSettings } from '@/lib/settings'
import { TranslateDialog } from '@/components/TranslateDialog'
import { NumberSelect, SettingRow } from '@/components/SettingRow'
import { SettingsSaveBar } from '@/components/SettingsSaveBar'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'

/* ============================================================
   თარგმანები (Tasks 7) — ცალკე გვერდი, სინქრონის ანალოგიით.

   რიცხვები „რამდენი ჩანაწერია ნაკლული თარგმანით" და არა „რამდენი ჩანაწერია".
   ⚠️ ჩანაწერი მხოლოდ მაშინ ითვლება, თუ ტექსტი **ერთ ენაზე მაინც არის** —
   თარგმანს წყარო სჭირდება; სრულიად ცარიელი აღწერა `/sync`-ის საქმეა.
   ============================================================ */

export function TranslationsPage() {
  const { t } = useTranslation()
  const { settings, set, isDirty } = useSettings()
  const [open, setOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['translations', 'summary'],
    queryFn: fetchTranslationSummary,
  })

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
        title={t('translate.title')}
        subtitle={t('translate.pageHint')}
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

        <Button className="mt-4" onClick={() => setOpen(true)} disabled={!data?.total}>
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
          <li>{t('translate.sourceClaude')}</li>
          <li>{t('translate.sourceNever')}</li>
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

      {/* პაუზა — თარგმანის პარამეტრია, ამიტომ აქვეა (როგორც `/sync`-ზე).
          `syncDelayMs`-ისგან ცალკეა: Claude-ის ლიმიტი TMDB-ისას არ ემთხვევა. */}
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
