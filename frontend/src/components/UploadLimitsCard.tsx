import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Clock, HardDriveUpload, SquarePen, UserCheck } from 'lucide-react'
import { fetchMyRequests, type UploadKindLimit } from '@/api/account'
import { formatList, kbLabel, requestableFormats, useUploadLimits } from '@/lib/uploadLimits'
import { cn, formatBytes } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { AdminChatButton } from '@/components/uploads/AdminChatButton'
import { UploadLimitsEditor } from '@/components/uploads/UploadLimitsEditor'
import { UploadRequestDialog } from '@/components/uploads/UploadRequestDialog'

/* ============================================================
   **ატვირთვის ლიმიტები პარამეტრებში (2026-09-14 → Tasks §34).**

   შენი სიტყვები (§34): „ატვირთვის ლიმიტები და ფორმატები უნდა შეიძლებოდეს
   გაწერო, რაც გინდა — სუპერადმინზე მაქვს საუბარი; უბრალო მომხმარებელს კი
   უნდა უჩანდეს, რაც გაწერილია, და თუ რამე სჭირდება — მიწერისთვის
   შეიძლებოდეს სუპერადმინთან ჩატის გახსნა“.

   ⚠️ **ერთი ბარათი, ორი როლი.** სუპერადმინი რედაქტორს ხსნის (ინსტალაციის
   მნიშვნელობა — ყველასთვის); სხვები ხედავენ **საკუთარ** ეფექტურ ლიმიტს
   (ინსტალაციის ∪ პირადი გამონაკლისი) და თითო სახეობაზე მოთხოვნას
   აგზავნიან, ან ადმინს წერენ.

   ⚠️ **ორივე რიცხვი ისევ წერია** — აპის წესი და `php.ini`-ის ჭერი: ეს
   უკანასკნელი სერვერის ფაილია და ინტერფეისიდან არ იცვლება, ამიტომ
   ჩამოჭრილი ჭერი წითლადაა მონიშნული და მიზეზს ამბობს.

   ⚠️ ეს **საცავის კვოტა არაა** (`StorageCard`, `/profile`) — ორი სხვადასხვა
   ზღვარია: ერთი ფაილის ჭერი და ანგარიშის მთლიანი ადგილი.
   ============================================================ */

export function UploadLimitsCard() {
  const { t } = useTranslation()
  const { data, isLoading } = useUploadLimits()
  const [editing, setEditing] = useState(false)
  const [asking, setAsking] = useState<UploadKindLimit | null>(null)

  // ⚠️ ღია მოთხოვნა სახეობაზე — მეორეს სერვერი ისედაც არ მიიღებს (`upload_request_pending`)
  const { data: mine = [] } = useQuery({
    queryKey: ['my-requests'],
    queryFn: fetchMyRequests,
    enabled: !!data && !data.can_edit,
  })
  const pending = new Set(
    mine
      .filter((r) => r.type === 'upload_limit' && r.status === 'pending')
      .map((r) => String(r.payload?.kind ?? '')),
  )

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <HardDriveUpload className="size-4 text-muted-foreground" />
          {t('uploads.title')}
          <InfoHint
            info={data?.can_edit ? t('uploads.hintAdmin') : t('uploads.hint')}
            critical={t('uploads.hintWarn')}
          />
        </h3>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {data?.can_edit ? (
            <Button size="sm" variant="edit" onClick={() => setEditing(true)}>
              <SquarePen className="size-4" />
              {t('actions.edit')}
            </Button>
          ) : (
            data && <AdminChatButton />
          )}
        </div>
      </div>

      {isLoading && <p className="mt-3 text-xs text-muted-foreground">{t('common.loading')}</p>}

      {data && (
        <>
          <ul className="mt-4 space-y-2">
            {data.kinds.map((limit) => (
              <Row
                key={limit.kind}
                limit={limit}
                canRequest={!data.can_edit}
                ceilingKb={data.ceiling_kb}
                pending={pending.has(limit.kind)}
                onRequest={() => setAsking(limit)}
              />
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

          {editing && <UploadLimitsEditor limits={data} onClose={() => setEditing(false)} />}
          {asking && <UploadRequestDialog limit={asking} limits={data} onClose={() => setAsking(null)} />}
        </>
      )}
    </section>
  )
}

function Row({
  limit,
  canRequest,
  ceilingKb,
  pending,
  onRequest,
}: {
  limit: UploadKindLimit
  canRequest: boolean
  ceilingKb: number
  pending: boolean
  onRequest: () => void
}) {
  const { t } = useTranslation()
  const own = limit.personal
  // მოთხოვნის ღილაკი მხოლოდ მაშინ, როცა რამე **შეიძლება** მოითხოვო (ფორმატი ან ზომა)
  const requestable = requestableFormats(limit).length > 0 || limit.max_kb < ceilingKb

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-sm">
      <span className="flex min-w-40 items-center gap-1.5 font-medium">
        {t(`uploads.kind.${limit.kind}`)}
        <InfoHint info={t(`uploads.where.${limit.kind}`)} />
      </span>

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

      {limit.capped_by_server && <span className="text-xs text-destructive">{t('uploads.cappedByServer')}</span>}

      {/* ⚠️ §34.4 — **ნამდვილი სია** (ადრე „ნებისმიერი ფორმატი" ეწერა სურათზე) */}
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={formatList(limit.mimes)}>
        {formatList(limit.mimes)}
      </span>

      {own && (
        <Badge className="bg-secondary text-foreground">
          <UserCheck className="size-3.5" />
          {t('uploads.personal')}
          <InfoHint
            info={t('uploads.personalHint', {
              what: [own.formats.length ? formatList(own.formats) : null, own.max_kb ? `≤ ${kbLabel(own.max_kb)}` : null]
                .filter(Boolean)
                .join(' · '),
            })}
          />
        </Badge>
      )}

      {canRequest &&
        (pending ? (
          <Badge className="bg-secondary">
            <Clock className="size-3.5" />
            {t('uploads.requestPending')}
          </Badge>
        ) : (
          requestable && (
            <Button size="sm" variant="outline" onClick={onRequest}>
              {t('uploads.request')}
            </Button>
          )
        ))}
    </li>
  )
}
