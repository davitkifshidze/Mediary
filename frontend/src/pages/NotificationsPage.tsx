import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, BellDot, BellOff, CheckCheck, ChevronDown, Film, Layers, Loader2, Mail, MailOpen, Plus, Trash2, X } from 'lucide-react'
import {
  bulkNotifications,
  clearNotifications,
  deleteNotification,
  fetchNotifications,
  markNotificationUnread,
  markNotificationsRead,
  type AppNotification,
  type NotificationBulkAction,
  type NotificationPage,
} from '@/api/notifications'
import { setFranchiseReminder } from '@/api/media'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { notificationDetail, notificationIcon, notificationTitle } from '@/lib/notifications'
import { usePagedList } from '@/lib/paged'
import { cn } from '@/lib/utils'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import { Button } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { QueryErrorState } from '@/components/ui/query-error-state'
import { useQueue } from '@/components/ui/queue'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SelectMark } from '@/components/ui/select-mark'

/* ============================================================
   **შეტყობინებების სრული სია** — `/notifications`, ზარის „ყველას ნახვა".

   ზარის პანელი ბოლო ოცს აჩვენებს; აქ ყველაა — გვერდებად, ფილტრით („ყველა ·
   წაუკითხავი" და ტიპით), თითოზე წაკითხული / წაუკითხავი და წაშლა, მონიშნულებზე
   კი იგივე მოქმედებები ერთად.

   ⚠️ **ფილტრი მისამართშია** (`?show=unread&type=…&page=`): „უკან" და გაზიარებული
   ბმული იმავეს ხედავს.

   ⚠️ **დაჭერა წაკითხვაა და გადასვლაც** (თუ შეტყობინებას მისამართი აქვს);
   „წაუკითხავად" მას უკან აბრუნებს — „მოგვიანებით მივხედავ".
   ============================================================ */

/**
 * **„ფრანჩაიზს ნაწილი აკლია"** — შეტყობინებიდანვე: „დამატება" („აღმოჩენის" რიგით) და
 * „აღარ შემახსენო" ამ ნაწილზე ან მთელ ფრანჩაიზზე. გაჩუმება სერვერზე ამ ნაწილის /
 * ფრანჩაიზის შეტყობინებებსაც აშორებს, ამიტომ სია თავიდან იკითხება.
 */
