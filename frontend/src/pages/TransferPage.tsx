import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { CutTabs, type CutOption } from '@/components/ui/cut-tabs'
import { InfoHint } from '@/components/ui/info-hint'
import { ExportPanel } from '@/components/transfer/ExportPanel'
import { ImportPanel } from '@/components/transfer/ImportPanel'

/* ============================================================
   **„ექსპორტ & იმპორტი" — ერთი სექცია, ორი ჩანართი** (Tasks §31).

   შენი სიტყვები: „იმპორტის სექციას ვერ მივუხვდი: ექსპორტები პროფილიდანაა,
   და ეს ყველაფერი მენიუში შეიტანე — ექსპორტი და იმპორტი, შესაბამისი
   ბარათების სახით, ჩანართებად".

   ⚠️ **ერთი კითხვის ორი ნახევარი ორ ადგილას იდგა** — ექსპორტი `/profile`-ზე
   („ჩემი მონაცემები"), იმპორტი გვერდით მენიუში. „ჩემი მონაცემები" თან
   „მონაცემებს" (API-გასაღებების გვერდს) ეჯახებოდა. ახლა სახელი ერთია და
   ზუსტად შენი ფორმით — ამპერსანდით (Q37, `GLOSSARY.md`).

   ⚠️ **ჩანართი URL-შია** (`?tab=`) — ძველი `/import` ბმული
   `/transfer?tab=import`-ზე გადადის და „უკან" ღილაკიც მუშაობს. უცნობი
   მნიშვნელობა ექსპორტზე ბრუნდება.

   ⚠️ **ორივე ჩანართი დამონტაჟებული რჩება** (`hidden`) — არჩეული ფაილი და
   მზა გეგმა ჩანართის გადართვაზე არ უნდა დაიკარგოს (§39-ის წესი). ორი
   მოკლე რექვესთის ფასი ამას ღირს.
   ============================================================ */

type TransferTab = 'export' | 'import'

export function TransferPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()

  const tab: TransferTab = params.get('tab') === 'import' ? 'import' : 'export'

  const tabs: CutOption[] = [
    { key: 'export', label: t('transfer.tabExport'), hint: t('transfer.tabExportHint') },
    { key: 'import', label: t('transfer.tabImport'), hint: t('transfer.tabImportHint') },
  ]

  // ⚠️ დანარჩენი პარამეტრები რჩება — მხოლოდ ჩანართი იცვლება
  const setTab = (key: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      next.set('tab', key)
      return next
    })

  return (
    <PageContainer>
      <PageHeader tool="transfer" title={t('transfer.title')} hint={<InfoHint info={t('transfer.hint')} />} />

      <div className="mb-6">
        <CutTabs layout="inline" value={tab} onChange={setTab} options={tabs} />
      </div>

      <div hidden={tab !== 'export'}>
        <ExportPanel />
      </div>
      <div hidden={tab !== 'import'}>
        <ImportPanel />
      </div>
    </PageContainer>
  )
}
