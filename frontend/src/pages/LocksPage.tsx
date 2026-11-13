import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, LockOpen, X } from 'lucide-react'
import { fetchLocks, relockAll, removeLocks, type LockRow } from '@/api/lockBook'
import { forgetLockedContent } from '@/lib/locks'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { MEDIA } from '@/lib/media'
import { isMediaKey, moduleName, useModules } from '@/lib/modules'
import { useClientPages } from '@/lib/paged'
import { LIST_PAGE_SIZE } from '@/lib/pageSize'
import { useContentLang } from '@/lib/settings'
import { TOOL_SECTIONS } from '@/lib/toolSections'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Badge, CountBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { PasswordInput } from '@/components/ui/secret-input'

/* ============================================================
   **„ჩაკეტილები"** — `/locks`: ყველა ჩანაწერი, რომელზეც ჩემი პაროლი დევს.

   აქამდე ჩაკეტილს მხოლოდ თითო მოდულის ფილტრი აჩვენებდა და პაროლი სათითაოდ
   იხსნებოდა. აქ ლოკები მოდულებად არის დაჯგუფებული (მოდულის ფერითა და აიქონით):
   სახელი, მინიშნება, ღიაა თუ არა ამ სესიაში და როდის ჩაიკეტა.

   ⚠️ **პაროლის ერთად მოხსნა ყოველთვის ანგარიშის პაროლს ითხოვს** — ერთხელ მთელ
   მონიშვნაზე, სესიაში გახსნილებზეც: ერთი დაჭერა ყველაფერს აშიშვლებს და ღია
   ბრაუზერთან მისულს ის არ უნდა ეყოს.
   ⚠️ „ყველას ისევ ჩაკეტვა" პაროლებს არ ეხება — მხოლოდ ამ სესიაში გახსნილებს ხურავს.
   ⚠️ დაუხსნელი ჩანაწერიდან სერვერი მხოლოდ სახელს აგზავნის (ბოქლომიანი ბარათის წესი).
   ============================================================ */

/** ლოკის ჩანაწერის გვერდი; გალერეის ალბომს საკუთარი გვერდი არ აქვს — ალბომების ჭრილია */
function lockPath(row: LockRow): string {
  if (isMediaKey(row.type)) return `${MEDIA[row.type].detailBase}/${row.record_id}`
  if (row.type === 'cast_member') return `/actors/${row.record_id}`
  if (row.type === 'personal') return `/personal/people/${row.record_id}`
  if (row.type === 'personal_album') return `/personal/albums/${row.record_id}`

  return '/gallery/albums'
}

