import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, DownloadCloud } from 'lucide-react'
import { SYNC_DELAY_OPTIONS, useSettings } from '@/lib/settings'
import { SyncDialog } from '@/components/SyncDialog'
import { NumberSelect, SettingRow } from '@/components/SettingRow'
import { SettingsSaveBar } from '@/components/SettingsSaveBar'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'

/* ============================================================
   მონაცემების სინქრონიზაცია (J1–J5) — ცალკე გვერდი (L2).

   ადრე პარამეტრების გვერდიდან იხსნებოდა. სინქრონი ქმედებაა, ამიტომ
   გვერდზე გამოვიდა — და მასთან ერთად **„პაუზა ჩანაწერებს შორის"**:
   ის სინქრონის ნაწილია, პარამეტრებში ცალკე აზრი არ ჰქონდა.
   ციკლს queue ატარებს (J3), ე.ი. გვერდიდან გასვლაც უსაფრთხოა.
   ============================================================ */

export function SyncPage() {
  const { t } = useTranslation()
  const { settings, set, isDirty } = useSettings()
  const [open, setOpen] = useState(false)

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
        tool="sync"
        title={t('sync.title')}
        hint={<InfoHint info={t('settings.syncHint')} />}
      />

      <section className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">{t('settings.syncDesc')}</p>

        <Button className="mt-4" onClick={() => setOpen(true)}>
          <DownloadCloud className="size-4" />
          {t('sync.open')}
        </Button>

        <p className="mt-4 text-xs text-muted-foreground">{t('sync.runsInQueue')}</p>
      </section>

      {/* პაუზა — სინქრონის პარამეტრია, ამიტომ აქვეა და არა პარამეტრების გვერდზე */}
      <section className="mt-3 rounded-xl border border-border bg-card p-5">
        <SettingRow
          label={t('settings.syncDelay')}
          hint={t('settings.syncDelayHint')}
          dirty={isDirty('syncDelayMs')}
        >
          <NumberSelect
            value={settings.syncDelayMs}
            options={SYNC_DELAY_OPTIONS}
            onChange={(v) => set('syncDelayMs', v)}
            labelOf={(v) => (v === 0 ? t('settings.noDelay') : `${v} ms`)}
          />
        </SettingRow>
      </section>

      {/* 3 — პაუზაც ცხადად ინახება, როგორც პარამეტრების გვერდზე */}
      <SettingsSaveBar />

      {/* 1.5 — CLI-ის შენიშვნა (`media:redownload --missing`) აქედან მოიხსნა:
          ჩვეულებრივ მომხმარებელს artisan-ის ბრძანება არ ეხება. ტექსტი
          `CLAUDE.md`-შია, სადაც დანარჩენი bootstrap-ის ნაბიჯებია. */}

      <SyncDialog open={open} onOpenChange={setOpen} />
    </PageContainer>
  )
}
