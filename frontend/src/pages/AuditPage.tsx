import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ChevronRight, Lock, Search, Trash2 } from 'lucide-react'
import {
  fetchAuditLogs,
  fetchAuditMeta,
  fetchAuditPlan,
  purgeAuditLogs,
  type AuditEntry,
  type AuditFilters,
} from '@/api/audit'
import { useAuth } from '@/lib/auth'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateRangePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   აუდიტ-ლოგი (Tasks §4.4/§4.7) — `/audit`, `admin:audit` უფლებით.

   ⚠️ **სია ყოველთვის გვერდებზეა.** ლოგი სამუდამოდ ინახება და თვეში
   ათასობით რიგით იზრდება (§4.1) — „ყველაფრის ერთად ჩვენება" აქ არც
   ერთხელ არ ხდება.

   ⚠️ **„ყველას მონიშვნა" გაფილტრულის ფარგლებშია** (§4.7), მაგრამ მონიშვნა
   მხოლოდ **მიმდინარე გვერდის** რიგებს ეხება — სწორედ ამიტომ არსებობს
   ცალკე „ყველაფრის წაშლა ამ ფილტრით", რომელიც id-ებს საერთოდ არ აგზავნის.
   ორივე ერთსა და იმავე ფილტრზე დგას, ე.ი. ვერასდროს გასცდება ნაჩვენებს.

   ⚠️ **წაშლა შეუქცევადია** — `purge`-ის სტილით, სიტყვის ჩაწერით.
   ============================================================ */

const CONFIRM_WORD = 'DELETE'

const PER_PAGE = 25

/** მოქმედების ფერი — ლოგი სწრაფად უნდა იკითხებოდეს, არა აიწერებოდეს */
const ACTION_TONE: Record<string, string> = {
  create: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  update: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  delete: 'bg-destructive/15 text-destructive',
  chat_delete: 'bg-destructive/15 text-destructive',
  login: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  logout: 'bg-muted text-muted-foreground',
  register: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  visit: 'bg-muted text-muted-foreground',
}

