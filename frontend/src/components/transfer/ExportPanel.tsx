import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Download, FileArchive, PackageOpen } from 'lucide-react'
import { downloadExport, fetchExportModules, type ExportFormat, type ExportModule } from '@/api/export'
import { downloadStorageFiles, fetchStorageFiles } from '@/api/account'
import { errorMessage } from '@/lib/errors'
import { MODULE_ACCENT_FALLBACK, modAccent } from '@/lib/modules'
import { cn, formatBytes } from '@/lib/utils'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   „ექსპორტ & იმპორტი"-ს ექსპორტის ჩანართი (Tasks §31 ← FEAT-06).

   ⚠️ **ეს `DataExportCard`-ია, პროფილიდან გადმოტანილი** — იმავე
   რექვესთებით (`GET /export`, `GET /export/{module}`, `POST
   /storage/files/download`). პროფილზე მხოლოდ ბმული დარჩა (31.3): ორი
   ადგილი, სადაც ერთი და იგივე კეთდება, ორ სხვადასხვა ქცევად დაიწყებდა
   ცხოვრებას.

   ⚠️ **ფორმატი ახლა ბარათზეა და არა მთელ ბლოკზე.** ძველი გადამრთველი
   ფარული რეჟიმი იყო: „CSV" ღილაკი იმაზე იყო დამოკიდებული, რა ეწერა
   ზემოთ სხვა ადგილას. ორი პატარა ღილაკი ბარათზე არჩევანს იქვე აჩენს,
   სადაც ის კეთდება, და ერთი დაჭერით მთავრდება.

   ⚠️ **ორი სექციაა და ეს რიგი შინაარსობრივია:** ზემოთ **ჩანაწერები**
   (სათაური, სტატუსი, ჟანრი…), ქვემოთ ატვირთული **ფაილები** ZIP-ად.
   ორივე „ჩემი ბიბლიოთეკაა" და ერთმანეთს ავსებს — CSV-ის `poster_path`
   სწორედ იმ არქივის ფაილს უთითებს.
   ============================================================ */

export function ExportPanel() {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()

  /** რომელი ღილაკი მუშაობს: `movie:csv` · `zip` */
  const [busy, setBusy] = useState<string | null>(null)

  /* ⚠️ გასაღები `['export', …]`-ია განზრახ: იმპორტის რიგი ჩანაწერის
     შექმნისას `['export']`-ს აუქმებს, ე.ი. ბარათის რიცხვი თავისით ახლდება. */
  const { data, isLoading } = useQuery({
    queryKey: ['export', 'modules'],
    queryFn: fetchExportModules,
    staleTime: 60_000,
  })

  /* ⚠️ `limit=1` — ბარათს მხოლოდ ჯამი სჭირდება (`total`/`bytes`), სია კი
     არა. გასაღები `['storage-files', …]`-ით იწყება, ე.ი. საცავის ბლოკში
     წაშლა ამ რიცხვსაც აახლებს. */
  const filesQ = useQuery({
    queryKey: ['storage-files', 'summary'],
    queryFn: () => fetchStorageFiles(1),
    staleTime: 60_000,
  })

  const modules = data?.data ?? []
  const formats = data?.formats ?? (['json', 'csv'] as ExportFormat[])
  const fileCount = filesQ.data?.total ?? 0

  const run = async (key: string, job: () => Promise<void>) => {
    setBusy(key)
    try {
      await job()
    } catch (e) {
      toast({ title: errorMessage(e), variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-8">
      {/* ---------- ჩანაწერები ---------- */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
          <PackageOpen className="size-5 text-muted-foreground" />
          {t('transfer.records')}
          <InfoHint info={t('exportData.hint')} />
        </h2>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : modules.length === 0 ? (
          <EmptyState icon={<PackageOpen className="size-6" />} title={t('exportData.empty')} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((m) => (
              <ExportCard
                key={m.key}
                module={m}
                name={i18n.language === 'ka' ? m.name_ka : m.name_en}
                formats={formats}
                busy={busy}
                onRun={(format) => run(`${m.key}:${format}`, () => downloadExport(m.key, format))}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ---------- ფაილები ---------- */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
          <FileArchive className="size-5 text-muted-foreground" />
          {t('transfer.files')}
          <InfoHint info={t('transfer.filesHint')} />
        </h2>

        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <li
            className={cn(
              'flex flex-col gap-3 rounded-xl border border-border bg-card p-4',
              !filesQ.isLoading && fileCount === 0 && 'opacity-60',
            )}
            style={modAccent('var(--tool-backups)')}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)] [&>svg]:size-5 [&>svg]:text-[var(--mod)]">
                <FileArchive />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t('transfer.zipTitle')}</span>
                <span className="block text-xs text-muted-foreground">
                  {filesQ.isLoading
                    ? t('common.loading')
                    : fileCount === 0
                      ? t('transfer.zipEmpty')
                      : t('transfer.zipCount', { count: fileCount, size: formatBytes(filesQ.data?.bytes ?? 0) })}
                </span>
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={fileCount === 0 || busy !== null}
              onClick={() => run('zip', () => downloadStorageFiles({ all: true }))}
            >
              <Download className="size-4" />
              {busy === 'zip' ? t('transfer.zipBuilding') : 'ZIP'}
            </Button>
          </li>
        </ul>
      </section>
    </div>
  )
}

/** ერთი მოდულის ბარათი — ფერი, ხატულა, რაოდენობა და ორი ფორმატი */
function ExportCard({
  module: m,
  name,
  formats,
  busy,
  onRun,
}: {
  module: ExportModule
  name: string
  formats: ExportFormat[]
  busy: string | null
  onRun: (format: ExportFormat) => void
}) {
  const { t } = useTranslation()
  // ⚠️ ცარიელი მოდულის ფაილი მხოლოდ სათაურების რიგი იქნებოდა — ღილაკი გამორთულია
  const empty = m.count === 0

  return (
    <li
      className={cn('flex flex-col gap-3 rounded-xl border border-border bg-card p-4', empty && 'opacity-60')}
      style={modAccent(m.color) ?? MODULE_ACCENT_FALLBACK}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)] [&>svg]:size-5 [&>svg]:text-[var(--mod)]">
          <ModuleIcon name={m.icon} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{name}</span>
          {/* ⚠️ რიცხვი იმავე query-დან მოდის, რომლითაც ფაილი აიგება —
              ე.ი. „342 ჩანაწერი" და ფაილის სიგრძე ვერ დაშორდება */}
          <span className="block text-xs text-muted-foreground">
            {empty
              ? t('transfer.noRecords')
              : `${t('exportData.records', { count: m.count })} · ${t('exportData.fields', { count: m.fields })}`}
          </span>
        </span>
      </div>

      <div className="flex gap-2">
        {formats.map((format) => (
          <Button
            key={format}
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={empty || busy !== null}
            onClick={() => onRun(format)}
          >
            <Download className="size-4" />
            {busy === `${m.key}:${format}` ? t('common.loading') : format.toUpperCase()}
          </Button>
        ))}
      </div>
    </li>
  )
}
