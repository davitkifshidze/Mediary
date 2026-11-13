import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Timer } from 'lucide-react'
import { SYNC_DELAY_OPTIONS, useSettings } from '@/lib/settings'
import { NumberSelect } from '@/components/SettingRow'
import { SettingsSaveBar } from '@/components/SettingsSaveBar'
import { SyncCards } from '@/components/SyncCards'
import { InfoHint } from '@/components/ui/info-hint'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { TaskCard } from '@/components/ui/task-card'

/* ============================================================
   მონაცემების სინქრონიზაცია — ცალკე გვერდი, ბარათებად.

   რა რას აკეთებს და რა მდგომარეობაშია ბიბლიოთეკა, ერთი შეხედვით ჩანს: თითო
   სახეობას (მონაცემები TMDB-დან · სეზონები და სერიები · მსახიობები · შედეგები)
   თავისი ბარათი აქვს — აიქონი და ფერი, ერთი წინადადება, რამდენია გასაშვები და
   მთავარი ღილაკი (`SyncCards`; მოდულის გვერდი იმავე ბარათებს ხატავს თავის მოდულზე).

   **„პაუზა ჩანაწერებს შორის"** სინქრონის პარამეტრია, ამიტომ აქვეა — ცალკე ბარათად
   ქვემოთ — და არა პარამეტრების გვერდზე. ცხადად ინახება, როგორც იქ (`SettingsSaveBar`).
   ============================================================ */

export function SyncPage() {
  const { t } = useTranslation()
  const { settings, set, isDirty } = useSettings()

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

      <SyncCards />

      <TaskCard
        className="mt-3"
        color="var(--gold)"
        icon={Timer}
        title={t('settings.syncDelay')}
        text={t('settings.syncDelayHint')}
        count={null}
        actions={
          <div className="flex items-center gap-2">
            <div className="w-40">
              <NumberSelect
                value={settings.syncDelayMs}
                options={SYNC_DELAY_OPTIONS}
                onChange={(v) => set('syncDelayMs', v)}
                labelOf={(v) => (v === 0 ? t('settings.noDelay') : `${v} ms`)}
              />
            </div>
            {/* შეცვლილია და ჯერ არ შენახულა */}
            {isDirty('syncDelayMs') && <span className="size-1.5 shrink-0 rounded-md bg-primary" title={t('settings.syncDelay')} data-testid="pause-dirty" />}
          </div>
        }
        data-testid="pause-block"
      />

      <SettingsSaveBar />
    </PageContainer>
  )
}