export function AuditPage() {
  const { t, i18n } = useTranslation()
  const { canAdmin } = useAuth()
  const { toast } = useToast()
  const qc = useQueryClient()
  const fmt = useDateFormat()

  /** გამოყენებული ფილტრი — სია, გეგმა და წაშლა სამივე მასზე დგას */
  const [filters, setFilters] = useState<AuditFilters>({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number[]>([])
  const [diff, setDiff] = useState<AuditEntry | null>(null)
  const [confirming, setConfirming] = useState<'selected' | 'filter' | null>(null)
  const [confirmWord, setConfirmWord] = useState('')

  const allowed = canAdmin('audit')
  const canDelete = canAdmin('audit', 'delete')

  const { data: meta } = useQuery({
    queryKey: ['audit-meta'],
    queryFn: fetchAuditMeta,
    enabled: allowed,
  })

  const { data: pageData, isLoading } = useQuery({
    queryKey: ['audit', filters, page],
    queryFn: () => fetchAuditLogs(filters, page, PER_PAGE),
    enabled: allowed,
    placeholderData: keepPreviousData,
  })

  const { data: plan } = useQuery({
    queryKey: ['audit-plan', filters],
    queryFn: () => fetchAuditPlan(filters),
    enabled: allowed && confirming === 'filter',
  })

  const purge = useMutation({
    mutationFn: (ids?: number[]) => purgeAuditLogs(filters, ids),
    onSuccess: (deleted) => {
      qc.invalidateQueries({ queryKey: ['audit'] })
      qc.invalidateQueries({ queryKey: ['audit-plan'] })
      setSelected([])
      setConfirming(null)
      setConfirmWord('')
      toast({ title: t('audit.deleted', { count: deleted }), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const rows = pageData?.data ?? []
  const total = pageData?.meta.total ?? 0
  const lastPage = pageData?.meta.last_page ?? 1

  /** მონიშვნა დაცულ რიგებს გვერდს უვლის — ისინი ისედაც არ იშლება */
  const selectableIds = rows.filter((r) => !r.is_protected).map((r) => r.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id))

  const apply = (next: Partial<AuditFilters>) => {
    setFilters((f) => ({ ...f, ...next }))
    setPage(1)
    setSelected([])
  }

  const toggle = (list: string[] | undefined, value: string) => {
    const current = list ?? []
    return current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  }

  const moduleName = (key: string) => {
    const found = meta?.modules.find((m) => m.key === key)
    if (!found) return key
    // ფსევდო-მოდულს (`account`, `chat`…) `modules` რიგი არ აქვს — სახელი i18n-იდან
    const localised = i18n.language === 'ka' ? found.name_ka : found.name_en
    return localised || t(`audit.modules.${key}`, key)
  }

  if (!allowed) return null

  return (
    <PageContainer>
      <PageHeader title={t('audit.title')} subtitle={t('audit.subtitle')} />

      {/* ---------- ფილტრები (§4.7-ის სამი ჭრილი) ---------- */}
      <section className="mb-6 space-y-4 rounded-xl border border-border bg-card/40 p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="audit-user">{t('audit.filters.user')}</Label>
            <Select
              value={filters.user_id ? String(filters.user_id) : 'all'}
              onValueChange={(v) => apply({ user_id: v === 'all' ? null : Number(v) })}
            >
              <SelectTrigger id="audit-user">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('audit.filters.allUsers')}</SelectItem>
                {meta?.users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name} · {u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-range">{t('audit.filters.period')}</Label>
            <DateRangePicker
              id="audit-range"
              value={{ from: filters.from ?? null, to: filters.to ?? null }}
              onChange={(range) => apply({ from: range.from, to: range.to })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-q">{t('audit.filters.search')}</Label>
            <div className="flex gap-2">
              <Input
                id="audit-q"
                value={search}
                placeholder={t('audit.filters.searchHint')}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && apply({ q: search })}
              />
              <Button variant="secondary" onClick={() => apply({ q: search })}>
                <Search className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t('audit.filters.actions')}</Label>
          <div className="flex flex-wrap gap-1.5">
            {(meta?.actions ?? []).map((action) => (
              <button
                key={action}
                onClick={() => apply({ actions: toggle(filters.actions, action) })}
                className={cn(
                  'cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors',
                  filters.actions?.includes(action)
                    ? 'bg-secondary font-medium'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {t(`audit.actions.${action}`, action)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t('audit.filters.modules')}</Label>
          <div className="fb-scroll flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {(meta?.modules ?? []).map((m) => (
              <button
                key={m.key}
                onClick={() => apply({ modules: toggle(filters.modules, m.key) })}
                className={cn(
                  'cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors',
                  filters.modules?.includes(m.key)
                    ? 'bg-secondary font-medium'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {moduleName(m.key)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- მოქმედებები მონიშნულებზე (§4.7) ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">{t('audit.total', { count: total })}</span>
        {canDelete && (
          <>
            <Button
              variant="destructive"
              size="sm"
              disabled={selected.length === 0}
              onClick={() => setConfirming('selected')}
            >
              <Trash2 className="size-4" />
              {t('audit.deleteSelected', { count: selected.length })}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming('filter')}>
              {t('audit.deleteFiltered')}
            </Button>
          </>
        )}
      </div>

      {/* ---------- სია ---------- */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 p-2">
                {canDelete && (
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) =>
                      setSelected(v ? selectableIds : [])
                    }
                    aria-label={t('audit.selectAll')}
                  />
                )}
              </th>
              <th className="p-2">{t('audit.columns.when')}</th>
              <th className="p-2">{t('audit.columns.who')}</th>
              <th className="p-2">{t('audit.columns.action')}</th>
              <th className="p-2">{t('audit.columns.module')}</th>
              <th className="p-2">{t('audit.columns.subject')}</th>
              <th className="p-2">{t('audit.columns.how')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  {t('common.loading')}
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  {t('audit.empty')}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setDiff(row)}
                className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40"
              >
                <td className="p-2" onClick={(e) => e.stopPropagation()}>
                  {canDelete &&
                    (row.is_protected ? (
                      // §4.6 — ეს რიგი აღდგენის აღრიცხვაა და არ იშლება
                      <Lock className="size-4 text-muted-foreground" aria-label={t('audit.protected')} />
                    ) : (
                      <Checkbox
                        checked={selected.includes(row.id)}
                        onCheckedChange={(v) =>
                          setSelected((s) => (v ? [...s, row.id] : s.filter((id) => id !== row.id)))
                        }
                      />
                    ))}
                </td>
                <td className="whitespace-nowrap p-2 text-muted-foreground">
                  {fmt.dateTime(row.created_at)}
                </td>
                <td className="p-2">{row.user?.username ?? row.user_label ?? '—'}</td>
                <td className="p-2">
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 text-xs',
                      ACTION_TONE[row.action] ?? 'bg-muted text-muted-foreground',
                    )}
                  >
                    {t(`audit.actions.${row.action}`, row.action)}
                  </span>
                </td>
                <td className="p-2 text-muted-foreground">
                  {row.module ? moduleName(row.module) : '—'}
                </td>
                <td className="max-w-[22rem] truncate p-2">
                  {row.subject?.label ?? (row.subject ? `#${row.subject.id}` : '—')}
                  {row.subject && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {t(`audit.subjects.${row.subject.type}`, row.subject.type)}
                    </span>
                  )}
                </td>
                <td className="max-w-[16rem] truncate p-2 text-xs text-muted-foreground">
                  {row.method} /{row.route}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- გვერდები ---------- */}
      {lastPage > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-muted-foreground">
            {t('audit.pageOf', { page, last: lastPage })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {diff && <DiffModal entry={diff} onClose={() => setDiff(null)} />}

      {confirming && (
        <ModalShell title={t('audit.confirmTitle')} destructive onClose={() => setConfirming(null)}>
          <div className="mt-4 space-y-4 text-sm">
            <p className="flex items-start gap-2 text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                {confirming === 'selected'
                  ? t('audit.confirmSelected', { count: selected.length })
                  : t('audit.confirmFiltered', { count: plan?.total ?? 0 })}
              </span>
            </p>
            {confirming === 'filter' && (plan?.protected ?? 0) > 0 && (
              // §4.6 — ცხადად ითქმის, რატომ არ ემთხვევა რიცხვები
              <p className="text-xs text-muted-foreground">
                {t('audit.protectedNote', { count: plan?.protected ?? 0 })}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="audit-confirm">{t('audit.confirmWord', { word: CONFIRM_WORD })}</Label>
              <Input
                id="audit-confirm"
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                placeholder={CONFIRM_WORD}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirming(null)}>
                {t('actions.cancel')}
              </Button>
              <Button
                variant="destructive"
                disabled={confirmWord !== CONFIRM_WORD || purge.isPending}
                onClick={() => purge.mutate(confirming === 'selected' ? selected : undefined)}
              >
                {t('audit.deleteNow')}
              </Button>
            </div>
          </div>
        </ModalShell>
      )}
    </PageContainer>
  )
}

/* ============================================================
   diff — ძველი და ახალი **გვერდიგვერდ** (§4.1-ის პირდაპირი მოთხოვნა).

   ⚠️ გასაღებების სია ორივე მხრიდან იკრიბება: `update`-ზე ისინი ემთხვევა,
   `create`/`delete`-ზე კი მხოლოდ ერთი მხარეა შევსებული.
   ============================================================ */
function DiffModal({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const { t } = useTranslation()
  const fmt = useDateFormat()

  const keys = useMemo(() => {
    const merged = new Set([
      ...Object.keys(entry.old_values ?? {}),
      ...Object.keys(entry.new_values ?? {}),
    ])
    return [...merged].sort()
  }, [entry])

  const cell = (value: unknown) => {
    if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>
    if (typeof value === 'object') return <code className="text-xs">{JSON.stringify(value)}</code>
    return String(value)
  }

  return (
    <ModalShell title={t('audit.diffTitle')} wide onClose={onClose}>
      <div className="mt-4 space-y-4 text-sm">
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <Meta label={t('audit.columns.when')} value={fmt.dateTime(entry.created_at)} />
          <Meta label={t('audit.columns.who')} value={entry.user?.username ?? entry.user_label ?? '—'} />
          <Meta label={t('audit.columns.action')} value={t(`audit.actions.${entry.action}`, entry.action)} />
          <Meta label={t('audit.columns.module')} value={entry.module ?? '—'} />
          <Meta label={t('audit.columns.subject')} value={entry.subject?.label ?? '—'} />
          <Meta label={t('audit.columns.how')} value={`${entry.method ?? ''} /${entry.route ?? ''}`} />
          <Meta label={t('audit.columns.ip')} value={entry.ip ?? '—'} />
        </dl>

        {keys.length === 0 ? (
          <p className="text-muted-foreground">{t('audit.noValues')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">{t('audit.field')}</th>
                  <th className="p-2">{t('audit.oldValue')}</th>
                  <th className="p-2">{t('audit.newValue')}</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key} className="border-t border-border align-top">
                    <td className="p-2 font-medium">{key}</td>
                    <td className="max-w-[18rem] break-words p-2 text-destructive/90">
                      {cell(entry.old_values?.[key])}
                    </td>
                    <td className="max-w-[18rem] break-words p-2 text-emerald-600 dark:text-emerald-400">
                      {cell(entry.new_values?.[key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {entry.context && (
          <div>
            <p className="mb-1 text-xs uppercase text-muted-foreground">{t('audit.context')}</p>
            <code className="block rounded-lg bg-muted/40 p-2 text-xs">
              {JSON.stringify(entry.context)}
            </code>
          </div>
        )}
      </div>
    </ModalShell>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 truncate">{value}</dd>
    </div>
  )
}