function FranchisePartActions({ notification, onChanged }: { notification: AppNotification; onChanged: () => void }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { enqueue, isQueued } = useQueue()

  const tmdbId = Number(notification.data.tmdb_id) || 0
  const collectionId = Number(notification.data.collection_id) || 0
  const title = String(notification.data.title_en ?? notification.data.title_ka ?? '')
  const adding = isQueued(tmdbId, 'movie')

  const mute = useMutation({
    mutationFn: (whole: boolean) => setFranchiseReminder(collectionId, true, whole ? undefined : tmdbId),
    onSuccess: () => {
      toast({ title: t('franchise.muted'), variant: 'success' })
      onChanged()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (!tmdbId || !collectionId) return null

  return (
    <>
      <Button size="sm" disabled={adding} onClick={() => enqueue([{ tmdbId, title }], 'movie')}>
        {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {adding ? t('queue.queued') : t('actor.add')}
      </Button>
      <ActionMenu
        label={t('franchise.remindOff')}
        trigger={
          <Button variant="outline" size="sm" disabled={mute.isPending}>
            <BellOff className="size-4" />
            {t('franchise.remindOff')}
            <ChevronDown className="size-3.5" />
          </Button>
        }
      >
        <ActionMenuClose asChild>
          <button className={actionItemClass()} onClick={() => mute.mutate(false)}>
            <Film className="size-4 shrink-0" />
            {t('franchise.mutePart')}
          </button>
        </ActionMenuClose>
        <ActionMenuClose asChild>
          <button className={actionItemClass()} onClick={() => mute.mutate(true)}>
            <Layers className="size-4 shrink-0" />
            {t('franchise.muteAll')}
          </button>
        </ActionMenuClose>
      </ActionMenu>
    </>
  )
}

/** Radix-ის `Select` ცარიელ მნიშვნელობას არ იღებს */
const ALL_TYPES = 'all'

/** ჩადგმული სიების ზომა */
const PAGE_SIZE = 10

export function NotificationsPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const fmt = useDateFormat()
  const confirm = useConfirm()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const unreadOnly = params.get('show') === 'unread'
  const type = params.get('type') ?? ''

  const list = usePagedList<NotificationPage>({
    queryKey: ['notifications', 'page', { unreadOnly, type }],
    fetchPage: (page, per_page) => fetchNotifications({ unread: unreadOnly, type: type || undefined, page, per_page }),
    pageSize: PAGE_SIZE,
  })
  const items = list.items
  const counts = list.first
  const types = Object.entries(counts?.types ?? {})

  /* ---------- მონიშვნა ---------- */

  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  // ფილტრისა და გვერდის შეცვლაზე მონიშვნა იხსნება — უჩინარზე მოქმედება არ უნდა გავიდეს
  useEffect(() => setSelected(new Set()), [unreadOnly, type, list.pagination.page])

  const chosen = items.filter((n) => selected.has(n.id))
  const allOnPage = items.length > 0 && chosen.length === items.length

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  /* ---------- მოქმედებები ---------- */

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['notifications-counts'] })
  }
  const onError = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const read = useMutation({ mutationFn: (id?: string) => markNotificationsRead(id), onSuccess: refresh, onError })
  const unread = useMutation({ mutationFn: (id: string) => markNotificationUnread(id), onSuccess: refresh, onError })
  const remove = useMutation({ mutationFn: (id: string) => deleteNotification(id), onSuccess: refresh, onError })
  const clear = useMutation({ mutationFn: () => clearNotifications(), onSuccess: refresh, onError })
  const bulk = useMutation({
    mutationFn: (action: NotificationBulkAction) =>
      bulkNotifications(
        action,
        chosen.map((n) => n.id),
      ),
    onSuccess: () => {
      setSelected(new Set())
      refresh()
    },
    onError,
  })

  const setFilter = (key: 'show' | 'type', value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(key, value)
        else next.delete(key)
        next.delete('page')
        return next
      },
      { replace: true },
    )

  const open = (n: AppNotification) => {
    if (!n.read_at) read.mutate(n.id)
    if (n.route) navigate(n.route)
  }

  const askClear = async () => {
    if (await confirm({ title: t('notifications.clear'), description: t('notifications.clearConfirm'), variant: 'destructive' })) {
      clear.mutate()
    }
  }

  const askBulkDelete = async () => {
    const ok = await confirm({
      title: t('actions.delete'),
      description: t('notifications.bulkDeleteConfirm', { count: chosen.length }),
      confirmText: t('confirm.delete'),
      cancelText: t('confirm.cancel'),
      variant: 'destructive',
    })
    if (ok) bulk.mutate('delete')
  }

  return (
    <PageContainer>
      <PageHeader
        tool="notifications"
        title={t('notifications.title')}
        subtitle={counts ? t('notifications.summary', { total: counts.total, unread: counts.unread }) : undefined}
        hint={<InfoHint info={t('notifications.pageHint')} />}
        actions={
          <>
            {(counts?.unread ?? 0) > 0 && (
              <Button variant="outline" onClick={() => read.mutate(undefined)} disabled={read.isPending}>
                <CheckCheck className="size-4" />
                {t('notifications.markAll')}
              </Button>
            )}
            {(counts?.total ?? 0) > 0 && (
              <Button variant="destructiveOutline" onClick={() => void askClear()} disabled={clear.isPending}>
                <Trash2 className="size-4" />
                {t('notifications.clear')}
              </Button>
            )}
          </>
        }
      />

      {/* ---------- ფილტრი: ყველა · წაუკითხავი, და ტიპი ---------- */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <CutTabs
          layout="inline"
          options={[
            { key: 'all', label: t('filter.all'), count: counts?.total, icon: Bell, color: 'var(--tool-notifications)' },
            { key: 'unread', label: t('notifications.unread'), count: counts?.unread, icon: BellDot, color: 'var(--primary)' },
          ]}
          value={unreadOnly ? 'unread' : 'all'}
          onChange={(key) => setFilter('show', key === 'unread' ? 'unread' : null)}
        />
        {types.length > 1 && (
          <Select value={type || ALL_TYPES} onValueChange={(value) => setFilter('type', value === ALL_TYPES ? null : value)}>
            <SelectTrigger className="w-64" aria-label={t('notifications.typeFilter')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TYPES}>{t('notifications.allTypes')}</SelectItem>
              {types.map(([key, count]) => (
                <SelectItem key={key} value={key}>
                  {notificationTitle(t, key)} ({count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {list.isLoading ? (
        <div className="text-muted-foreground">{t('api.loading')}</div>
      ) : list.isError ? (
        <QueryErrorState error={list.error} onRetry={list.refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          kind="bell"
          title={unreadOnly || type ? t('notifications.emptyFiltered') : t('notifications.empty')}
          actions={
            unreadOnly || type ? (
              <Button variant="outline" onClick={() => setParams({}, { replace: true })}>
                <X className="size-4" />
                {t('filter.clear')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* ---------- მონიშვნის ზოლი: ამ გვერდის ყველა + მოქმედებები მონიშნულებზე ---------- */}
          <div className="mb-2 flex min-h-9 flex-wrap items-center gap-2" data-testid="bulk-bar">
            <button
              type="button"
              role="checkbox"
              aria-checked={allOnPage}
              onClick={() => setSelected(allOnPage ? new Set() : new Set(items.map((n) => n.id)))}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <SelectMark checked={allOnPage} size="sm" />
              {chosen.length > 0 ? t('notifications.selected', { count: chosen.length }) : t('notifications.selectPage')}
            </button>
            {chosen.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => bulk.mutate('read')} disabled={bulk.isPending}>
                  <MailOpen className="size-4" />
                  {t('notifications.markRead')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => bulk.mutate('unread')} disabled={bulk.isPending}>
                  <Mail className="size-4" />
                  {t('notifications.markUnread')}
                </Button>
                <Button variant="destructiveOutline" size="sm" onClick={() => void askBulkDelete()} disabled={bulk.isPending}>
                  <Trash2 className="size-4" />
                  {t('actions.delete')}
                </Button>
              </>
            )}
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {items.map((n) => {
              const Icon = notificationIcon(n.type)
              const line = notificationDetail(n, t, i18n.language)
              const isRead = !!n.read_at

              return (
                <li key={n.id} className="flex items-start gap-3 px-3 py-3" data-testid="notification-row" data-read={isRead}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected.has(n.id)}
                    aria-label={t('notifications.select')}
                    onClick={() => toggle(n.id)}
                    className="mt-1 cursor-pointer"
                  >
                    <SelectMark checked={selected.has(n.id)} size="sm" />
                  </button>

                  <button
                    data-kind="row"
                    type="button"
                    onClick={() => open(n)}
                    className="flex min-w-0 flex-1 cursor-pointer gap-2.5 text-left"
                  >
                    <span
                      className={cn(
                        'mt-0.5 grid size-8 shrink-0 place-items-center rounded-md',
                        isRead ? 'bg-secondary text-muted-foreground' : 'bg-primary/15 text-primary',
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('flex items-center gap-2 text-sm', isRead ? 'text-muted-foreground' : 'font-medium')}>
                        {notificationTitle(t, n.type)}
                        {/* წაუკითხავის წერტილი — დაჭერამდე რჩება */}
                        {!isRead && <span className="size-2 shrink-0 rounded-full bg-primary" data-testid="unread-dot" />}
                      </span>
                      {line && <span className="mt-0.5 block text-sm text-muted-foreground">{line}</span>}
                      <span className="mt-0.5 block text-xs text-muted-foreground" title={fmt.dateTime(n.created_at)}>
                        {fmt.relative(n.created_at)}
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {/* ფრანჩაიზს ნაწილი აკლია: ერთი დაჭერით დამატება, ან „აღარ შემახსენო" */}
                    {n.type === 'franchise_part' && <FranchisePartActions notification={n} onChanged={refresh} />}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => (isRead ? unread.mutate(n.id) : read.mutate(n.id))}
                      disabled={read.isPending || unread.isPending}
                    >
                      {isRead ? <Mail className="size-4" /> : <MailOpen className="size-4" />}
                      {isRead ? t('notifications.markUnread') : t('notifications.markRead')}
                    </Button>
                    <Button variant="destructiveOutline" size="sm" onClick={() => remove.mutate(n.id)} disabled={remove.isPending}>
                      <Trash2 className="size-4" />
                      {t('actions.delete')}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>

          <Pagination {...list.pagination} />
        </>
      )}
    </PageContainer>
  )
}
