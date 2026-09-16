import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, Check, HardDrive, Inbox, Tags, X } from 'lucide-react'
import {
  approveRequest,
  cancelRequest,
  fetchAdminRequests,
  fetchMyRequests,
  rejectRequest,
  type ApprovalRequestItem,
} from '@/api/account'
import { CutTabs } from '@/components/ui/cut-tabs'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { useAuth } from '@/lib/auth'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { grantedQuota, requestLabel, requestedQuota } from '@/lib/display'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'
import { cn, formatBytes } from '@/lib/utils'

const MB = 1024 * 1024

/* ============================================================
   მოთხოვნების სექცია (Tasks 1.5) — ადრე ადმინის ტაბი იყო.

   ერთ გვერდზე ორივე მხარეა: ადმინისთვის — ყველას მოთხოვნები დასამტკიცებლად,
   ყველასთვის — **ჩემი** მოთხოვნები (ადრე `/modules`-ზე ეკიდა და ტვირთავდა).

   **სია ცხრილია (Tasks §5).** შენი სიტყვები: „მოთხოვნები … მას დეითეიბლის
   მსგავსი სორტირება ჰქონდეს, ასევე სერჩი და გვერდზე რამდენი გამოჩნდეს".

   ⚠️ **„რიგში" მყოფიც ცხრილშია და არა ბარათებად.** ის ერთადერთი ჭრილია,
   სადაც მოქმედება ხდება, მაგრამ სწორედ ამიტომ **ფორმაა და არა სტრიქონი** —
   შენიშვნის ტექსტარეა და (კვოტაზე) მეგაბაიტების ველი უჯრაში არ ეტევა.
   ორივე „განხილვის" მოდალშია, ე.ი. ოთხივე ჭრილს ერთი ხედი, ერთი სორტირება
   და ერთი ძებნა აქვს.
   ============================================================ */

/**
 * **ჭრილები ბარათებად** (2026-09-15, შენი მითითებით: „მინდა მსგავსი
 * ვიზუალის იყოს, რაც მაქვს აუდიტ-ლოგში").
 *
 * ⚠️ **ხატულა და ტონი `lib/cutStyle.ts`-შია და აქ აღარ იწერება** (Tasks §2):
 * იმავე ცნებებს — „რიგი / დამტკიცებული / უარყოფილი" — სხვა ჭრილებიც
 * ხატავენ, ლოკალური ასლი კი პირველივე შესწორებაზე დაშორდებოდა.
 */
const STATUSES = ['pending', 'approved', 'rejected', 'all'] as const

/**
 * ტიპის ხატულა.
 *
 * ⚠️ **`lib/cutStyle.ts`-ში განზრახ არ ემატება** — ის ურთიერთგამომრიცხავი
 * **ჭრილების** რეესტრია (ბარათები), აქ კი ტიპი **სვეტია**: მისი როლი
 * სტრიქონის მონიშვნაა და არა სიის გაფილტვრა.
 */
const TYPE_ICON = {
  module_access: Boxes,
  storage_increase: HardDrive,
  genre_delete: Tags,
} as const

