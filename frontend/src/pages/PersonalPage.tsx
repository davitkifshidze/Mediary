import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { fetchPersonalSummary, PERSONAL_KEY } from '@/api/personal'
import { PERSONAL_CUTS, type PersonalCut } from '@/lib/personalCuts'
import { cn, formatBytes } from '@/lib/utils'
import { StorageBar } from '@/components/StorageBar'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { AddAlbumButton, PersonalAlbumsCut } from '@/components/personal/PersonalAlbumsCut'
import { PersonalMediaCut } from '@/components/personal/PersonalMediaCut'
import { AddPersonButton, PersonalPeopleCut } from '@/components/personal/PersonalPeopleCut'
import { PersonalUploadDialog } from '@/components/personal/PersonalUploadDialog'

/* ============================================================
   **პირადი გალერეა — `/personal` და მისი ჭრილები.**

   შენი სიტყვები: „პიროვნების გალერეის დამატება, ალბომის შექმნა გარეთ და
   პიროვნებაშიც … ასევე ცალკე, გარეთ იყოს ფოტო/ვიდეო ბარათების სექცია, სადაც
   იყოს ჯგუფები — პიროვნებებით, ალბომებით ან როგორც იქნება შინაარსობრივად".

   ⚠️ **გალერეის გვერდის ფორმა** (`GalleryPage`): მთვლელები და ადგილი ზემოთ,
   ქვე-ნავიგაცია სეგმენტებად (იგივე ჭრილები საიდბარშიც — `PERSONAL_CUTS`),
   ქვემოთ ჭრილი. „ატვირთვა" სათაურშია და ყველა ჭრილიდან ხელმისაწვდომია.

   ⚠️ **ფაილები პირად დისკზეა** — `/storage/*` მათ ვერ ხედავს; ბადე ესკიზს
   blob-ად კითხულობს, ვიდეო Range-ით უკრავს (`api/personal.ts`).
   ============================================================ */

export function PersonalPage({ cut = 'people' }: { cut?: PersonalCut }) {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)

  const summaryQ = useQuery({ queryKey: [PERSONAL_KEY, 'summary'], queryFn: fetchPersonalSummary })
  const summary = summaryQ.data

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
            <Button onClick={() => setUploading(true)}>
              <Upload className="size-4" />
              {t('actions.upload')}
            </Button>
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

      {/* ---------- ქვე-ნავიგაცია ---------- */}
      <nav className="fb-scroll mb-5 flex gap-1 overflow-x-auto border-b border-border pb-px">
        {PERSONAL_CUTS.map(({ key, path, icon: Icon }) => (
          <NavLink
            key={key}
            to={path}
            end={key === 'people'}
            className={({ isActive }) =>
              cn(
                '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            <Icon className="size-4" />
            {t(`personal.cut.${key}`)}
          </NavLink>
        ))}
      </nav>

      {cut === 'people' && <PersonalPeopleCut />}
      {cut === 'albums' && <PersonalAlbumsCut />}
      {cut === 'media' && <PersonalMediaCut />}

      {uploading && <PersonalUploadDialog onClose={() => setUploading(false)} />}
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
