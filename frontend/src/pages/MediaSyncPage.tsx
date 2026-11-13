import { useTranslation } from 'react-i18next'
import { mediaKey, type MediaType } from '@/lib/media'
import { SyncCards } from '@/components/SyncCards'
import { InfoHint } from '@/components/ui/info-hint'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'

/* ============================================================
   **მოდულის სინქრონიზაცია** — `/movies/sync` · `/series/sync` · `/anime/sync`,
   ქვემენიუს „სინქრონიზაცია".

   იგივე ბარათები, რაც ინსტრუმენტების „სინქრონიზაციაზე" (`SyncCards`), ამ მოდულზე
   დავიწროებული: მონაცემები TMDB-დან · სეზონები და სერიები (სერიალი და ანიმე —
   ფილმს სეზონი არ აქვს) · მსახიობები · შედეგები. რიცხვები, ბოლო გაშვება და
   გაშვების ფანჯარა მხოლოდ ამ მოდულის ჩანაწერებს ეხება.
   ============================================================ */

export function MediaSyncPage({ type }: { type: MediaType }) {
  const { t } = useTranslation()

  return (
    <PageContainer>
      <PageHeader module={type} title={t('mediaSync.section')} hint={<InfoHint info={t(mediaKey('mediaSync.hint', type))} />} />

      <SyncCards type={type} />
    </PageContainer>
  )
}
