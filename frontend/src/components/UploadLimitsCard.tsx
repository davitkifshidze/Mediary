import { useTranslation } from 'react-i18next'
import { HardDriveUpload } from 'lucide-react'
import type { UploadKindLimit } from '@/api/account'
import { useUploadLimits } from '@/lib/uploadLimits'
import { formatBytes } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { InfoHint } from '@/components/ui/info-hint'

/* ============================================================
   **ატვირთვის ლიმიტები პარამეტრებში (2026-09-14).**

   ⚠️ შენი მითითება: „ფოტოების, ვიდეოების, დოკუმენტების ატვირთვის ზომები
   ლიმიტები გაწერე პარამეტრებში". აქამდე ეს რიცხვები **მხოლოდ backend-ის
   ვალიდაციაში** არსებობდა: ატვირთვა ვარდებოდა და ეკრანზე არსად ეწერა, რა
   ზომა და რა ფორმატი შეიძლება.

   ⚠️ **ბლოკი მხოლოდ კითხვადია და ეს განზრახაა.** ჭერი ორი რამით განისაზღვრება:
   აპის წესი (`App\\Support\\UploadLimits`) და **PHP-ის `php.ini`**
   (`upload_max_filesize` / `post_max_size`). მეორე სერვერის კონფიგურაციაა —
   ღილაკი, რომელიც მას „გაზრდიდა", ან იტყუებოდა, ან აპს php.ini-ის წერის
   უფლებას მისცემდა. ამიტომ აქ **ორივე რიცხვი წერია** და ცხადად ჩანს, რომელი
   ზღუდავს რეალურად.

   ⚠️ ეს **საცავის კვოტა არაა** (`StorageCard`, `/profile`) — ორი სხვადასხვა
   ზღვარია: ერთი მოთხოვნის ჭერი და ანგარიშის მთლიანი ადგილი.
   ============================================================ */

export function UploadLimitsCard() {
  const { t } = useTranslation()
  const { data, isLoading } = useUploadLimits()

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <HardDriveUpload className="size-4 text-muted-foreground" />
        {t('uploads.title')}
        <InfoHint info={t('uploads.hint')} critical={t('uploads.hintWarn')} />
      </h3>

      {isLoading && <p className="mt-3 text-xs text-muted-foreground">{t('common.loading')}</p>}

      {data && (
        <>
          <ul className="mt-4 space-y-2">
            {data.kinds.map((limit) => (
              <Row key={limit.kind} limit={limit} />
            ))}
          </ul>

          {/* სერვერის საკუთარი ჭერი — „რატომ ჩამოიჭრა" კითხვის პასუხი */}
          <dl className="mt-4 grid gap-2 border-t border-border pt-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">{t('uploads.perFile')}</dt>
              <dd className="font-medium tabular-nums">{data.server.upload_max_filesize}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('uploads.perRequest')}</dt>
              <dd className="font-medium tabular-nums">{data.server.post_max_size}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('uploads.maxFiles')}</dt>
              <dd className="font-medium tabular-nums">{data.max_files}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  )
}

function Row({ limit }: { limit: UploadKindLimit }) {
  const { t } = useTranslation()

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-sm">
      <span className="min-w-32 font-medium">{t(`uploads.kind.${limit.kind}`)}</span>

      <span
        className={cn(
          'rounded-md px-1.5 py-0.5 text-xs leading-none tabular-nums',
          // ⚠️ PHP-ით ჩამოჭრილი ჭერი ხაზგასმულია: სხვაგვარად „100 MB"-ის ნაცვლად
          // ჩუმად 2 MB იმოქმედებდა და მიზეზი არსად ჩანდა
          limit.capped_by_server ? 'bg-destructive/10 text-destructive' : 'bg-secondary',
        )}
      >
        ≤ {formatBytes(limit.max_bytes)}
      </span>

      {limit.capped_by_server && (
        <span className="text-xs text-destructive">{t('uploads.cappedByServer')}</span>
      )}

      <span className="min-w-0 flex-1 truncate text-xs uppercase text-muted-foreground">
        {limit.mimes.length ? limit.mimes.join(', ') : t('uploads.anyFormat')}
      </span>
    </li>
  )
}
