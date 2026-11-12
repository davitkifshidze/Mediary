import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { fetchPersonalSummary, PERSONAL_KEY } from '@/api/personal'
import { useModules } from '@/lib/modules'
import { PERSONAL_CUTS, type PersonalCut } from '@/lib/personalCuts'
import { formatBytes } from '@/lib/utils'
import { StorageBar } from '@/components/StorageBar'
import { CutTabs } from '@/components/ui/cut-tabs'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { AddAlbumButton, PersonalAlbumsCut } from '@/components/personal/PersonalAlbumsCut'
import { PersonalMediaCut } from '@/components/personal/PersonalMediaCut'
import { PersonalScreenshotsCut } from '@/components/personal/PersonalScreenshotsCut'
import { AddPersonButton, PersonalPeopleCut } from '@/components/personal/PersonalPeopleCut'
import { PersonalUploadDialog } from '@/components/personal/PersonalUploadDialog'
import { PersonalUploadButton } from '@/components/personal/PersonalUploader'

/* ============================================================
   **პირადი გალერეა — `/personal` და მისი ჭრილები.**

   შენი სიტყვები: „პიროვნების გალერეის დამატება, ალბომის შექმნა გარეთ და
   პიროვნებაშიც … ასევე ცალკე, გარეთ იყოს ფოტო/ვიდეო ბარათების სექცია, სადაც
   იყოს ჯგუფები — პიროვნებებით, ალბომებით ან როგორც იქნება შინაარსობრივად".

   ⚠️ **გალერეის გვერდის ფორმა** (`GalleryPage`): მთვლელები და ადგილი ზემოთ,
   ქვე-ნავიგაცია ბარათ-ტაბებად (იგივე ჭრილები საიდბარშიც — `PERSONAL_CUTS`),
   ქვემოთ ჭრილი. „ატვირთვა" სათაურშია და ყველა ჭრილიდან ხელმისაწვდომია.

   ⚠️ **ტაბი ბარათია და არა ხაზგასმული ბმული** („ქარდების სტილად") — მოდულის
   ფერში, აიქონითა და რიცხვით (`summary`: ფოტო+ვიდეო · პიროვნებები · ალბომები);
   არჩევა მისამართზე გადადის, ე.ი. მარშრუტები და საიდბარი იგივეა.

   ⚠️ **ფაილები პირად დისკზეა** — `/storage/*` მათ ვერ ხედავს; ბადე ესკიზს
   blob-ად კითხულობს, ვიდეო Range-ით უკრავს (`api/personal.ts`).
   ============================================================ */

export function PersonalPage({ cut = 'media' }: { cut?: PersonalCut }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { all } = useModules()
  const [uploading, setUploading] = useState(false)

  const summaryQ = useQuery({ queryKey: [PERSONAL_KEY, 'summary'], queryFn: fetchPersonalSummary })
  const summary = summaryQ.data
  const color = all.find((m) => m.key === 'personal')?.color ?? null

  /** ჭრილის რიცხვი — „ყველა" ფოტოსა და ვიდეოს ჯამია */
  const countOf = (key: PersonalCut) => {
    if (!summary) return undefined
    if (key === 'people') return summary.people
    if (key === 'albums') return summary.albums
    if (key === 'screenshots') return summary.screenshots

    return summary.photos + summary.videos
  }

  return (
    <PageContainer>
      <PageHeader
        module="personal"
        title={t(`personal.cut.${cut}`)}
        hint={t('personal.hint')}
        actions={
          <>
            {cut === 'people' && <AddPersonButton />}
            {cut === 'albums' && <AddAlbumButton />}
            {/* სქრინშოტებს თავისი ალბომები აქვთ; ატვირთვაც მათ სივრცეში მიდის (მხოლოდ ფოტო) */}
            {cut === 'screenshots' && <AddAlbumButton screenshot />}
            <PersonalUploadButton only={cut === 'screenshots' ? 'photo' : undefined} onClick={() => setUploading(true)} />
          </>
        }
      />

      {/* ---------- მთვლელები + ადგილი ---------- */}
      {summary && (
        <section className="mb-5 rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2">
            <Stat label={t('personal.stat.people')} value={summary.people} />
            <Stat label={t('personal.stat.albums')} value={summary.albums} />
            <Stat label={t('personal.stat.photos')} value={summary.photos} />
            <Stat label={t('personal.stat.videos')} value={summary.videos} />
            <Stat label={t('personal.stat.ungrouped')} value={summary.ungrouped} />
            <Stat label={t('personal.stat.size')} value={formatBytes(summary.bytes)} />
          </div>
          <StorageBar usage={summary.storage} />
        </section>
      )}

      {/* ---------- ქვე-ნავიგაცია — ბარათ-ტაბები ---------- */}
      <nav className="mb-5" aria-label={t('personal.cutsLabel')}>
        <CutTabs
          value={cut}
          onChange={(key) => navigate(PERSONAL_CUTS.find((c) => c.key === key)?.path ?? '/personal')}
          options={PERSONAL_CUTS.map(({ key, icon }) => ({
            key,
            label: t(`personal.cut.${key}`),
            icon,
            color,
            count: countOf(key),
          }))}
        />
      </nav>

      {cut === 'people' && <PersonalPeopleCut />}
      {cut === 'albums' && <PersonalAlbumsCut />}
      {cut === 'media' && <PersonalMediaCut />}
      {cut === 'screenshots' && <PersonalScreenshotsCut />}

      {uploading && <PersonalUploadDialog screenshot={cut === 'screenshots'} onClose={() => setUploading(false)} />}
    </PageContainer>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  )
}