export function RequestsPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const fmt = useDateFormat()
  // Tasks 1.6 — მოთხოვნების სექცია როლის უფლებაზეც იხსნება
  const { canAdmin } = useAuth()
  const isAdmin = canAdmin('requests')

  const [status, setStatus] = useState<string>('pending')
  const [open, setOpen] = useState<ApprovalRequestItem | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-requests', status],
    queryFn: () => fetchAdminRequests(status),
    enabled: isAdmin,
  })
  const items = data?.items ?? []
  const counts = data?.counts

  const { data: mine = [] } = useQuery({ queryKey: ['my-requests'], queryFn: fetchMyRequests })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-requests'] })
    qc.invalidateQueries({ queryKey: ['my-requests'] })
    qc.invalidateQueries({ queryKey: ['admin-users'] })
    qc.invalidateQueries({ queryKey: ['pending-count'] })
    qc.invalidateQueries({ queryKey: ['modules'] })
    qc.invalidateQueries({ queryKey: ['genres'] })
    // 17.4 — დამტკიცება კვოტას ცვლის, ე.ი. საცავის ხედიც უნდა განახლდეს
    qc.invalidateQueries({ queryKey: ['storage'] })
  }

  const approve = useMutation({
    mutationFn: ({ id, note, granted }: { id: number; note?: string; granted?: number }) =>
      approveRequest(id, note, granted),
    onSuccess: () => {
      invalidate()
      setOpen(null)
      toast({ title: t('admin.approved'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const reject = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => rejectRequest(id, note),
    onSuccess: () => {
      invalidate()
      setOpen(null)
      toast({ title: t('admin.rejected'), variant: 'info' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const cancel = useMutation({
    mutationFn: cancelRequest,
    onSuccess: invalidate,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const label = (r: ApprovalRequestItem) => requestLabel(r, i18n.language, t)
  const typeLabel = (r: ApprovalRequestItem) => t(`requests.type.${r.type}`)

  /* ⚠️ სვეტები `useMemo`-შია: `DataTable`-ის ფილტრაცია და სორტირება
     `columns`-ზეა დამოკიდებული, ე.ი. ყოველ რენდერზე ახალი მასივი მთელ
     სიას თავიდან გადაალაგებდა. */
  const columns = useMemo<DataColumn<ApprovalRequestItem>[]>(
    () => [
      {
        key: 'type',
        label: t('requests.col.type'),
        className: 'w-40',
        value: (r) => typeLabel(r),
        render: (r) => {
          const Icon = TYPE_ICON[r.type]
          return (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
              <Icon className="size-4 shrink-0" />
              {typeLabel(r)}
            </span>
          )
        },
      },
      {
        key: 'request',
        label: t('requests.col.request'),
        value: (r) => label(r),
        render: (r) => (
          <button
            type="button"
            onClick={() => setOpen(r)}
            className="cursor-pointer text-left font-medium transition-colors hover:text-primary"
          >
            {label(r)}
          </button>
        ),
      },
      {
        key: 'user',
        label: t('requests.col.user'),
        value: (r) => r.user?.display_name ?? '',
        render: (r) => (
          <span className="block min-w-0">
            <span className="block truncate">{r.user?.display_name ?? '—'}</span>
            <span className="block truncate text-xs text-muted-foreground">{r.user?.email}</span>
          </span>
        ),
      },
      {
        key: 'created_at',
        label: t('requests.col.date'),
        className: 'w-40',
        /* ⚠️ სორტირება **ნედლ ISO-ზეა** და არა დახატულ ტექსტზე — ფორმატირებული
           თარიღი ლექსიკოგრაფიულად სულ სხვა რიგს აწყობს. */
        value: (r) => (r.created_at ? Date.parse(r.created_at) : 0),
        render: (r) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {fmt.dateTime(r.created_at)}
          </span>
        ),
      },
      {
        key: 'status',
        label: t('requests.col.status'),
        className: 'w-32',
        value: (r) => t(`requests.status.${r.status}`),
        render: (r) => (
          <Badge
            className={cn(
              r.status === 'approved' && 'bg-secondary text-gold',
              r.status === 'rejected' && 'bg-destructive/15 text-destructive',
              r.status === 'pending' && 'bg-secondary',
            )}
          >
            {t(`requests.status.${r.status}`)}
          </Badge>
        ),
      },
      {
        key: 'actions',
        label: t('requests.col.actions'),
        className: 'w-32 text-right',
        render: (r) => (
          <Button size="sm" variant="outline" onClick={() => setOpen(r)}>
            {r.status === 'pending' ? t('requests.review') : t('requests.details')}
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language, fmt.dateTime],
  )

  return (
    <PageContainer>
      <PageHeader
        tool="requests"
        title={t('admin.requests')}
        hint={<InfoHint info={isAdmin ? t('admin.requestsSubtitle') : t('admin.requestsSubtitleUser')} />}
      />

      {/* ---------- ადმინის ხედი ---------- */}
      {isAdmin && (
        <section className="mb-8">
          {/* ⚠️ ოთხი სტატუსის ბარათი ცხრილის **თავზე** რჩება და ფასეტი
              განზრახ **არ** გამორიცხავს საკუთარ ჭრილს (აუდიტისგან
              განსხვავებით): ოთხი სტატუსი ურთიერთგამომრიცხავია, ე.ი.
              „გამორიცხე საკუთარი თავი" ყველა ბარათზე ჯამს დაწერდა. */}
          <div className="mb-4">
            <CutTabs
              options={STATUSES.map((key) => ({
                key,
                label: t(`requests.status.${key}`),
                count: counts?.[key],
              }))}
              value={status}
              onChange={(key) => setStatus(key as (typeof STATUSES)[number])}
            />
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <DataTable
              rows={items}
              columns={columns}
              rowKey={(r) => r.id}
              defaultSort={{ key: 'created_at', dir: 'desc' }}
              minWidth="880px"
              searchPlaceholder={t('requests.search')}
              /* ⚠️ ძებნა მოდულისა და ჟანრის სახელს **ორივე ენაზე** ეძებს —
                 თორემ იმავე ჩანაწერს ინტერფეისის ენის მიხედვით სხვადასხვა
                 პასუხი ექნებოდა. */
              searchOf={(r) => [
                typeLabel(r),
                label(r),
                r.user?.display_name,
                r.user?.email,
                r.module?.name_ka,
                r.module?.name_en,
                r.genre?.name_ka,
                r.genre?.name_en,
                r.message,
                r.review_note,
                r.reviewer?.display_name,
              ]}
              empty={
                <EmptyState
                  icon={<Inbox className="size-6" />}
                  title={t('admin.noRequests')}
                  hint={t('requests.emptyHint')}
                />
              }
            />
          )}
        </section>
      )}

      {/* ---------- ჩემი მოთხოვნები ---------- */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
          {t('modules.myRequests')}
        </h2>

        {!mine.length ? (
          <p className="text-sm text-muted-foreground">
            {t('admin.noOwnRequests')}{' '}
            <Link to="/modules" className="text-primary hover:text-primary/70">
              {t('modules.title')}
            </Link>
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {mine.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 border-b border-border pb-2 last:border-b-0 last:pb-0"
              >
                <span className="font-medium">{label(r)}</span>
                <span
                  className={
                    r.status === 'approved'
                      ? 'text-gold'
                      : r.status === 'rejected'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                  }
                >
                  {t(`requests.status.${r.status}`)}
                </span>
                {r.review_note && <span className="text-xs text-muted-foreground">— {r.review_note}</span>}
                {r.status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => cancel.mutate(r.id)}
                    title={t('modules.cancelRequest')}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <ReviewDialog
          request={open}
          onClose={() => setOpen(null)}
          busy={approve.isPending || reject.isPending}
          onApprove={(note, granted) => approve.mutate({ id: open.id, note, granted })}
          onReject={(note) => reject.mutate({ id: open.id, note })}
        />
      )}
    </PageContainer>
  )
}

/* ============================================================
   განხილვის ფანჯარა (Tasks §5.2).

   ⚠️ **შენიშვნა უარყოფასაც ეხება** და არა მხოლოდ დამტკიცებას — ერთი ველი,
   ორივე ღილაკი, ზუსტად როგორც ბარათებში იყო.
   ============================================================ */
function ReviewDialog({
  request: r,
  onClose,
  onApprove,
  onReject,
  busy,
}: {
  request: ApprovalRequestItem
  onClose: () => void
  onApprove: (note: string | undefined, granted: number | undefined) => void
  onReject: (note: string | undefined) => void
  busy: boolean
}) {
  const { t, i18n } = useTranslation()
  const fmt = useDateFormat()

  const [note, setNote] = useState('')
  // 17.4 — რამდენს ვაძლევთ სინამდვილეში (MB). ცარიელი = მოთხოვნილი ზუსტად.
  const [grant, setGrant] = useState('')

  const pending = r.status === 'pending'

  /**
   * ⚠️ **ცარიელი ველი ნიშნავს „ზუსტად რაც მოითხოვა"** — `undefined` backend-ს
   * payload-ის საკუთარი რიცხვის აღებას აიძულებს. `0`-ის გაგზავნა
   * `storage_request_out_of_range` 422-ს დააბრუნებდა და მუშა დამტკიცება
   * აუხსნელ შეცდომად იქცეოდა.
   */
  const grantBytes = () => {
    const mb = Number(grant)
    return grant && Number.isFinite(mb) && mb > 0 ? Math.round(mb) * MB : undefined
  }

  const granted = grantedQuota(r)

  return (
    <ModalShell title={requestLabel(r, i18n.language, t)} onClose={onClose}>
      <div className="mt-4 space-y-4">
        {/* ---------- ვინ და როდის ---------- */}
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">{t('requests.col.user')}</dt>
          <dd>
            {r.user?.display_name ?? '—'}
            {r.user?.email && <span className="text-muted-foreground"> · {r.user.email}</span>}
          </dd>

          <dt className="text-muted-foreground">{t('requests.col.date')}</dt>
          <dd>{fmt.dateTime(r.created_at)}</dd>

          <dt className="text-muted-foreground">{t('requests.col.status')}</dt>
          <dd>
            {t(`requests.status.${r.status}`)}
            {r.reviewer && (
              <span className="text-muted-foreground">
                {' · '}
                {t('requests.reviewedBy', { name: r.reviewer.display_name })}
              </span>
            )}
          </dd>
        </dl>

        {r.message && (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm italic">„{r.message}"</p>
        )}

        {/* ⚠️ ჟანრის წაშლა **გლობალურია** — ეს ერთადერთი ადგილია, სადაც ადმინი
            დამტკიცებამდე ხედავს, რას შლის (Tasks §5.3). ამიტომ ის მოდალის
            სხეულშია და არა გვერდით გადაწეულ უჯრაში. */}
        {r.type === 'genre_delete' && r.payload && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {t('admin.genreDeleteWarning', {
              movies: (r.payload.movies_count as number) ?? 0,
              series: (r.payload.series_count as number) ?? 0,
            })}
          </p>
        )}

        {/* 17.4 — ლიმიტის კონტექსტი მოთხოვნის მომენტისთვის */}
        {r.type === 'storage_increase' && (
          <p className="text-xs text-muted-foreground">
            {t('admin.storageRequestContext', {
              used: formatBytes(Number(r.payload?.used_bytes ?? 0)),
              current: formatBytes(Number(r.payload?.current_bytes ?? 0)),
            })}
            {granted != null &&
              granted !== requestedQuota(r) &&
              ` · ${t('admin.storageGranted', { granted: formatBytes(granted) })}`}
          </p>
        )}

        {pending ? (
          <>
            {/* მოთხოვნილზე ნაკლების მიცემა უარი არაა (17.4) */}
            {r.type === 'storage_increase' && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t('requests.grantLabel')}</span>
                <span className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={10}
                    step={10}
                    className="w-32"
                    placeholder={String(Math.round(requestedQuota(r) / MB))}
                    value={grant}
                    onChange={(e) => setGrant(e.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">MB</span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{t('requests.grantHint')}</span>
              </label>
            )}

            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t('requests.noteLabel')}</span>
              <Textarea
                rows={3}
                placeholder={t('admin.notePlaceholder')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={onClose}>
                {t('actions.cancel')}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => onReject(note || undefined)}>
                <X className="size-4" />
                {t('admin.reject')}
              </Button>
              <Button disabled={busy} onClick={() => onApprove(note || undefined, grantBytes())}>
                <Check className="size-4" />
                {t('admin.approve')}
              </Button>
            </div>
          </>
        ) : (
          <>
            {r.review_note && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">— {r.review_note}</p>
            )}
            <div className="flex justify-end border-t border-border pt-4">
              <Button variant="outline" onClick={onClose}>
                {t('actions.close')}
              </Button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}
