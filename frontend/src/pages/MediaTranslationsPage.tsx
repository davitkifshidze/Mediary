import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { mediaKey, type MediaType } from '@/lib/media'
import { TranslationCards } from '@/components/TranslationCards'
import { buttonVariants } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'

/* ============================================================
   **მოდულის თარგმანი** — `/movies/translations` · `/series/translations` ·
   `/anime/translations`, ქვემენიუს „თარგმანი".

   იგივე ბარათები, რაც ინსტრუმენტების „თარგმანზე" (`TranslationCards`), ამ მოდულზე
   დავიწროებული: ნაკლული თარგმანები ნაწილებად და გაშვება მხოლოდ მის ჩანაწერებსა და მათ
   მსახიობებზე. ხარჯი, წყაროები და პაუზა მთელ თარგმანს ეხება — ისინი საერთო გვერდზეა,
   საითაც ზედა ღილაკი მიდის (ზუსტად ისე, როგორც სინქრონიზაციაზე).
   ============================================================ */

export function MediaTranslationsPage({ type }: { type: MediaType }) {
  const { t } = useTranslation()

  return (
    <PageContainer>
      <PageHeader
        module={type}
        title={t('translate.section')}
        hint={<InfoHint info={t(mediaKey('translate.moduleHint', type))} />}
        actions={
          <Link to="/translations" className={buttonVariants({ variant: 'outline', size: 'sm' })} data-testid="translations-all-link">
            <Languages className="size-3.5" />
            {t('translate.allModules')}
          </Link>
        }
      />

      <TranslationCards type={type} />
    </PageContainer>
  )
}