export function LocksPage() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set())
  const [confirming, setConfirming] = useState(false)

  const locks = useQuery({ queryKey: ['locks'], queryFn: fetchLocks })
  const rows = useMemo(() => locks.data ?? [], [locks.data])

  // ჯგუფი მოდულია (პირადი გალერეის პიროვნება და ალბომი ერთ ჯგუფშია); რიგი სერვერისაა
  const groups = useMemo(() => {
    const byModule = new Map<string, LockRow[]>()
    for (const row of rows) byModule.set(row.module, [...(byModule.get(row.module) ?? []), row])
    return [...byModule.entries()]
  }, [rows])

  const relock = useMutation({
    mutationFn: relockAll,
    onSuccess: () => {
      toast({ title: t('locks.relocked'), variant: 'success' })
      // დახურული ჩანაწერი ყველა სიიდან ქრება — ეკრანზე თავიდან იკითხება, ეკრანს მიღმა ქეში იშლება
      forgetLockedContent(qc)
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const allIds = rows.map((row) => row.id)
  const allPicked = allIds.length > 0 && allIds.every((id) => picked.has(id))
  const anyOpen = rows.some((row) => row.unlocked)

  const pick = (ids: number[], on: boolean) =>
    setPicked((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  return (
    <PageContainer>
      <PageHeader tool="locks" title={t('locks.title')} hint={<InfoHint wide info={t('locks.hint')} />} />

      {locks.isError ? (
        <QueryErrorState error={locks.error} onRetry={() => void locks.refetch()} retrying={locks.isFetching} />
      ) : locks.isLoading ? null : rows.length === 0 ? (
        <EmptyState title={t('locks.none')} hint={t('locks.noneHint')} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="mr-auto flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={allPicked} onCheckedChange={(on) => pick(allIds, on === true)} data-testid="locks-pick-all" />
              {t('locks.pickAll')}
            </label>
            <Button variant="outline" size="sm" disabled={!anyOpen || relock.isPending} onClick={() => relock.mutate()} data-testid="locks-relock">
              <Lock className="size-4" />
              {t('locks.relockAll')}
            </Button>
            <Button variant="outline" size="sm" disabled={picked.size === 0} onClick={() => setConfirming(true)} data-testid="locks-remove">
              <LockOpen className="size-4" />
              {t('locks.remove')}
              <CountBadge count={picked.size} />
            </Button>
          </div>

          <div className="space-y-4">
            {groups.map(([module, items]) => (
              <LockGroup key={module} module={module} rows={items} picked={picked} onPick={pick} />
            ))}
          </div>
        </>
      )}

      {confirming && (
        <RemoveLocksDialog
          ids={[...picked]}
          onClose={() => setConfirming(false)}
          onDone={() => {
            setConfirming(false)
            setPicked(new Set())
            // მოხსნილი ჩანაწერი სიებში, ძებნასა და ჯამებში ბრუნდება
            void qc.invalidateQueries()
          }}
        />
      )}
    </PageContainer>
  )
}

/** ერთი მოდულის ლოკები — მოდულის ფერითა და აიქონით, საკუთარი „ყველას" მონიშვნით და გვერდებით */
function LockGroup({
  module,
  rows,
  picked,
  onPick,
}: {
  module: string
  rows: LockRow[]
  picked: ReadonlySet<number>
  onPick: (ids: number[], on: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const { all: modules } = useModules()
  const pages = useClientPages(rows, LIST_PAGE_SIZE)

  const info = modules.find((m) => m.key === module)
  // მსახიობს მოდულის რიგი არ აქვს — მისი ჯგუფი ინსტრუმენტების „მსახიობების" ფერითა და აიქონითაა
  const Cast = TOOL_SECTIONS.actors.icon
  const color = info?.color ?? TOOL_SECTIONS.actors.color
  const name = info ? moduleName(info, i18n.language) : t('locks.cast')

  const ids = rows.map((row) => row.id)
  const allPicked = ids.every((id) => picked.has(id))
  const mixed = new Set(rows.map((row) => row.type)).size > 1

  return (
    <section className="rounded-lg border border-border bg-card p-4" data-testid="lock-group" data-module={module}>
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto flex min-w-0 items-center gap-2 text-base font-semibold">
          {info ? <ModuleIcon name={info.icon} className="size-4 shrink-0" style={{ color }} /> : <Cast className="size-4 shrink-0" style={{ color }} />}
          <span className="truncate">{name}</span>
          <CountBadge count={rows.length} />
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={allPicked} onCheckedChange={(on) => onPick(ids, on === true)} data-testid="lock-group-pick" />
          {t('locks.pickModule')}
        </label>
      </header>

      <ul className="space-y-1.5">
        {pages.shown.map((row) => (
          <LockItem key={row.id} row={row} typed={mixed} picked={picked.has(row.id)} onPick={(on) => onPick([row.id], on)} />
        ))}
      </ul>
      <Pagination className="mt-3" {...pages.pagination} />
    </section>
  )
}

function LockItem({ row, typed, picked, onPick }: { row: LockRow; typed: boolean; picked: boolean; onPick: (on: boolean) => void }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { date } = useDateFormat()

  const name = (lang === 'ka' ? row.title_ka || row.title : row.title || row.title_ka) || t('locks.unnamed')
  const meta: ReactNode[] = [
    typed ? t(`locks.type.${row.type}`) : null,
    row.hint ? t('locks.hintLine', { hint: row.hint }) : null,
    row.locked_at ? t('locks.lockedAt', { date: date(row.locked_at) }) : null,
  ].filter(Boolean)

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border border-border p-2.5" data-testid="lock-row" data-open={row.unlocked || undefined}>
      <Checkbox checked={picked} onCheckedChange={(on) => onPick(on === true)} aria-label={name} />
      <span className="min-w-0 flex-1 basis-56">
        <Link to={lockPath(row)} className="block truncate text-sm font-medium hover:text-primary" data-testid="lock-link">
          {name}
        </Link>
        {meta.length > 0 && <span className="mt-0.5 block text-xs text-muted-foreground">{meta.join(' · ')}</span>}
      </span>
      <Badge className="bg-secondary" data-testid="lock-state">
        {row.unlocked ? <LockOpen className="size-3.5 text-[var(--icon-ok)]" /> : <Lock className="size-3.5 text-muted-foreground" />}
        {t(row.unlocked ? 'locks.open' : 'locks.closed')}
      </Badge>
    </li>
  )
}

/** დადასტურება: ანგარიშის პაროლი ერთხელ მთელ მონიშვნაზე */
function RemoveLocksDialog({ ids, onClose, onDone }: { ids: number[]; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [password, setPassword] = useState('')

  const remove = useMutation({
    mutationFn: () => removeLocks(ids, password),
    onSuccess: (removed) => {
      toast({ title: t('locks.removed', { count: removed }), variant: 'success' })
      onDone()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t('locks.removeTitle')} onClose={onClose} destructive hint={t('locks.removeHint')}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (password !== '' && !remove.isPending) remove.mutate()
        }}
      >
        <p className="text-sm">{t('locks.removeConfirm', { count: ids.length })}</p>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="locks-account-password">{t('locks.accountPassword')}</Label>
          <PasswordInput id="locks-account-password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>

        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="size-4" />
            {t('confirm.cancel')}
          </Button>
          <Button type="submit" variant="destructive" disabled={password === '' || remove.isPending} data-testid="locks-confirm">
            <LockOpen className="size-4" />
            {t('locks.remove')}
          </Button>
        </ModalFooter>
      </form>
    </ModalShell>
  )
}
