import { useTranslation } from 'react-i18next'
import { Navigate, useSearchParams } from 'react-router-dom'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { CutTabs, type CutOption } from '@/components/ui/cut-tabs'
import { InfoHint } from '@/components/ui/info-hint'
import { ExportPanel } from '@/components/transfer/ExportPanel'
import { ImportPanel } from '@/components/transfer/ImportPanel'

/* ============================================================
   **„ექსპორტ & იმპორტი" — ერთი სექცია, ორი ჩანართი** (Tasks §31).

   ⚠️ **„გაზიარება" აქ მესამე ჩანართი იყო** (Tasks §40.5) და §40.14-ით თავის
   განყოფილებაში გადავიდა (`/share-links`, საიდბარში „მონაცემების" ქვემოთ —
   შენი მითითება). ძველი მისამართი (`?tab=share`) იქ გადამისამართდება.

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

   ⚠️ **ყველა ჩანართი დამონტაჟებული რჩება** (`hidden`) — არჩეული ფაილი და
   მზა გეგმა ჩანართის გადართვაზე არ უნდა დაიკარგოს (§39-ის წესი). ორი
   მოკლე რექვესთის ფასი ამას ღირს.
   ============================================================ */

type TransferTab = 'export' | 'import'

export function TransferPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()

  const raw = params.get('tab')
  const tab: TransferTab = raw === 'import' ? raw : 'export'

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

  // §40.14 — გაზიარების ბმულებს თავისი განყოფილება აქვს; შენახული ძველი ბმული არ უნდა გატყდეს
  if (raw === 'share') return <Navigate to="/share-links" replace />

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
