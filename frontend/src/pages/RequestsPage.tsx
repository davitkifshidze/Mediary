import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import {
  approveRequest,
  cancelRequest,
  fetchAdminRequests,
  fetchMyRequests,
  rejectRequest,
  type ApprovalRequestItem,
} from '@/api/account'
import { CutTabs } from '@/components/ui/cut-tabs'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { grantedQuota, requestLabel, requestedQuota } from '@/lib/display'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

export function RequestsPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  // Tasks 1.6 — მოთხოვნების სექცია როლის უფლებაზეც იხსნება
  const { canAdmin } = useAuth()
  const isAdmin = canAdmin('requests')

  const [status, setStatus] = useState<string>('pending')
  const [notes, setNotes] = useState<Record<number, string>>({})
  // 17.4 — რამდენს ვაძლევთ სინამდვილეში (MB). ცარიელი = მოთხოვნილი ზუსტად.
  const [grants, setGrants] = useState<Record<number, string>>({})

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
      toast({ title: t('admin.approved'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const reject = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => rejectRequest(id, note),
    onSuccess: () => {
      invalidate()
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

  /** ცარიელი ველი = მოთხოვნილი ზუსტად; `undefined` backend-ს payload-ს ამოაღებინებს */
  const grantOf = (r: ApprovalRequestItem) => {
    const mb = Number(grants[r.id])
    return grants[r.id] && Number.isFinite(mb) && mb > 0 ? Math.round(mb) * MB : undefined
  }

  return (
    <PageContainer>
      <PageHeader
        tool="requests"
        title={t('admin.requests')}
        subtitle={isAdmin ? t('admin.requestsSubtitle') : t('admin.requestsSubtitleUser')}
      />

      {/* ---------- ადმინის ხედი ---------- */}
      {isAdmin && (
        <section className="mb-8">
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

          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {!isLoading && !items.length && (
            <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
              {t('admin.noRequests')}
            </p>
          )}

          <div className="space-y-3">
            {items.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{label(r)}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.user?.display_name} · {r.user?.email}
                      {r.created_at && ` · ${new Date(r.created_at).toLocaleString()}`}
                    </p>
                    {r.message && <p className="mt-2 text-sm italic">„{r.message}"</p>}

                    {/* ჟანრის წაშლა გლობალურია — ადმინს ვაჩვენებთ რამდენ ჩანაწერს შეეხება */}
                    {r.type === 'genre_delete' && r.payload && (
                      <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        {t('admin.genreDeleteWarning', {
                          movies: (r.payload.movies_count as number) ?? 0,
                          series: (r.payload.series_count as number) ?? 0,
                        })}
                      </p>
                    )}

                    {/* 17.4 — ლიმიტის კონტექსტი მოთხოვნის მომენტისთვის */}
                    {r.type === 'storage_increase' && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t('admin.storageRequestContext', {
                          used: formatBytes(Number(r.payload?.used_bytes ?? 0)),
                          current: formatBytes(Number(r.payload?.current_bytes ?? 0)),
                        })}
                        {grantedQuota(r) != null &&
                          grantedQuota(r) !== requestedQuota(r) &&
                          ` · ${t('admin.storageGranted', { granted: formatBytes(grantedQuota(r)!) })}`}
                      </p>
                    )}
                  </div>

                  {r.status === 'pending' ? (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          approve.mutate({ id: r.id, note: notes[r.id], granted: grantOf(r) })
                        }
                        disabled={approve.isPending}
                      >
                        <Check className="size-4" />
                        {t('admin.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reject.mutate({ id: r.id, note: notes[r.id] })}
                        disabled={reject.isPending}
                      >
                        <X className="size-4" />
                        {t('admin.reject')}
                      </Button>
                    </div>
                  ) : (
                    <span
                      className={cn(
                        'shrink-0 text-xs',
                        r.status === 'approved' ? 'text-gold' : 'text-destructive',
                      )}
                    >
                      {t(`requests.status.${r.status}`)}
                      {r.reviewer && ` · ${r.reviewer.display_name}`}
                    </span>
                  )}
                </div>

                {r.status === 'pending' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {/* მოთხოვნილზე ნაკლების მიცემა უარი არაა (17.4) — ცარიელი = ზუსტად მოთხოვნილი */}
                    {r.type === 'storage_increase' && (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={10}
                          step={10}
                          className="w-28"
                          placeholder={String(Math.round(requestedQuota(r) / MB))}
                          value={grants[r.id] ?? ''}
                          onChange={(e) => setGrants((g) => ({ ...g, [r.id]: e.target.value }))}
                        />
                        <span className="text-xs text-muted-foreground">MB</span>
                      </div>
                    )}
                    <Textarea
                      className="min-w-52 flex-1"
                      rows={1}
                      placeholder={t('admin.notePlaceholder')}
                      value={notes[r.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    />
                  </div>
                )}
                {r.status !== 'pending' && r.review_note && (
                  <p className="mt-2 text-xs text-muted-foreground">— {r.review_note}</p>
                )}
              </div>
            ))}
          </div>
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
    </PageContainer>
  )
}
